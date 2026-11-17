// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const users = new Map<string, any>();

const pool = {
  connect: vi.fn(async () => ({
    query: async (sql: string, params: any[] = []) => pool.query(sql, params),
    release: vi.fn(),
  })),
  query: vi.fn(async (sql: string, params: any[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.startsWith('select * from users where lower(username) = lower($1) limit 1')) {
      const row = [...users.values()].find(user => user.username.toLowerCase() === String(params[0]).toLowerCase());
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('select * from users where id = $1')) {
      const row = users.get(params[0]);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('select id from users where lower(username) = lower($1) and id <> $2')) {
      const row = [...users.values()].find(
        user => user.username.toLowerCase() === String(params[0]).toLowerCase() && user.id !== params[1]
      );
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('select id from users where lower(username) = lower($1)')) {
      const row = [...users.values()].find(user => user.username.toLowerCase() === String(params[0]).toLowerCase());
      return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set failed_login_attempts = 0, locked_until = null')) {
      const row = users.get(params[0]);
      if (row) {
        row.failed_login_attempts = 0;
        row.locked_until = null;
      }
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('update users set username = $1, password = $2, name = $3')) {
      const row = users.get(params[4]);
      if (row) {
        const hadHash = typeof row.password === 'string' && row.password.startsWith('$2');
        row.username = params[0];
        row.password = params[1];
        row.name = params[2];
        row.password_history = JSON.parse(params[3]);
        row.is_approved = hadHash ? row.is_approved : true;
        row.password_changed_at = new Date().toISOString();
        row.must_change_password = false;
        row.failed_login_attempts = 0;
        row.locked_until = null;
        row.reset_requested = false;
      }
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.startsWith('insert into users')) {
      const [id, username, password, name, role] = params;
      const row = {
        id,
        username,
        password,
        name,
        role,
        is_approved: true,
        joined_date: new Date().toISOString(),
        password_history: [],
        must_change_password: false,
        mfa_enabled: false,
      };
      users.set(id, row);
      return { rows: [row], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  }),
};

vi.mock('./db', () => ({
  getPool: () => pool,
  isDatabaseConfigured: () => true,
  ensureDatabaseSchema: async () => undefined,
}));

const { accountProvisionHandler, canProvisionAccountRole, loginHandler } = await import('./auth');
const bcrypt = await import('bcryptjs');

function makeRes() {
  const res: any = { statusCode: 0, payload: undefined, headers: {} as Record<string, any> };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.payload = data; return res; };
  res.setHeader = (name: string, value: string) => { res.headers[name] = value; };
  return res;
}

function makeReq(body: any, cookie = '') {
  return {
    method: 'POST',
    body,
    headers: {
      origin: 'http://localhost',
      host: 'localhost',
      'sec-fetch-site': 'same-origin',
      ...(cookie ? { cookie } : {}),
    },
  };
}

async function call(handler: any, body: any, cookie = '') {
  const res = makeRes();
  await handler(makeReq(body, cookie), res);
  return res;
}

function seedActor(role = 'Assistant_Secretary') {
  const actor = {
    id: 'actor-1',
    username: 'assistant.secretary',
    password: bcrypt.hashSync('Vq7#mLowpZ2x', 4),
    plainPassword: 'Vq7#mLowpZ2x',
    name: 'Assistant Secretary',
    role,
    is_approved: true,
    mfa_enabled: false,
    failed_login_attempts: 0,
    locked_until: null,
    password_history: [],
  };
  users.set(actor.id, actor);
  return actor;
}

async function sessionFor(actor: any) {
  const response = await call(loginHandler, {
    username: actor.username,
    password: actor.plainPassword,
  });
  expect(response.statusCode).toBe(200);
  return String(response.headers['Set-Cookie']).split(';')[0];
}

describe('account provisioning', () => {
  beforeEach(() => {
    users.clear();
    pool.query.mockClear();
  });

  it('lets an Assistant Secretary create an approved Member with a server-side password hash', async () => {
    const actor = seedActor();
    const cookie = await sessionFor(actor);
    const response = await call(accountProvisionHandler, {
      id: 'member-1',
      username: 'new.member',
      password: 'Zx9#pQrT4vWn',
      name: 'New Member',
      role: 'Member',
    }, cookie);

    expect(response.statusCode).toBe(200);
    const row = users.get('member-1');
    expect(row.is_approved).toBe(true);
    expect(row.password).toMatch(/^\$2/);
    await expect(bcrypt.compare('Zx9#pQrT4vWn', row.password)).resolves.toBe(true);
    expect(response.payload.user).not.toHaveProperty('password');
  }, 20000);

  it('does not let a Secretary create officer accounts', async () => {
    const actor = seedActor();
    const cookie = await sessionFor(actor);
    const response = await call(accountProvisionHandler, {
      id: 'officer-1',
      username: 'new.treasurer',
      password: 'Zx9#pQrT4vWn',
      name: 'New Treasurer',
      role: 'Treasurer',
    }, cookie);

    expect(response.statusCode).toBe(403);
    expect(users.has('officer-1')).toBe(false);
  });

  it('completes an offline profile placeholder but does not approve an existing pending registration', async () => {
    const actor = seedActor();
    const cookie = await sessionFor(actor);
    users.set('member-placeholder', {
      id: 'member-placeholder',
      username: 'offline.member',
      password: '',
      name: 'Offline Member',
      role: 'Member',
      is_approved: false,
      password_history: [],
    });
    users.set('pending-member', {
      id: 'pending-member',
      username: 'pending.member',
      password: bcrypt.hashSync('Old#Password123', 4),
      name: 'Pending Member',
      role: 'Member',
      is_approved: false,
      password_history: [],
    });

    const placeholderResponse = await call(accountProvisionHandler, {
      id: 'member-placeholder',
      username: 'offline.member',
      password: 'Zx9#pQrT4vWn',
      name: 'Offline Member',
      role: 'Member',
    }, cookie);
    const pendingResponse = await call(accountProvisionHandler, {
      id: 'pending-member',
      username: 'pending.member',
      password: 'Zx9#pQrT4vWn',
      name: 'Pending Member',
      role: 'Member',
    }, cookie);

    expect(placeholderResponse.statusCode).toBe(200);
    expect(users.get('member-placeholder').is_approved).toBe(true);
    expect(pendingResponse.statusCode).toBe(200);
    expect(users.get('pending-member').is_approved).toBe(false);
  }, 20000);

  it('limits role creation by role while allowing the President to create officers', () => {
    expect(canProvisionAccountRole('Assistant_Secretary', 'Member')).toBe(true);
    expect(canProvisionAccountRole('Secretary', 'Treasurer')).toBe(false);
    expect(canProvisionAccountRole('President', 'Treasurer')).toBe(true);
    expect(canProvisionAccountRole('President', 'President')).toBe(false);
  });
});
