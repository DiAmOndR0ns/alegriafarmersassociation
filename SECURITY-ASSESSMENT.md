# AFA Farmers Association — Security Assessment

Scope: the Express + Vite + React / Supabase application in this repository
(`server.ts`, `src/api/*`, `src/utils/*`). Testing was white-box (source review
plus targeted regression tests); no internet-facing host was attacked.
Verified with `npm run lint` (tsc) and `npm run test` (99 tests, all passing).

## Findings and remediation

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| F-01 | High | Stored XSS: bulk-sync records (members, announcements, products, activities, minutes, logs, funds) accepted raw HTML. React escapes on render, but exports/print views have no second line of defence. | Fixed — `src/api/sanitize.ts`, applied in every `saveFullStateToPostgres` mapper |
| F-02 | High | Public `/api/auth/login` returned the TOTP secret to anyone holding a password, letting an attacker enrol their own authenticator and defeat MFA. | Fixed — login returns only a short-lived challenge token; the key is released separately by `POST /api/auth/mfa/enroll` (see F-13) |
| F-03 | High | Privilege escalation: only the President may sync `users`, and a synced row carried `role`, `passwordHash`, `mfaEnabled` and `isApproved`, so a compromised President session could mint a new President. | Fixed — credentials dropped, roles flattened to `Member` unless authorised by a `roleUpdate` in the same request, new accounts start unapproved |
| F-04 | High | Unapproved accounts could sign in: `getAuthenticatedUser` never checked `is_approved`, so the client-side approval prompt was the only gate. | Fixed — session lookup now requires an approved account (fail-closed) |
| F-05 | Medium | Session/webhook token secret fell back to the database URL or a hard-coded string; anyone knowing it could forge a session cookie. Tokens also had no audience claim, so a session token was accepted as an MFA challenge. | Fixed — random per-process fallback, `FAMS_SESSION_SEED` opt-in, `aud` claim enforced |
| F-06 | Medium | MFA was enforced only for the President although Treasurer/Secretary/Auditor control money and records. | Fixed — `MFA_ENFORCED_ROLES` |
| F-07 | Medium | Public `/api/db/status` echoed raw driver errors (host, port, user, sometimes the connection string). | Fixed — fixed reason strings, full error logged server-side only |
| F-08 | Medium | No security headers: no CSP, `X-Frame-Options`, `nosniff`, referrer policy; `X-Powered-By` disclosed; unhandled errors could surface stack traces. | Fixed — `server.ts` middleware + JSON error handler, hardened `sendResponse` |
| F-09 | Medium | Password policy allowed the association name and seasonal words (`BafaFarmers2026!`, `Christmas2026!x`). | Fixed — context-word and season lists, repeated-pattern check |
| F-10 | Low | Audit-chain hashes were unkeyed, so anyone with DB write access could edit a log and recompute every hash except the tip. | Improved — chain is now keyed (`AUDIT_CHAIN_KEY`). Also strips non-hex hash values. Note: the key is shipped in the bundle because verification runs client-side; real tamper evidence needs server-side re-verification |
| F-11 | Low | Login had no bound on credential length, letting a caller force bcrypt work; member egg-harvest rows had no upper bound; financial rows accepted arbitrary `type` and non-numeric amounts. | Fixed — length/shape guards |
| F-12 | Low | `roleUpdate` and plain user sync could act on any `userId`, including accounts the caller does not manage. | Partially mitigated — role updates are now the only path to a role change; finer ownership checks still recommended |
| F-13 | — | (Introduced by the F-02 fix, then closed) Removing the secret from login left no way for a new officer to enrol an authenticator, so MFA-protected accounts were permanently locked out. | Fixed — `POST /api/auth/mfa/enroll` releases the setup key once to the password-verified caller (bootstrap callers excepted); `/api/auth/mfa/reset` plus a console action clears a lost device. Nobody can read another officer's secret |

## Verified as sound

- All SQL uses parameterised queries; the only interpolated identifiers come from
  the fixed `ENTITY_TABLE_MAP` / `APP_TABLES` allow-lists.
- Cookies are `HttpOnly`, `SameSite=Strict`, `Secure` in production.
- Session tokens are HMAC-signed and compared in constant time.
- TOTP is replay-protected via `totp_last_used_step` and locks out after repeated failures.
- Account lockout (5 attempts / 15 minutes) is applied server-side.
- `POST /api/auth/bootstrap` is disabled unless a ≥32-character secret is configured,
  compares in constant time, and refuses a second President.
- Cross-origin state-changing requests are rejected (`Sec-Fetch-Site` / `Origin`).
- Deletion endpoints are President-only and refuse to remove the active or a President account.
- No `eval`, `new Function`, `dangerouslySetInnerHTML`, or `target="_blank"` without `noopener`.
- Request bodies are capped at 1 MiB by `parseRequestBody` (Express itself allows 15 MB).

## Residual risks / recommended follow-ups

1. **Server-side audit verification.** Recompute the log chain on the server with a
   secret the client never sees, and expose a "verify" endpoint for officers.
2. **Offline mode trusts localStorage.** Without a database the app authenticates
   against local hashes and the localStorage key is stored next to the ciphertext,
   so anyone with device access can sign in as any officer. Treat offline mode as
   single-operator only.
3. **Per-account authorization.** `push`/`delete` gate by role, not by record
   ownership; any Treasurer can overwrite any ledger row. Add ownership checks for
   officer-managed records.
4. **Rate limiting.** Lockout is per-account; add per-IP throttling in front of
   `/api/auth/*` (Vercel/Cloudflare rule or middleware).
5. ~~**MFA enrolment path.**~~ Closed by F-13: `POST /api/auth/mfa/enroll` and
   `POST /api/auth/mfa/reset`, plus a "Reset 2FA" action in the officer console.
6. **Secrets hygiene.** Set `SESSION_SECRET` (≥32 chars), `APP_ORIGIN`, and
   optionally `FAMS_SESSION_SEED` in the deployment environment; never commit `.env.local`.

## Regression tests

`src/utils/pentestDefenses.test.ts` pins F-01 through F-05 and the audit-chain check.
`src/api/authMfa.test.ts` pins F-02 and F-13 end-to-end: login never returns a key,
enrolment succeeds for a new officer, re-enrolment works after a reset, and the
reset endpoint enforces step-up plus the President/Secretary/self authority rules.
`src/api/db.test.ts` now also asserts that `/api/db/status` does not echo raw errors.
