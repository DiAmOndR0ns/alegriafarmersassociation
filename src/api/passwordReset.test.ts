// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { generateTotpCode } from '../utils/totp';

/**
 * Regression cover for the Secretary-initiated credential reset.
 *
 * The role guard compared the raw `role` column against the lowercase literal
 * `'member'`. Member accounts are created as `role: 'Member'`, so once a role
 * was stored with different casing or whitespace the guard rejected the reset
 * and the console reported "the password reset was rejected", which reads like
 * a wrong step-up password. These tests pin the normalisation.
 */

const users = new Map<string, any>();
let activeDelegations: any[] = [];

function clientFor() {
  const client: any = {
    query: async (sql: string, params?: any[]) => pool.query(sql, params),
    release: vi.fn(),
  };
  return client;
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
        u => String(u.username).toLowerCase() === String(params[0]).toLowerCase()
      );
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set password =')) {
      const row = users.get(params[2]);
      if (row) {
        row.password = params[0];
        row.password_history = JSON.parse(params[1]);
        row.must_change_password = true;
      }
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('from delegation_requests')) {
      const rows = activeDelegations.filter(
        d => d.requested_by === params[0] && d.status === 'Approved'
      );
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('./db', () => ({
  getPool: () => pool,
  isDatabaseConfigured: () => true,
  ensureDatabaseSchema: async () => undefined,
}));

const { passwordResetHandler, isMemberRole } = await import('./auth');

const PLAIN = 'Yh3!nBvC7kLp';

function seed(overrides: Record<string, any>) {
  const user = {
    id: 'user-x',
    username: 'userx',
    password: bcrypt.hashSync(PLAIN, 4),
    name: 'User X',
    role: 'Member',
    is_approved: true,
    mfa_enabled: false,
    password_history: [],
    must_change_password: false,
    failed_login_attempts: 0,
    locked_until: null as string | null,
    reset_requested: false,
    ...overrides,
  };
  users.set(user.id, user);
  return user;
}

function makeRes() {
  const res: any = { statusCode: 0, payload: undefined, headers: {} as Record<string, any> };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.payload = data; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; };
  return res;
}

function makeReq(body: any, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    url: '/api/auth/password/reset',
    body,
    headers: { origin: 'http://localhost', host: 'localhost', 'sec-fetch-site': 'same-origin', ...headers },
  };
}

/**
 * Signs the actor in fully. The Secretary is an MFA-enforced role, so the first
 * sign-in returns an enrolment challenge rather than a session cookie; complete
 * it and return the session cookie the reset endpoint authenticates with.
 */
async function cookieFor(user: any): Promise<string> {
  const { loginHandler, mfaEnrollHandler, mfaConfirmHandler } = await import('./auth');

  const loginRes = makeRes();
  await loginHandler(makeReq({ username: user.username, password: PLAIN }), loginRes);

  if (loginRes.headers['Set-Cookie']) {
    return String(loginRes.headers['Set-Cookie']).split(';')[0];
  }

  expect(loginRes.payload.mfaSetupRequired).toBe(true);
  const enrollRes = makeRes();
  await mfaEnrollHandler(makeReq({ challengeToken: loginRes.payload.challengeToken }), enrollRes);

  const confirmRes = makeRes();
  await mfaConfirmHandler(
    makeReq({
      challengeToken: loginRes.payload.challengeToken,
      totpCode: await generateTotpCode(enrollRes.payload.secret),
    }),
    confirmRes
  );

  const cookie = String(confirmRes.headers['Set-Cookie'] || '').split(';')[0];
  expect(cookie).toContain('fams_session=');
  return cookie;
}

describe('isMemberRole', () => {
  it('accepts every casing and whitespace the column may hold', () => {
    for (const value of ['Member', 'member', 'MEMBER', ' Member ', 'member\t']) {
      expect(isMemberRole(value), JSON.stringify(value)).toBe(true);
    }
  });

  it('does not treat other roles as members', () => {
    for (const value of ['Board_Member', 'Board Member', 'Assistant_Secretary', '', null, undefined]) {
      expect(isMemberRole(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe('Secretary-initiated password reset', () => {
  beforeEach(() => {
    users.clear();
    activeDelegations = [];
  });

  const seedSecretary = () => seed({
    id: 'user-secretary',
    username: 'secretary',
    name: 'Secretary',
    role: 'Secretary',
  });

  /** Signs the seeded Secretary in and returns the session cookie. */
  const secretaryCookie = async () => cookieFor(users.get('user-secretary'));

  for (const role of ['Member', ' member ', 'MEMBER']) {
    it(`resets a member account stored as ${JSON.stringify(role)}`, async () => {
      seedSecretary();
      const member = seed({ id: 'user-member', username: 'member1', name: 'Member One', role });
      const cookie = await secretaryCookie();

      const res = makeRes();
      await passwordResetHandler(
        makeReq({ targetUserId: member.id, currentPassword: PLAIN, newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload.success).toBe(true);
      expect(users.get(member.id)!.must_change_password).toBe(true);
    });
  }

  it('still refuses to reset an officer account', async () => {
    seedSecretary();
    const auditor = seed({ id: 'user-auditor', username: 'auditor', name: 'Auditor', role: 'Auditor' });
    const cookie = await secretaryCookie();

    const res = makeRes();
    await passwordResetHandler(
      makeReq({ targetUserId: auditor.id, currentPassword: PLAIN, newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload.message).toBe('Secretary access can reset Member accounts only.');
  });

  it('rejects a wrong step-up password before touching the target', async () => {
    seedSecretary();
    const member = seed({ id: 'user-member', username: 'member1', name: 'Member One', role: 'Member' });
    const cookie = await secretaryCookie();

    const res = makeRes();
    await passwordResetHandler(
      makeReq({ targetUserId: member.id, currentPassword: 'not-my-password', newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
      res
    );

    expect(res.statusCode).toBe(401);
    expect(res.payload.message).toBe('Current password is incorrect.');
    expect(users.get(member.id)!.must_change_password).toBe(false);
  });

  it('rejects a Vice President password reset without an active password_change delegation', async () => {
    const vp = seed({ id: 'user-vp', username: 'vicepresident', name: 'Vice President', role: 'Vice_President' });
    const member = seed({ id: 'user-member', username: 'member1', name: 'Member One', role: 'Member' });
    const cookie = await cookieFor(vp);

    const res = makeRes();
    await passwordResetHandler(
      makeReq({ targetUserId: member.id, currentPassword: PLAIN, newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
      res
    );

    expect(res.statusCode).toBe(403);
    expect(res.payload.message).toBe('An active password-change delegation from the President is required to reset passwords.');
    expect(users.get(member.id)!.must_change_password).toBe(false);
  });

  it('allows a delegated Vice President to reset officer/member passwords but never the President password', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const vp = seed({ id: 'user-vp', username: 'vicepresident', name: 'Vice President', role: 'Vice_President' });
    const president = seed({ id: 'user-president', username: 'president', name: 'President', role: 'President' });
    const auditor = seed({ id: 'user-auditor', username: 'auditor', name: 'Auditor', role: 'Auditor' });
    activeDelegations = [{
      id: 'delegation-1',
      requested_by: vp.id,
      reason: 'President travel',
      scopes: ['password_change'],
      requested_date: today,
      effective_start: today,
      effective_end: expiry,
      status: 'Approved',
    }];
    const cookie = await cookieFor(vp);

    // 1. Attempting to reset the President's password is always forbidden
    const presRes = makeRes();
    await passwordResetHandler(
      makeReq({ targetUserId: president.id, currentPassword: PLAIN, newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
      presRes
    );
    expect(presRes.statusCode).toBe(403);
    expect(presRes.payload.message).toBe('President accounts cannot be reset through this endpoint.');
    expect(users.get(president.id)!.must_change_password).toBe(false);

    // 2. Resetting a non-President officer succeeds when delegated
    const audRes = makeRes();
    await passwordResetHandler(
      makeReq({ targetUserId: auditor.id, currentPassword: PLAIN, newPassword: 'Nw8$rTyU2iOo' }, { cookie }),
      audRes
    );
    expect(audRes.statusCode).toBe(200);
    expect(audRes.payload.success).toBe(true);
    expect(users.get(auditor.id)!.must_change_password).toBe(true);
  });
});
