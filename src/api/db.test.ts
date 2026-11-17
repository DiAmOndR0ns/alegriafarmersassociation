// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanDatabaseUrl,
  getPool,
  getTableStats,
  isDatabaseConfigured,
  isLoopbackDatabaseUrl,
  saveFullStateToPostgres
} from './db';

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

  it('verifies the database server TLS certificate', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres';
    expect((getPool() as any).options.ssl.rejectUnauthorized).toBe(true);
  });
});

describe('database table statistics', () => {
  it('counts all 17 application tables', async () => {
    const tableNames = [
      'users', 'members', 'meetings', 'resolutions', 'financial_transactions',
      'announcements', 'system_logs', 'afa_igp', 'afa_igp_expenses', 'products',
      'inventory', 'activities', 'achievements', 'organization_funds',
      'auditor_reports', 'delegation_requests', 'sync_queue'
    ];
    const row = Object.fromEntries(tableNames.map(name => [name, '1']));
    const pool = {
      connect: async () => ({
        query: async () => ({ rows: [row] }),
        release: () => undefined
      })
    };

    const stats = await getTableStats(pool as any);

    expect(Object.keys(stats.tableCounts)).toHaveLength(17);
    expect(stats.tableCounts.inventory).toBe(1);
    expect(stats.tableCounts.achievements).toBe(1);
    expect(stats.tableCounts.sync_queue).toBe(1);
    expect(stats.totalRecords).toBe(17);
  });
});

describe('persisted approval and transaction fields', () => {
  it('creates and saves meeting approvals and transaction purpose fields', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string, values?: unknown[]) => {
          queries.push({ sql, values });
          return { rows: [], rowCount: 1 };
        },
        release: () => undefined
      })
    };

    const transaction = {
      type: 'expense',
      category: 'Equipment',
      amount: 100,
      date: '2026-11-17',
      description: 'Purchase',
      recordedBy: 'Treasurer',
      purpose: 'Association equipment',
      liquidationDeadline: '2026-12-17',
      auditedStatus: 'Unaudited'
    };

    await saveFullStateToPostgres(pool as any, {
      activities: [{
        id: 'activity-1',
        title: 'Training',
        category: 'Training',
        scheduledDate: '2026-11-17',
        scheduledTime: '10:00',
        location: 'Alegria',
        description: '',
        organizer: 'PIO',
        status: 'Scheduled'
      }],
      meetings: [{
        id: 'meeting-1',
        title: 'Quarterly Meeting',
        date: '2026-11-17',
        location: 'Alegria',
        attendanceCount: 0,
        agenda: '',
        minutes: 'Approved minutes',
        officerInCharge: 'Secretary',
        attendanceRecord: {},
        minutesApprovalStatus: 'Approved',
        approvedBy: 'President',
        approvedDate: '2026-11-17',
        approvalRemarks: 'Confirmed'
      }],
      financialTransactions: [
        { ...transaction, id: 'transaction-1', activityId: 'activity-1' },
        {
          ...transaction,
          id: 'transaction-2',
          activityId: 'deleted-activity',
          purpose: undefined,
          liquidationDeadline: undefined
        }
      ]
    });

    const meetingInsert = queries.find(query => query.sql.includes('INSERT INTO meetings ('));
    const transactionInsert = queries.find(query =>
      query.sql.includes('INSERT INTO financial_transactions (') && query.values?.[0] === 'transaction-1'
    );
    const staleTransactionInsert = queries.find(query =>
      query.sql.includes('INSERT INTO financial_transactions (') && query.values?.[0] === 'transaction-2'
    );
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS inventory'))).toBe(true);
    expect(queries.some(query => query.sql.includes('financial_transactions_activity_id_fkey'))).toBe(true);
    expect(queries.some(query => query.sql.includes('inventory_catalog_product_id_fkey'))).toBe(true);
    expect(meetingInsert?.sql).toContain('minutes_approval_status');
    expect(meetingInsert?.values).toContain('Approved');
    expect(meetingInsert?.values).toContain('Confirmed');
    expect(transactionInsert?.values?.[7]).toBe('activity-1');
    expect(staleTransactionInsert?.values?.[7]).toBeNull();
    expect(transactionInsert?.sql).toContain('liquidation_deadline');
    expect(transactionInsert?.sql).toContain('purpose = COALESCE(EXCLUDED.purpose, financial_transactions.purpose)');
    expect(transactionInsert?.sql).toContain('liquidation_deadline = COALESCE(EXCLUDED.liquidation_deadline, financial_transactions.liquidation_deadline)');
    expect(transactionInsert?.values).toContain('Association equipment');
    expect(transactionInsert?.values).toContain('2026-12-17');
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
    // The public health check must not echo raw driver errors (host, user, port).
    expect(payload.error).toBeUndefined();
    expect(payload.message).not.toContain('postgresql://');
    expect(payload.message).not.toContain('192.0.2.1');
  }, 20000);
});
