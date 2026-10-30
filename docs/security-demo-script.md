# FAMS — Security Features Demo Script

**Use:** live walkthrough or narration track for the recorded demo video.
**Target length:** 5–8 minutes.
**Rule:** every feature below is actually implemented in the codebase (file references included so evaluators can verify).

---

## Opening (30 seconds)

> "The Alegria Farmers Association Management System handles member records, organizational funds, and audit-sensitive financial data. Security is enforced at every layer: password storage, login, session management, multi-factor authentication, encryption at rest, role-based access control, and a tamper-evident audit trail."

---

## 1. Password Security — Hashing & Policy Enforcement (~90 sec)

**Show:** login/sign-up with a weak password, then a strong one.

- Passwords are hashed with **bcrypt at cost 12** — never stored in plaintext
  (`src/utils/passwordPolicy.ts`: `BCRYPT_COST = 12`, `hashPassword()`).
- Password policy enforced on entry (`validatePasswordPolicy()`):
  - Minimum **12 characters**
  - Requires uppercase, lowercase, digit, and special character
  - Cannot contain the username, role, or the word "password"
  - Blocks sequential/keyboard patterns (`qwerty`, `12345`, etc.)
  - Blocks reuse of the **last 5 passwords** (compared against stored hashes)
- **Demo action:** type `password123` — show the rejection message. Then type a compliant password — accepted.

## 2. Account Lockout — Brute-Force Protection (~45 sec)

**Show:** deliberately enter a wrong password repeatedly.

- After **5 consecutive failed attempts**, the account locks for **15 minutes**
  (`MAX_LOGIN_ATTEMPTS = 5`, `LOCKOUT_DURATION_MS`, `registerFailedLogin()`, enforced server-side in `src/api/auth.ts` via `locked_until`).
- **Demo action:** fail login 5 times; the server responds with the lockout message and a countdown.

## 3. Multi-Factor Authentication — TOTP (~90 sec)

**Show:** enabling MFA for a privileged officer account (President role), then logging in with an authenticator app.

- Full **RFC-compatible TOTP implementation** (`src/utils/totp.ts`):
  - 6-digit codes, 30-second window, HMAC-SHA1 via Web Crypto
  - Codes generated from a **cryptographically random secret** (`crypto.getRandomValues` — the code refuses to fall back to `Math.random`, which would defeat MFA)
  - Verification uses a **constant-time comparison** to prevent timing attacks, and accepts only ±1 time-step (90 s tolerance)
- The **President role has MFA mandatory** (enforced at the database level: `mfa_enabled` auto-enabled for president accounts — see schema migration in `api/auth/session.js`).
- Login flow: username + password → short-lived signed challenge token → 6-digit code → session issued.
- **Demo action:** scan the QR code with Google Authenticator, log in with password + rotating code; show the code changing every 30 seconds.

## 4. Session Management — HMAC-Signed Tokens (~60 sec)

**Show:** DevTools → Application → Cookies.

- Sessions are **HttpOnly, HMAC-SHA256-signed tokens** (`fams_session` cookie, 8-hour expiry) — implemented in `src/api/auth.ts` (`signToken`/`verifyToken`).
  - Payload: subject + expiry + nonce; signature verified with **timing-safe comparison** (`timingSafeEqual`)
  - HttpOnly = JavaScript on a compromised page cannot read the session cookie (mitigates XSS session theft)
  - Signing key comes from the `SESSION_SECRET` environment variable — never hard-coded in the repo
- **Demo action:** open DevTools, show the `fams_session` cookie and point out it's HttpOnly; then manually corrupt part of the token's signature and refresh — the session is rejected (server returns `authenticated: false`). This demonstrates tamper detection.

## 5. Encryption at Rest — AES-GCM Local Storage (~60 sec)

**Show:** DevTools → Application → Local Storage.

- All sensitive client-side cached data (member records, drafts, sync queue) is **encrypted with AES-256-GCM before it touches localStorage** (`src/utils/secureStorage.ts`).
  - Random 12-byte IV generated per write; 256-bit key generated via Web Crypto
  - Records prefixed `bafa:v1:` hold `{iv, data}` ciphertext only
  - Automatic migration of any legacy plaintext, with verification before the plaintext copy is removed
- **Demo action:** open Local Storage while the app is loaded — every record is unreadable ciphertext. This is real "encryption in action" visible on screen.

## 6. Role-Based Access Control — Restricted Access Enforcement (~90 sec)

**Show:** two browser windows — log in as President, then as an ordinary Member.

- Role is checked on every view/dashboard (`src/components/*View.tsx`) and re-verified **server-side on every API call** (`getAuthenticatedUser()` in `src/api/auth.ts` re-loads the user from the database — the client's claimed role is never trusted).
- Role-gated capabilities:
  - Only **Treasurer** records/approves financial transactions
  - Only **Auditor** sets audit status on transactions and certifies reports
  - Only **Secretary** manages meeting minutes
  - Only **President** approves accounts and delegates authority (delegation_requests workflow)
  - Ordinary members see read-only dashboards
  - Mutations from **cross-origin requests are rejected** (`rejectCrossOriginMutation` → 403), blocking CSRF-style abuse
- **Demo action:** as a Member, attempt to open the Treasurer's financial-entry view via URL manipulation — access is denied.

## 7. Tamper-Evident Audit Trail (~45 sec)

**Show:** the System Logs view.

- Every security-relevant action (login, password change, financial edit, deletion) is written to `system_logs` with a **SHA-256 hash chain**: each entry stores `hash` of its content plus the `previous_hash` of the prior entry (`src/utils/audit.ts`, `sha256()`).
- Any retroactive edit to the log breaks the chain — the tampering is provable.
- Password history is stored only as hashes (`password_history` JSONB), never plaintext.
- **Demo action:** show the log entries and their linked hash chain (optionally: explain that recomputing a hash mismatches if a row were edited in the database).

## 8. Account Recovery Hardening (~30 sec, brief)

- Reset requests require **server-side approval state** (`reset_requested` flag) — a reset cannot be self-initiated into an arbitrary account.
- Officers' accounts start with cryptographically generated initial passwords (`generateInitialPassword()` — crypto-random, guaranteed policy-compliant), and officers must rotate them.

---

## Closing (20 seconds)

> "In summary: passwords are bcrypt-hashed and policy-enforced; brute force is met with account lockout; privileged accounts require TOTP multi-factor authentication; sessions are HMAC-signed HttpOnly tokens; data cached in the browser is AES-GCM encrypted; access is role-restricted and verified server-side on every request; and an immutable hash-chained audit log records every sensitive action. Security isn't a feature bolted onto this system — it's the foundation."

---

## Demo Preparation Checklist

- [ ] Two test accounts ready: one **Member**, one **President/Treasurer** (with MFA reset/re-scan capability)
- [ ] A weak-password attempt ready to paste (`password123`)
- [ ] Wrong password ready ×5 for the lockout demo (do this last, or on a spare account, to avoid locking your demo account)
- [ ] Authenticator app installed with the demo account's TOTP already enrolled
- [ ] DevTools open on Application → Cookies and Local Storage tabs
- [ ] Recording: use OBS/Zoom screen recording at 1080p; narrate slowly, one feature per scene
- [ ] If recording instead of live: do a dry run once — the TOTP and lockout segments are the easiest to fumble

## Feature → File Reference (for evaluators)

| Feature | Source |
|---|---|
| bcrypt hashing (cost 12), password policy, lockout | `src/utils/passwordPolicy.ts` |
| TOTP MFA implementation | `src/utils/totp.ts` |
| Signed session tokens, HttpOnly cookie, server-side auth check | `src/api/auth.ts` |
| AES-GCM encrypted localStorage | `src/utils/secureStorage.ts` |
| SHA-256 hash-chain audit log | `src/utils/audit.ts` |
| Role-gated dashboards | `src/components/*View.tsx` |
| Server-enforced schema / MFA-mandatory president | `api/auth/session.js` (migrations) |
