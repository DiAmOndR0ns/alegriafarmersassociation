// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { saveFullStateToPostgres } from './db';
import { sanitizeUserRows } from './sanitize';

function makePool(existingUser?: { id: string; role: string }) {
  let userUpsert: { sql: string; values?: unknown[] } | undefined;
  const client = {
    async query(sql: string, values?: unknown[]) {
      if (sql.includes("to_regclass('public.members')")) {
        return { rows: [{ members_table: 'members' }] };
      }
      if (sql.startsWith('SELECT id, role FROM users')) {
        return { rows: existingUser ? [existingUser] : [] };
      }
      if (sql.includes('INSERT INTO users')) userUpsert = { sql, values };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { connect: async () => client } as unknown as Pool;

  return {
    pool,
    userUpsert: () => userUpsert,
  };
}

describe('synced user approval state', () => {
  it('does not overwrite an existing approval from a sanitized profile', async () => {
    const { pool, userUpsert } = makePool({ id: 'existing-user', role: 'Member' });
    const users = sanitizeUserRows([{
      id: 'existing-user',
      username: 'member1',
      name: 'Member One',
      role: 'Member',
      isApproved: true,
    }]);

    await saveFullStateToPostgres(pool, { users });

    const upsert = userUpsert();
    expect(users[0]).not.toHaveProperty('isApproved');
    expect(upsert?.values?.[5]).toBe(false);
    expect(upsert?.sql.split('ON CONFLICT (id) DO UPDATE SET')[1]).not.toMatch(/\bis_approved\s*=/i);
  });

  it('inserts new synced users as unapproved', async () => {
    const { pool, userUpsert } = makePool();

    await saveFullStateToPostgres(pool, {
      users: sanitizeUserRows([{
        id: 'new-user',
        username: 'member2',
        name: 'Member Two',
        role: 'Member',
        isApproved: true,
      }]),
    });

    expect(userUpsert()?.values?.[5]).toBe(false);
  });
});
