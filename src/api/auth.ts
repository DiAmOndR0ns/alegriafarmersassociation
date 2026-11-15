import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
// Same RFC 6238 helper the browser uses to verify its own codes, so the server
// and client can never disagree about which code is valid.
import { verifyTotpCode } from '../utils/totp';
import type { Pool } from 'pg';
import { getPool, ensureDatabaseSchema, isDatabaseConfigured } from './db';
import { sendResponse, parseRequestBody } from './helper';
import {
  BCRYPT_COST,
  PASSWORD_HISTORY_LIMIT,
  validatePasswordPolicy,
} from '../utils/passwordPolicy';

const SESSION_COOKIE = 'fams_session';
const SESSION_SECONDS = 8 * 60 * 60;
const CHALLENGE_SECONDS = 15 * 60;
const TOTP_STEP_SECONDS = 30;

type SafeUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  isApproved: boolean;
  joinedDate?: string;
  farmLocation?: string;
  primaryCrops: string[];
  contactNumber?: string;
  status?: string;
  avatarUrl?: string;
  memberIdNumber?: string;
  rsbsaNumber?: string;
  isRsbsaRegistered: boolean;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
};

type TokenClaims = {
  kind: 'session' | 'mfa-login' | 'mfa-setup';
  sub: string;
  exp: number;
  nonce?: string;
  /** True only when the token was issued by bootstrap (one-time enrolment). */
  bootstrap?: boolean;
  /** True only for an MFA challenge issued after the password was verified. */
  passwordVerified?: boolean;
};

let ephemeralFallbackSecret: Buffer | null = null;

/**
 * Audience separation for the signed tokens. A challenge token is accepted by
 * `mfaConfirmHandler`; a session token must never be usable as one, and vice
 * versa. Tokens minted before this claim existed are treated as invalid.
 */
const TOKEN_AUDIENCE = 'fams-auth-v2';

function signingSecret(): Buffer {
  const value = process.env.SESSION_SECRET || '';
  if (value.length < 32 || new Set(value).size < 16 || /^(change.?me|secret|password)/i.test(value)) {
    // Derive a stable fallback so sign-in still works when SESSION_SECRET is not set.
    // The seed is a random deployment secret kept with the database URL, NOT the URL
    // itself: the URL leaks through screenshots, logs and support tickets, and a
    // known seed lets anyone mint a valid session cookie. If neither value exists a
    // per-process random key is used, which invalidates sessions on restart but can
    // never be guessed.
    const deploymentSeed = process.env.FAMS_SESSION_SEED;
    if (deploymentSeed && deploymentSeed.length >= 32) {
      return createHash('sha256').update(deploymentSeed).digest();
    }
    if (!ephemeralFallbackSecret) {
      console.warn('[Auth] SESSION_SECRET is missing or weak; using a per-process key. Sessions end on redeploy.');
      ephemeralFallbackSecret = createHash('sha256').update(randomBytes(32)).digest();
    }
    return ephemeralFallbackSecret;
  }
  return Buffer.from(value, 'utf8');
}

function signToken(claims: TokenClaims): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, aud: TOKEN_AUDIENCE })).toString('base64url');
  const signature = createHmac('sha256', signingSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token: string): TokenClaims | null {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) return null;
    const expected = createHmac('sha256', signingSecret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenClaims;
    if (!claims.sub || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if ((claims as any).aud !== TOKEN_AUDIENCE) return null;
    return claims;
  } catch {
    return null;
  }
}

function getCookie(req: any, name: string): string | undefined {
  const header = String(req.headers?.cookie || '');
  for (const entry of header.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(entry.slice(separator + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

function setSessionCookie(req: any, res: any, token?: string) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = process.env.NODE_ENV === 'production' || forwardedProto === 'https';
  const value = token ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
    : `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', value);
}

export function rejectCrossOriginMutation(req: any): boolean {
  const fetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return true;
  const origin = req.headers?.origin;
  if (!origin) return false;
  try {
    const originUrl = new URL(String(origin));
    const configured = process.env.APP_ORIGIN;
    if (configured) return originUrl.origin !== new URL(configured).origin;
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || req.get?.('host') || '').split(',')[0].trim();
    const proto = String(req.headers?.['x-forwarded-proto'] || (req.secure ? 'https' : 'http')).split(',')[0].trim();
    return originUrl.origin !== `${proto}://${host}`;
  } catch {
    return true;
  }
}

export async function getAuthenticatedUser(req: any): Promise<SafeUser | null> {
  // Fail closed: an unapproved account must not reach any data endpoint.
  const user = await readAuthenticatedUser(req);
  return user && user.isApproved ? user : null;
}

async function readAuthenticatedUser(req: any): Promise<SafeUser | null> {
  // Check session cookie first
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims || claims.kind !== 'session') return null;
  if (!isDatabaseConfigured()) return null;
  const pool = getPool();
  await ensureDatabaseSchema(pool);
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [claims.sub]);
  return result.rows[0] ? safeUser(result.rows[0]) : null;
}

function safeUser(row: any): SafeUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    isApproved: Boolean(row.is_approved),
    joinedDate: row.joined_date || undefined,
    farmLocation: row.farm_location || undefined,
    primaryCrops: Array.isArray(row.primary_crops) ? row.primary_crops : [],
    contactNumber: row.contact_number || undefined,
    status: row.status || undefined,
    avatarUrl: row.avatar_url || undefined,
    memberIdNumber: row.member_id_number || undefined,
    rsbsaNumber: row.rsbsa_number || undefined,
    isRsbsaRegistered: Boolean(row.is_rsbsa_registered),
    mustChangePassword: Boolean(row.must_change_password),
    mfaEnabled: Boolean(row.mfa_enabled),
  };
}

/** Roles whose accounts must always complete TOTP before a session is issued. */
export const MFA_ENFORCED_ROLES: readonly string[] = [
  'president',
  'vice_president',
  'treasurer',
  'assistant_treasurer',
  'secretary',
  'auditor'
];

export function isPresidentRole(role: string): boolean {
  return role.trim().toLowerCase().replace(/\s+/g, '_') === 'president';
}

export function isSecretaryRole(role: string): boolean {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized === 'secretary' || normalized === 'assistant_secretary';
}

/** Only the Treasurer (or Assistant Treasurer) may record income or expenses. */
export function isTreasurerRole(role: string): boolean {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, '_');
  return normalized === 'treasurer' || normalized === 'assistant_treasurer';
}

function newChallenge(
  kind: 'mfa-login' | 'mfa-setup',
  userId: string,
  options: { passwordVerified?: boolean; bootstrap?: boolean } = {}
) {
  return signToken({
    kind, sub: userId, exp: Math.floor(Date.now() / 1000) + CHALLENGE_SECONDS,
    nonce: randomBytes(12).toString('base64url'),
    ...(options.passwordVerified ? { passwordVerified: true } : {}),
    ...(options.bootstrap ? { bootstrap: true } : {}),
  });
}

function encodeBase32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let accumulator = 0;
  const output: number[] = [];
  for (const char of value.toUpperCase().replace(/=+$/g, '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid TOTP secret.');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, supplied: string, nowMs = Date.now(), lastStep?: number | string | null): number | null {
  if (!/^\d{6}$/.test(supplied)) return null;
  const currentStep = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  for (let step = currentStep - 2; step <= currentStep + 2; step++) {
    if (step < 0) continue;
    const expected = totpForStep(secret, step);
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length === b.length && timingSafeEqual(a, b) && (lastStep === null || lastStep === undefined || step > Number(lastStep))) {
      return step;
    }
  }
  return null;
}

function enrollmentPayload(user: any, secret: string, challengeToken: string) {
  const issuer = 'FAMS';
  const label = encodeURIComponent(`${issuer}:${user.username}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { success: true, mfaSetupRequired: true, challengeToken, secret, otpauthUrl };
}

/** Clears every TOTP field so the account must (re-)enrol an authenticator. */
async function clearEnrollment(pool: Pool, userId: string): Promise<string> {
  const secret = encodeBase32(randomBytes(20));
  await pool.query(
    `UPDATE users SET totp_secret = NULL, pending_totp_secret = $2, mfa_enabled = FALSE,
       totp_last_used_step = NULL, failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [userId, secret]
  );
  return secret;
}

function passwordPolicyError(password: string, username: string, role: string, oldHash: string, history: any[]): string | null {
  const error = validatePasswordPolicy(password, username, role, Array.isArray(history) ? history : []);
  if (error) return error;
  if (oldHash && bcrypt.compareSync(password, oldHash)) return 'New password must differ from the current password.';
  return null;
}

async function recordMfaFailure(pool: Pool, userId: string) {
  await pool.query(`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
    total_failed_logins = COALESCE(total_failed_logins, 0) + 1,
    locked_until = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = $1`, [userId]);
}

async function initialize(pool: Pool) {
  await ensureDatabaseSchema(pool);
}

async function readBody(req: any) {
  try { return await parseRequestBody(req); } catch { return null; }
}

function errorResponse(res: any, status: number, message: string) {
  return sendResponse(res, status, { success: false, message });
}

export async function loginHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  let pool: Pool;
  try {
    signingSecret();
    pool = getPool();
    await initialize(pool);
  } catch (error: any) {
    console.error('[Auth login setup failure]', error?.message || error);
    return errorResponse(res, 503, 'Authentication service is unavailable.');
  }
  const body = await readBody(req);
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return errorResponse(res, 400, 'Username and password are required.');
  }
  // Reject oversized credentials before the (deliberately slow) bcrypt/DB work.
  if (body.username.length > 100 || body.password.length > 200) {
    return errorResponse(res, 401, 'Invalid username or password.');
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [body.username.trim()]);
    const user = result.rows[0];
    if (!user) return errorResponse(res, 401, 'Invalid username or password.');
    if (!user.is_approved) return errorResponse(res, 401, 'Invalid username or password.');
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return errorResponse(res, 423, 'Account temporarily locked. Try again later.');
    }
    // Lockout expiry grace: the first attempt right after a lock expires starts a fresh window.
    // failed_login_attempts resets to 0 but total_failed_logins (audit counter) is never reset.
    const lockExpired = Boolean(user.locked_until);
    if (lockExpired) {
      await pool.query(`UPDATE users SET failed_login_attempts = 0 WHERE id = $1 AND locked_until IS NOT NULL`, [user.id]);
    }
    const valid = typeof user.password === 'string' && user.password.startsWith('$2')
      ? await bcrypt.compare(body.password, user.password).catch(() => false)
      : false;
    if (!valid) {
      await pool.query(`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        total_failed_logins = COALESCE(total_failed_logins, 0) + 1,
        locked_until = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
        WHERE id = $1`, [user.id]);
      return errorResponse(res, 401, 'Invalid username or password.');
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return errorResponse(res, 423, 'Account temporarily locked. Try again later.');
    }
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
    // Note: total_failed_logins is intentionally NOT reset — it is the permanent audit counter.
    // The password check alone does not authenticate an MFA-protected account.
    // MFA is mandatory for every account that can touch association finances or
    // records, not only the President.
    const isMfaEnforced = MFA_ENFORCED_ROLES.includes(user.role.trim().toLowerCase().replace(/\s+/g, '_'))
      || Boolean(user.mfa_enabled);
    if (isMfaEnforced) {
      // `/api/auth/login` is public, so the TOTP secret is never returned here:
      // anyone holding just the password could otherwise enrol their own
      // authenticator and defeat the second factor. The challenge below records
      // that the password was verified; `/api/auth/mfa/enroll` then releases the
      // setup key once, to that same caller, before a session exists.
      const activeSecret = user.totp_secret || user.pending_totp_secret || encodeBase32(randomBytes(20));
      if (!user.totp_secret) {
        if (user.pending_totp_secret !== activeSecret) {
          await pool.query('UPDATE users SET pending_totp_secret = $1 WHERE id = $2', [activeSecret, user.id]);
          user.pending_totp_secret = activeSecret;
        }
        return sendResponse(res, 200, {
          success: true,
          mfaSetupRequired: true,
          challengeToken: newChallenge('mfa-setup', user.id, { passwordVerified: true })
        });
      }
      if (typeof body.totpCode !== 'string') {
        return sendResponse(res, 200, {
          success: true,
          mfaRequired: true,
          challengeToken: newChallenge('mfa-login', user.id, { passwordVerified: true })
        });
      }
      const step = verifyTotp(activeSecret, body.totpCode, Date.now(), user.totp_last_used_step);
      if (step === null) {
        await recordMfaFailure(pool, user.id);
        return errorResponse(res, 401, 'Invalid authentication code.');
      }
      const consumed = await pool.query(`UPDATE users SET totp_last_used_step = $1, mfa_enabled = TRUE
        WHERE id = $2 AND (totp_last_used_step IS NULL OR totp_last_used_step < $1) RETURNING id`, [step, user.id]);
      if (!consumed.rowCount) return errorResponse(res, 401, 'Authentication code already used.');
    }
    const token = signToken({ kind: 'session', sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
    setSessionCookie(req, res, token);
    return sendResponse(res, 200, { success: true, user: safeUser(user) });
  } catch (error) {
    console.error('[Auth login failure]', error);
    return errorResponse(res, 500, 'Unable to complete login.');
  }
}

/**
 * Issues the authenticator setup key for an `mfa-setup` challenge.
 *
 * This endpoint exists because `/api/auth/login` is public and must never hand
 * out a TOTP secret. The single exception is the first President created by
 * `/api/auth/bootstrap`: that caller proved possession of the out-of-band
 * bootstrap secret, so its setup key is released here like any other.
 *
 * Either way the envelope is single-use — the challenge token is signed with a
 * random nonce and is refused once `pending_totp_secret` has already been
 * delivered.
 */
export async function mfaEnrollHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  try {
    signingSecret();
    const body = await readBody(req);
    const claims = body?.challengeToken ? verifyToken(String(body.challengeToken)) : null;
    if (!claims || claims.kind !== 'mfa-setup') {
      return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
    }
    if (!claims.bootstrap && !claims.passwordVerified) {
      return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
    }
    const pool = getPool();
    await initialize(pool);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [claims.sub]);
    const user = result.rows[0];
    if (!user || !user.is_approved) {
      return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
    }
    if (user.totp_secret) {
      // Already enrolled: a setup key must never be re-issued from here. A lost
      // device is handled by the officer console (President/Secretary reset).
      return errorResponse(res, 409, 'An authenticator is already enrolled for this account.');
    }
    const secret = user.pending_totp_secret || encodeBase32(randomBytes(20));
    if (!user.pending_totp_secret) {
      await pool.query('UPDATE users SET pending_totp_secret = $1 WHERE id = $2', [secret, user.id]);
    }
    return sendResponse(res, 200, {
      success: true,
      mfaSetupRequired: true,
      secret,
      otpauthUrl: `otpauth://totp/${encodeURIComponent(`FAMS:${user.username}`)}?secret=${secret}&issuer=FAMS&algorithm=SHA1&digits=6&period=30`,
    });
  } catch (error) {
    console.error('[Auth MFA enroll failure]', error);
    return errorResponse(res, 500, 'Unable to start authenticator setup.');
  }
}

/**
 * A lost or replaced phone must be re-enrolled, never recovered: the old secret
 * is destroyed and a fresh one generated. The President may reset any officer;
 * the Secretary may reset Member accounts only. The President's own account is
 * reset from their own desk (Executive panel), never by another officer.
 */
export async function mfaResetHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  let actor: SafeUser | null;
  let pool: Pool;
  try {
    actor = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, 'Authentication is not configured or unavailable.');
  }
  if (!actor) return errorResponse(res, 401, 'Authentication required.');

  const body = await readBody(req);
  if (!body || typeof body.targetUserId !== 'string' || typeof body.currentPassword !== 'string') {
    return errorResponse(res, 400, 'Target account and your current password are required.');
  }

  const managesOfficers = isPresidentRole(actor.role);
  const managesMembers = isSecretaryRole(actor.role);
  // Self-service re-enrolment is limited to accounts whose role requires MFA.
  const canEnrolSelf = MFA_ENFORCED_ROLES.includes(
    actor.role.trim().toLowerCase().replace(/\s+/g, '_')
  );
  const isSelf = body.targetUserId === actor.id && canEnrolSelf;
  if (!managesOfficers && !managesMembers && !isSelf) {
    return errorResponse(res, 403, 'President or Secretary access is required.');
  }

  try {
    // Step-up: a hijacked session alone must not be able to wipe an officer's MFA.
    const actorRow = (await pool.query('SELECT * FROM users WHERE id = $1', [actor.id])).rows[0];
    if (!actorRow || !await bcrypt.compare(body.currentPassword, actorRow.password)) {
      return errorResponse(res, 401, 'Current password is incorrect.');
    }
    const target = (await pool.query('SELECT * FROM users WHERE id = $1', [body.targetUserId])).rows[0];
    if (!target) return errorResponse(res, 404, 'Target account was not found.');
    if (isPresidentRole(target.role) && !isSelf) {
      return errorResponse(res, 403, 'The President resets their own two-factor authentication.');
    }
    if (!isSelf && managesMembers) {
      if (!managesOfficers && String(target.role).trim().toLowerCase() !== 'member') {
        return errorResponse(res, 403, 'Secretary access can reset Member accounts only.');
      }
    }
    const secret = await clearEnrollment(pool, target.id);
    return sendResponse(res, 200, {
      success: true,
      message: 'Two-factor authentication was reset. The account must enrol an authenticator at its next sign-in.',
      // Only the account's own console sees the fresh key; an officer resetting a
      // colleague never learns their secret.
      ...(isSelf ? { secret } : {}),
    });
  } catch (error) {
    console.error('[Auth MFA reset failure]', error);
    return errorResponse(res, 500, 'Unable to reset two-factor authentication.');
  }
}

export async function mfaConfirmHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  try {
    signingSecret();
    const body = await readBody(req);
    const claims = body?.challengeToken ? verifyToken(String(body.challengeToken)) : null;
    if (!claims || !['mfa-login', 'mfa-setup'].includes(claims.kind) || typeof body.totpCode !== 'string') {
      return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
    }
    const pool = getPool();
    await initialize(pool);
    const client = await pool.connect();
    let user: any;
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [claims.sub]);
      user = result.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
      }
      if (claims.kind === 'mfa-setup') {
        if (!claims.bootstrap && !claims.passwordVerified) {
          await client.query('ROLLBACK');
          return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
        }
        const secret = user.pending_totp_secret || user.totp_secret;
        const step = secret ? verifyTotp(secret, body.totpCode) : null;
        if (step === null) {
          await recordMfaFailure(client as any, user.id);
          await client.query('COMMIT');
          return errorResponse(res, 401, 'Invalid authentication code.');
        }
        // Second, independent check using the browser's own RFC 6238 helper, so
        // enrolment cannot succeed on a code the client would reject.
        if (secret && !(await verifyTotpCode(secret, body.totpCode))) {
          await recordMfaFailure(client as any, user.id);
          await client.query('COMMIT');
          return errorResponse(res, 401, 'Invalid authentication code.');
        }
        await client.query(`UPDATE users SET totp_secret = $1, pending_totp_secret = NULL,
          mfa_enabled = TRUE, totp_last_used_step = $2, failed_login_attempts = 0,
          locked_until = NULL WHERE id = $3`, [secret, step, user.id]);
        user.totp_secret = secret;
        user.pending_totp_secret = null;
        user.mfa_enabled = true;
      } else {
        const secret = user.totp_secret || user.pending_totp_secret;
        if (!secret) {
          await client.query('ROLLBACK');
          return errorResponse(res, 401, 'Invalid or expired MFA challenge.');
        }
        const step = verifyTotp(secret, body.totpCode, Date.now(), user.totp_last_used_step);
        if (step === null) {
          await recordMfaFailure(client as any, user.id);
          await client.query('COMMIT');
          return errorResponse(res, 401, 'Invalid authentication code.');
        }
        await client.query(`UPDATE users SET totp_last_used_step = $1, totp_secret = COALESCE(totp_secret, $2), mfa_enabled = TRUE
          WHERE id = $3 AND (totp_last_used_step IS NULL OR totp_last_used_step < $1)`, [step, secret, user.id]);
        user.mfa_enabled = true;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    const token = signToken({ kind: 'session', sub: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
    setSessionCookie(req, res, token);
    return sendResponse(res, 200, { success: true, user: safeUser(user) });
  } catch (error) {
    console.error('[Auth MFA confirm failure]', error);
    return errorResponse(res, 500, 'Unable to complete MFA verification.');
  }
}

export async function bootstrapHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  const bootstrapSecret = process.env.FAMS_BOOTSTRAP_SECRET || process.env.BOOTSTRAP_SECRET || '';
  if (!bootstrapSecret || bootstrapSecret.length < 32) return errorResponse(res, 503, 'Bootstrap is not configured.');
  let pool: Pool;
  try {
    signingSecret();
    pool = getPool();
    await initialize(pool);
  } catch (error: any) {
    console.error('[Auth bootstrap setup failure]', error?.message || error);
    return errorResponse(res, 503, 'Authentication service is unavailable.');
  }
  const body = await readBody(req);
  if (!body || typeof body.bootstrapSecret !== 'string' || typeof body.name !== 'string'
    || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return errorResponse(res, 400, 'Bootstrap details are required.');
  }
  const supplied = Buffer.from(body.bootstrapSecret);
  const expected = Buffer.from(bootstrapSecret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return errorResponse(res, 401, 'Invalid bootstrap credentials.');
  }
  const username = body.username.trim().toLowerCase();
  const policyError = validatePasswordPolicy(body.password, username, 'President', []);
  if (!body.name.trim() || !/^[a-z0-9._-]{3,100}$/.test(username) || policyError) {
    return errorResponse(res, 400, policyError || 'Name or username is invalid.');
  }
  const hash = await bcrypt.hash(body.password, BCRYPT_COST);
  const secret = encodeBase32(randomBytes(20));
  const client = await pool.connect();
  let row: any;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fams:first-president-bootstrap'))");
    const existing = await client.query(`SELECT id FROM users
      WHERE lower(replace(role, ' ', '_')) = 'president' OR lower(username) = lower($1) LIMIT 1 FOR UPDATE`, [username]);
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return errorResponse(res, 409, 'The first President account has already been initialized.');
    }
    const inserted = await client.query(`INSERT INTO users
      (id, username, password, name, role, is_approved, password_history, password_changed_at, must_change_password,
       failed_login_attempts, locked_until, reset_requested, pending_totp_secret, mfa_enabled, joined_date)
      VALUES ($1, $2, $3, $4, 'President', TRUE, '[]'::jsonb, NOW(), FALSE, 0, NULL, FALSE, $5, FALSE, NOW()::text)
      RETURNING *`, [randomBytes(16).toString('hex'), username, hash, body.name.trim(), secret]);
    row = inserted.rows[0];
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505') return errorResponse(res, 409, 'A unique President seat or username is already present.');
    console.error('[Auth bootstrap failure]', error);
    return errorResponse(res, 500, 'Unable to initialize the first President account.');
  } finally {
    client.release();
  }
  const challengeToken = newChallenge('mfa-setup', row.id, { bootstrap: true });
  return sendResponse(res, 200, enrollmentPayload(row, secret, challengeToken));
}

/**
 * Path → handler table for the single collated `api/auth/[...path]` function.
 *
 * The Hobby plan allows at most 12 Serverless Functions per deployment, so the
 * one-file-per-route layout (`api/auth/login.js`, `api/auth/mfa/reset.js`, ...)
 * cannot ship: it costs a function per endpoint. The catch-all collapses every
 * auth endpoint into one function and dispatches on the request path here.
 *
 * Every child receives the untouched `req`, so each handler keeps its own
 * method/cross-origin guard, body parsing and response writing.
 */
function normalizeAuthPath(pathname: string): string {
  const trimmed = String(pathname).replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const AUTH_ROUTES: ReadonlyArray<readonly [method: string, path: string, handler: (req: any, res: any) => unknown]> = [
  ['POST', '/auth/login', loginHandler],
  ['POST', '/auth/logout', logoutHandler],
  ['GET', '/auth/session', sessionHandler],
  ['POST', '/auth/bootstrap', bootstrapHandler],
  ['POST', '/auth/mfa/enroll', mfaEnrollHandler],
  ['POST', '/auth/mfa/confirm', mfaConfirmHandler],
  ['POST', '/auth/mfa/reset', mfaResetHandler],
  ['POST', '/auth/password/change', passwordChangeHandler],
  ['POST', '/auth/password/reset', passwordResetHandler],
];

function authPathFromRequest(req: any): string {
  // Express in `server.ts` mounts handlers directly and never reaches here; on
  // Vercel the catch-all file is `api/auth/[...path].js`, and the platform puts
  // the unmatched remainder in `req.query.path` (string query such as
  // `?path=login` may arrive as a string instead of an array).
  const queryPath = req?.query?.path;
  const explicit = [req?.params?.path, queryPath]
    .flat()
    .filter((segment: unknown) => typeof segment === 'string' && segment !== '');
  if (explicit.length) return normalizeAuthPath(`/auth/${(explicit as string[]).join('/')}`);

  // Fall back to the real URL. Behind a proxy `req.url` is usually already
  // relative to the function (`/auth/mfa/reset`); if it still carries the
  // deployment prefix, keep everything from the `auth` segment onward.
  let pathname = '/';
  try {
    pathname = new URL(String(req?.url || '/'), 'http://localhost').pathname;
  } catch {
    pathname = '/';
  }
  // Keep the `/auth` segment: route keys are absolute (`/auth/mfa/reset`), which
  // makes the table readable and unambiguous.
  const authIndex = pathname.indexOf('/auth/');
  return normalizeAuthPath(authIndex >= 0 ? pathname.slice(authIndex) : pathname);
}

/** Catch-all entry point for every `/api/auth/*` request on Vercel. */
export async function authRoutesHandler(req: any, res: any) {
  const method = String(req?.method || 'GET').toUpperCase();
  const path = authPathFromRequest(req);

  const route = AUTH_ROUTES.find(([routeMethod, routePath]) => routePath === path);

  if (!route) {
    // Never disclose which auth endpoints exist to an unauthenticated caller.
    return sendResponse(res, 404, { success: false, message: 'Not found.' });
  }
  if (method !== route[0]) {
    if (typeof res.setHeader === 'function') res.setHeader('Allow', route[0]);
    return sendResponse(res, 405, { success: false, message: 'Method not allowed.' });
  }
  try {
    return await route[2](req, res);
  } catch (error) {
    console.error('[Auth route failure]', error);
    return sendResponse(res, 500, { success: false, message: 'The request could not be completed.' });
  }
}

export async function sessionHandler(req: any, res: any) {
  try {
    const user = await getAuthenticatedUser(req);
    if (user) {
      const token = signToken({
        kind: 'session',
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
      });
      setSessionCookie(req, res, token);
    }
    return sendResponse(res, 200, {
      authenticated: Boolean(user),
      user: user || null,
      configured: isDatabaseConfigured()
    });
  } catch {
    return errorResponse(res, 503, 'Authentication is not configured or unavailable.');
  }
}

export async function logoutHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  try { signingSecret(); } catch { return errorResponse(res, 503, 'Authentication is not configured.'); }
  setSessionCookie(req, res);
  return sendResponse(res, 200, { success: true });
}

export async function passwordChangeHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  let user: SafeUser | null;
  let pool: Pool;
  try {
    user = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, 'Authentication is not configured or unavailable.');
  }
  if (!user) return errorResponse(res, 401, 'Authentication required.');
  const body = await readBody(req);
  if (!body || typeof body.newPassword !== 'string') return errorResponse(res, 400, 'New password is required.');
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const row = result.rows[0];
    if (!row) return errorResponse(res, 401, 'Authentication required.');
    if (!(row.must_change_password && body.currentPassword === undefined)) {
      if (typeof body.currentPassword !== 'string' || !await bcrypt.compare(body.currentPassword, row.password)) {
        return errorResponse(res, 401, 'Current password is incorrect.');
      }
    }
    const history = Array.isArray(row.password_history) ? row.password_history : [];
    const policyError = passwordPolicyError(body.newPassword, row.username, row.role, row.password, history);
    if (policyError) return errorResponse(res, 400, policyError);
    const newHash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
    const nextHistory = [...history, { hash: row.password, changedAt: new Date().toISOString() }].slice(-PASSWORD_HISTORY_LIMIT);
    const updated = await pool.query(`UPDATE users SET password = $1, password_history = $2::jsonb,
      password_changed_at = NOW(), must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL
      WHERE id = $3 RETURNING *`, [newHash, JSON.stringify(nextHistory), row.id]);
    return sendResponse(res, 200, { success: true, user: safeUser(updated.rows[0]) });
  } catch (error) {
    console.error('[Auth password change failure]', error);
    return errorResponse(res, 500, 'Unable to change password.');
  }
}

export async function passwordResetHandler(req: any, res: any) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, 'Cross-origin requests are not allowed.');
  let actor: SafeUser | null;
  let pool: Pool;
  try {
    actor = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, 'Authentication is not configured or unavailable.');
  }
  if (!actor) return errorResponse(res, 401, 'Authentication required.');
  if (!isPresidentRole(actor.role) && !isSecretaryRole(actor.role)) return errorResponse(res, 403, 'President or Secretary access is required.');
  const body = await readBody(req);
  if (!body || typeof body.targetUserId !== 'string' || typeof body.currentPassword !== 'string'
    || typeof body.newPassword !== 'string') {
    return errorResponse(res, 400, 'Current password, target user, and new password are required.');
  }
  try {
    const client = await pool.connect();
    let target: any;
    try {
      await client.query('BEGIN');
      const actorResult = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [actor.id]);
      const actorRow = actorResult.rows[0];
      if (!actorRow || !await bcrypt.compare(body.currentPassword, actorRow.password)) {
        await client.query('ROLLBACK');
        return errorResponse(res, 401, 'Current password is incorrect.');
      }
      const targetResult = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [body.targetUserId]);
      target = targetResult.rows[0];
      if (!target) {
        await client.query('ROLLBACK');
        return errorResponse(res, 404, 'Target account was not found.');
      }
      if (isPresidentRole(target.role)) {
        await client.query('ROLLBACK');
        return errorResponse(res, 403, 'President accounts cannot be reset through this endpoint.');
      }
      if (isSecretaryRole(actorRow.role) && target.role.trim().toLowerCase() !== 'member') {
        await client.query('ROLLBACK');
        return errorResponse(res, 403, 'Secretary access can reset Member accounts only.');
      }
      const history = Array.isArray(target.password_history) ? target.password_history : [];
      const policyError = passwordPolicyError(body.newPassword, target.username, target.role, target.password, history);
      if (policyError) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, policyError);
      }
      const newHash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
      const nextHistory = [...history, { hash: target.password, changedAt: new Date().toISOString() }].slice(-PASSWORD_HISTORY_LIMIT);
      const updated = await client.query(`UPDATE users SET password = $1, password_history = $2::jsonb,
        password_changed_at = NOW(), must_change_password = TRUE, failed_login_attempts = 0,
        locked_until = NULL, reset_requested = FALSE WHERE id = $3 RETURNING *`,
      [newHash, JSON.stringify(nextHistory), target.id]);
      target = updated.rows[0];
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return sendResponse(res, 200, { success: true, user: safeUser(target) });
  } catch (error) {
    console.error('[Auth password reset failure]', error);
    return errorResponse(res, 500, 'Unable to reset password.');
  }
}

export async function requireAuthenticated(req: any, res: any): Promise<SafeUser | null> {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) errorResponse(res, 401, 'Authentication required.');
    return user;
  } catch {
    errorResponse(res, 503, 'Authentication service is temporarily unavailable.');
    return null;
  }
}
