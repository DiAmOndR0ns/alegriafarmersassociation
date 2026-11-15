// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTotpCode } from '../utils/totp';

/**
 * Covers the MFA enrolment path: `/api/auth/login` must never release a TOTP
 * secret, `/api/auth/mfa/enroll` releases it once to the password-verified
 * caller, and `/api/auth/mfa/reset` destroys it with step-up authorisation.
 */

const users = new Map<string, any>();

/** A pooled client whose queries share the same fake store as the pool. */
function clientFor() {
  return {
    query: async (sql: string, params?: any[]) => pool.query(sql, params),
    release: vi.fn(),
  };
}

const pool = {
  connect: vi.fn(async () => clientFor()),
  query: vi.fn(async (sql: string, params: any[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.startsWith('select * from users where id = $1')) {
      const row = users.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('select * from users where lower(username)')) {
      const row = [...users.values()].find(
        u => u.username.toLowerCase() === String(params[0]).toLowerCase()
      );
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set pending_totp_secret')) {
      const row = users.get(params[1]);
      if (row) row.pending_totp_secret = params[0];
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set totp_secret = null')) {
      const row = users.get(params[0]);
      if (row) {
        row.totp_secret = null;
        row.pending_totp_secret = params[1];
        row.mfa_enabled = false;
        row.totp_last_used_step = null;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set totp_secret = $1, pending_totp_secret = null')) {
      const row = users.get(params[2]);
      if (row) {
        row.totp_secret = params[0];
        row.pending_totp_secret = null;
        row.mfa_enabled = true;
        row.totp_last_used_step = Number(params[1]);
      }
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  }),
};

vi.mock('./db', () => ({
  getPool: () => pool,
  isDatabaseConfigured: () => true,
  ensureDatabaseSchema: async () => undefined,
}));

const { loginHandler, mfaEnrollHandler, mfaConfirmHandler, mfaResetHandler } = await import('./auth');
const bcrypt = await import('bcryptjs');

function makeRes() {
  const res: any = { statusCode: 0, payload: undefined, headers: {} as Record<string, any> };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.payload = data; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; };
  return res;
}

const req = (body: any, headers: Record<string, string> = {}) => ({
  method: 'POST',
  body,
  headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin', ...headers },
});

async function call(handler: any, body: any, headers?: Record<string, string>) {
  const res = makeRes();
  await handler(req(body, headers), res);
  return res;
}

function seedUser(overrides: Record<string, any> = {}) {
  const user = {
    id: 'user-treasurer',
    username: 'treasurer',
    password: bcrypt.hashSync('Vq7#mLowpZ2x', 4),
    name: 'Treasurer',
    role: 'Treasurer',
    is_approved: true,
    mfa_enabled: false,
    totp_secret: null as string | null,
    pending_totp_secret: null as string | null,
    totp_last_used_step: null as number | null,
    failed_login_attempts: 0,
    locked_until: null as string | null,
    password_history: [],
    ...overrides,
  };
  users.set(user.id, user);
  return user;
}

/** Signs a user in and returns the `fams_session=...` cookie pair. */
async function sessionFor(user: any): Promise<string> {
  const body: Record<string, string> = { username: user.username, password: user.plainPassword };
  if (user.totp_secret) body.totpCode = await generateTotpCode(user.totp_secret);
  const res = await call(loginHandler, body);
  const cookie = String(res.headers['Set-Cookie'] || '').split(';')[0];
  expect(cookie).toContain('fams_session=');
  return cookie;
}

describe('login never releases the TOTP secret (F-02)', () => {
  beforeEach(() => users.clear());

  it('asks for enrolment without returning a key while the account has none', async () => {
    seedUser({ plainPassword: 'Vq7#mLowpZ2x' });
    const res = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    expect(res.payload.mfaSetupRequired).toBe(true);
    expect(res.payload.challengeToken).toBeTruthy();
    expect(res.payload.secret).toBeUndefined();
    expect(res.payload.otpauthUrl).toBeUndefined();
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('asks for the code without returning the stored key once enrolled', async () => {
    seedUser({ totp_secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' });
    const res = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    expect(res.payload.mfaRequired).toBe(true);
    expect(res.payload.secret).toBeUndefined();
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});

describe('re-enrolment after a reset', () => {
  beforeEach(() => users.clear());

  it('releases a fresh key once the previous one was destroyed', async () => {
    seedUser();
    const first = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    const firstEnroll = await call(mfaEnrollHandler, { challengeToken: first.payload.challengeToken });
    const firstCode = await generateTotpCode(firstEnroll.payload.secret);
    await call(mfaConfirmHandler, { challengeToken: first.payload.challengeToken, totpCode: firstCode });

    // Simulate the officer console clearing the authenticator.
    const user = users.get('user-treasurer')!;
    user.totp_secret = null;
    user.mfa_enabled = false;
    user.pending_totp_secret = null;

    const again = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    expect(again.payload.mfaSetupRequired).toBe(true);
    const secondEnroll = await call(mfaEnrollHandler, { challengeToken: again.payload.challengeToken });
    expect(secondEnroll.statusCode).toBe(200);
    expect(secondEnroll.payload.secret).not.toBe(firstEnroll.payload.secret);

    const secondCode = await generateTotpCode(secondEnroll.payload.secret);
    const confirmed = await call(mfaConfirmHandler, { challengeToken: again.payload.challengeToken, totpCode: secondCode });
    expect(confirmed.statusCode).toBe(200);
  });
});

describe('enrolment completes for a brand-new officer', () => {
  beforeEach(() => users.clear());

  it('releases the setup key once, then accepts a real authenticator code', async () => {
    seedUser();
    const login = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    const challengeToken = login.payload.challengeToken;

    const enroll = await call(mfaEnrollHandler, { challengeToken });
    expect(enroll.statusCode).toBe(200);
    expect(enroll.payload.secret).toMatch(/^[A-Z2-7]{16,}$/);

    const code = await generateTotpCode(enroll.payload.secret);
    const confirm = await call(mfaConfirmHandler, { challengeToken, totpCode: code });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.payload.success).toBe(true);
    expect(confirm.headers['Set-Cookie']).toContain('fams_session=');
    expect(users.get('user-treasurer')!.totp_secret).toBe(enroll.payload.secret);
  });

  it('refuses an enrolment challenge it cannot verify', async () => {
    seedUser();
    const forged = await call(mfaEnrollHandler, { challengeToken: 'not-a-real-token' });
    expect(forged.statusCode).toBe(401);
    expect(forged.payload.secret).toBeUndefined();
  });

  it('refuses to re-issue a key for an already enrolled account', async () => {
    seedUser({ totp_secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', mfa_enabled: true });
    // An enrolled account is only ever offered an `mfa-login` challenge, so the
    // setup endpoint must reject it — never hand back the shipped secret.
    const login = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    expect(login.payload.mfaRequired).toBe(true);
    const enroll = await call(mfaEnrollHandler, { challengeToken: login.payload.challengeToken });
    expect(enroll.statusCode).toBe(401);
    expect(enroll.payload.secret).toBeUndefined();
  });

  it('rejects a wrong code at confirmation', async () => {
    seedUser();
    const login = await call(loginHandler, { username: 'treasurer', password: 'Vq7#mLowpZ2x' });
    const enroll = await call(mfaEnrollHandler, { challengeToken: login.payload.challengeToken });
    const wrong = await generateTotpCode(enroll.payload.secret, Date.now() + 30 * 60 * 1000);
    const confirm = await call(mfaConfirmHandler, { challengeToken: login.payload.challengeToken, totpCode: wrong });
    expect(confirm.statusCode).toBe(401);
    expect(users.get('user-treasurer')!.totp_secret).toBeNull();
  });
});

describe('two-factor reset is authorised and requires step-up', () => {
  beforeEach(() => users.clear());

  function seedPresident(plainPassword = 'Zx9#pQrT4vWn') {
    return seedUser({
      id: 'user-president',
      username: 'president',
      name: 'President',
      role: 'President',
      password: bcrypt.hashSync(plainPassword, 4),
      plainPassword,
      totp_secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      mfa_enabled: true,
    });
  }

  function seedAuditor() {
    return seedUser({
      id: 'user-auditor',
      username: 'auditor',
      name: 'Auditor',
      role: 'Auditor',
      plainPassword: 'Wm4@kTrE8bQs',
      totp_secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      mfa_enabled: true,
    });
  }

  it('lets the President reset an officer authenticator without revealing the new key', async () => {
    const president = seedPresident();
    const auditor = seedAuditor();
    const cookie = await sessionFor(president);

    const res = await call(
      mfaResetHandler,
      { targetUserId: auditor.id, currentPassword: 'Zx9#pQrT4vWn' },
      { cookie }
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload.secret).toBeUndefined();
    expect(users.get(auditor.id)!.totp_secret).toBeNull();
    expect(users.get(auditor.id)!.pending_totp_secret).toBeTruthy();
  });

  it('rejects a reset without the acting officer password', async () => {
    const president = seedPresident();
    const auditor = seedAuditor();
    const cookie = await sessionFor(president);

    const res = await call(
      mfaResetHandler,
      { targetUserId: auditor.id, currentPassword: 'wrong-password' },
      { cookie }
    );
    expect(res.statusCode).toBe(401);
    expect(users.get(auditor.id)!.totp_secret).not.toBeNull();
  });

  it('stops the Secretary from resetting an officer authenticator', async () => {
    const secretary = seedUser({
      id: 'user-secretary',
      username: 'secretary',
      name: 'Secretary',
      role: 'Secretary',
      password: bcrypt.hashSync('Yh3!nBvC7kLp', 4),
      plainPassword: 'Yh3!nBvC7kLp',
      totp_secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      mfa_enabled: true,
    });
    const cookie = await sessionFor(secretary);
    const auditor = seedAuditor();

    const res = await call(
      mfaResetHandler,
      { targetUserId: auditor.id, currentPassword: 'Yh3!nBvC7kLp' },
      { cookie }
    );
    expect(res.statusCode).toBe(403);
    expect(users.get(auditor.id)!.totp_secret).not.toBeNull();
  });

  it('never lets another officer reset the President', async () => {
    const president = seedPresident();
    const treasurer = seedUser({
      plainPassword: 'Vq7#mLowpZ2x',
      totp_secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      mfa_enabled: true,
    });
    const cookie = await sessionFor(treasurer);

    const res = await call(
      mfaResetHandler,
      { targetUserId: president.id, currentPassword: 'Vq7#mLowpZ2x' },
      { cookie }
    );
    expect(res.statusCode).toBe(403);
    expect(users.get(president.id)!.totp_secret).not.toBeNull();
  });
});
