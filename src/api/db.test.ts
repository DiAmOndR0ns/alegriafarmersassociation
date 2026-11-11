// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cleanDatabaseUrl, getPool, isDatabaseConfigured, isLoopbackDatabaseUrl } from './db';

const originalUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

describe('isLoopbackDatabaseUrl', () => {
  it('detects local hosts in every common form', () => {
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@localhost:5432/afa_db')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@127.0.0.1:5432/afa_db')).toBe(true);
    expect(isLoopbackDatabaseUrl('postgresql://postgres:pw@[::1]:5432/afa_db')).toBe(true);
  });

  it('accepts hosted hosts', () => {
    expect(isLoopbackDatabaseUrl('postgresql://u:p@db.abcdefg.supabase.co:5432/postgres')).toBe(false);
    expect(isLoopbackDatabaseUrl('postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres')).toBe(false);
  });

  it('rejects a URL whose host merely contains the word localhost inside credentials', () => {
    expect(isLoopbackDatabaseUrl('postgresql://localhost:pw@db.abcdefg.supabase.co:5432/postgres')).toBe(false);
  });
});

describe('cleanDatabaseUrl', () => {
  it('always enables TLS and strips ssl query parameters', () => {
    const result = cleanDatabaseUrl('postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres?sslmode=disable&pgbouncer=true');
    expect(result.isSsl).toBe(true);
    expect(result.connectionString).not.toContain('sslmode');
    expect(result.connectionString).toContain('pgbouncer=true');
    expect(result.hostInfo).toContain('pooler.supabase.com:6543');
  });
});

describe('Supabase-only configuration', () => {
  it('treats a local DATABASE_URL as not configured', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:pw@localhost:5432/afa_db';
    expect(isDatabaseConfigured()).toBe(false);
  });

  it('treats a hosted Supabase DATABASE_URL as configured', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres';
    expect(isDatabaseConfigured()).toBe(true);
  });

  it('refuses to build a pool for a local database', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:pw@localhost:5432/afa_db';
    expect(() => getPool()).toThrow(/Supabase/);
  });
});

async function callStatusHandler() {
  const { default: statusHandler } = await import('./status');
  let payload: any;
  const res = {
    status(code: number) { this.code = code; return this; },
    json(data: any) { payload = data; return this; },
    code: 0,
  };
  await statusHandler({ method: 'GET' }, res);
  return payload;
}

describe('storage mode reporting', () => {
  it('reports Local when Supabase is not configured', async () => {
    process.env.DATABASE_URL = '';
    const payload = await callStatusHandler();

    expect(payload.storageMode).toBe('local');
    expect(payload.provider).toBe('Local');
    expect(payload.connected).toBe(false);
  });

  it('reports Local when DATABASE_URL points at localhost', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:pw@localhost:5432/afa_db';
    const payload = await callStatusHandler();

    expect(payload.storageMode).toBe('local');
    expect(payload.provider).toBe('Local');
  });

  it('reports Local when Supabase is configured but unreachable', async () => {
    // Reserved TEST-NET-1 address: never routable, so the connection attempt fails.
    process.env.DATABASE_URL = 'postgresql://u:p@192.0.2.1:6543/postgres';
    const payload = await callStatusHandler();

    expect(payload.connected).toBe(false);
    expect(payload.storageMode).toBe('local');
    expect(payload.provider).toBe('Local');
    expect(payload.error).toBeTruthy();
  }, 20000);
});
