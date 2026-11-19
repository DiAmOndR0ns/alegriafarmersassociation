// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanDatabaseUrl,
  fetchAllDataFromPostgres,
  mergeIgpExpenses,
  getPool,
  getTableStats,
  isDatabaseConfigured,
  isLoopbackDatabaseUrl,
  saveFullStateToPostgres
} from './db';

const originalUrl = process.env.DATABASE_URL;
const originalCa = process.env.SUPABASE_CA_CERT_BASE64;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
  if (originalCa === undefined) delete process.env.SUPABASE_CA_CERT_BASE64;
  else process.env.SUPABASE_CA_CERT_BASE64 = originalCa;
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

  it('strips every TLS query parameter so the explicit ssl option wins', () => {
    // Supabase's "Connect" dialog hands out URLs ending in
    // ?sslmode=verify-full&sslrootcert=. Left in place, pg-connection-string
    // turns that into its own ssl object (ca: '') ahead of our { rejectUnauthorized: false }.
    const result = cleanDatabaseUrl(
      'postgresql://u:p@aws-1-ap.pooler.supabase.com:6543/postgres?sslmode=verify-full&sslrootcert=&sslcert=&sslkey=&ssl=true'
    );
    for (const param of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl=']) {
      expect(result.connectionString).not.toContain(param);
    }
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

  it('allows the Supabase pooler self-signed certificate when no CA is configured', () => {
    delete process.env.SUPABASE_CA_CERT_BASE64;
    process.env.DATABASE_URL = 'postgresql://u:p@aws-0-ap.pooler.supabase.com:6543/postgres';
    expect((getPool() as any).options.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('verifies TLS against the configured Supabase CA certificate', () => {
    const ca = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----\n';
    process.env.SUPABASE_CA_CERT_BASE64 = Buffer.from(ca).toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@aws-1-ap.pooler.supabase.com:6543/postgres';

    // The PEM is trimmed: base64 blobs built by tooling often carry a trailing newline.
    expect((getPool() as any).options.ssl).toEqual({ rejectUnauthorized: true, ca: ca.trim() });
  });

  it('falls back to accepting the self-signed chain when the CA blob is not PEM', () => {
    // Previously this threw, which turned every request into a 503. A broken CA
    // variable must not be able to take the whole app down.
    process.env.SUPABASE_CA_CERT_BASE64 = Buffer.from('not a certificate').toString('base64');
    process.env.DATABASE_URL = 'postgresql://u:p@aws-2-ap.pooler.supabase.com:6543/postgres';

    expect((getPool() as any).options.ssl).toEqual({ rejectUnauthorized: false });
  });
});

describe('database table statistics', () => {
  it('counts all 21 application tables', async () => {
    const tableNames = [
      'users', 'members', 'meetings', 'resolutions', 'financial_transactions',
      'announcements', 'system_logs', 'afa_igp', 'afa_igp_livestocks', 'afa_igp_expenses',
      'afa_igp_harvests', 'afa_igp_sales',
      'products', 'inventory', 'activities', 'achievements', 'organization_funds',
      'auditor_reports', 'delegation_requests',
      'membership_payments', 'membership_year_snapshots'
    ];
    const row = Object.fromEntries(tableNames.map(name => [name, '1']));
    const pool = {
      connect: async () => ({
        query: async () => ({ rows: [row] }),
        release: () => undefined
      })
    };

    const stats = await getTableStats(pool as any);

    expect(Object.keys(stats.tableCounts)).toHaveLength(21);
    expect(stats.tableCounts.inventory).toBe(1);
    expect(stats.tableCounts.achievements).toBe(1);
    expect(stats.tableCounts.membership_payments).toBe(1);
    expect(stats.totalRecords).toBe(21);
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
    expect(queries.some(query => query.sql.includes('ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS category TEXT'))).toBe(true);
    expect(queries.some(query => query.sql.includes("table_name = 'afa_igp_expenses' AND column_name = 'expense_data'"))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP TABLE IF EXISTS afa_igp_groups'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP TABLE IF EXISTS afa_igp_group_members'))).toBe(true);
    expect(queries.some(query => query.sql.includes('ALTER TABLE afa_igp DROP COLUMN IF EXISTS groups'))).toBe(true);
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS afa_igp_groups'))).toBe(false);
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS afa_igp_harvests'))).toBe(true);
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS afa_igp_sales'))).toBe(true);
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS afa_igp_livestocks'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS opening_hog_count'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS initial_count'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS opening_count'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS stage_breakdown'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS hog_stage'))).toBe(true);
    expect(queries.some(query => query.sql.includes('DROP COLUMN IF EXISTS produce_count'))).toBe(true);
    expect(queries.some(query => query.sql.includes('ALTER TABLE afa_igp DROP COLUMN IF EXISTS expenses, DROP COLUMN IF EXISTS sales, DROP COLUMN IF EXISTS chore_logs'))).toBe(true);
    expect(queries.some(query => query.sql.includes('ALTER TABLE afa_igp_expenses DROP COLUMN IF EXISTS expense_data'))).toBe(false);
    expect(queries.some(query => query.sql.includes('expense_data JSONB'))).toBe(true);
    const syncQueueMigration = queries.find(query => query.sql.includes("to_regclass('public.sync_queue')"));
    expect(syncQueueMigration?.sql).toContain("EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.sync_queue LIMIT 1)' INTO queue_has_rows");
    expect(syncQueueMigration?.sql).toContain("EXECUTE 'DROP TABLE public.sync_queue'");
    expect(queries.some(query => query.sql.includes('CREATE TABLE IF NOT EXISTS sync_queue'))).toBe(false);
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

describe('approval-only transaction persistence', () => {
  it.each([
    {
      label: 'President approvals',
      field: 'president_approval_status',
      state: {
        financialTransactions: [{
          id: 'transaction-approval',
          presidentApprovalStatus: 'Approved',
          presidentApprovedBy: 'President',
          presidentApprovedDate: '2026-11-18'
        }],
        presidentApprovalOnly: true
      }
    },
    {
      label: 'Auditor reviews',
      field: 'audited_status',
      state: {
        financialTransactions: [{
          id: 'transaction-audit',
          auditedStatus: 'Audited',
          auditedBy: 'Auditor',
          auditedDate: '2026-11-18'
        }],
        auditorReviewOnly: true
      }
    }
  ])('updates $label without reinserting a partial transaction', async ({ state, field }) => {
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

    await saveFullStateToPostgres(pool as any, state);

    expect(queries.some(query =>
      query.sql.includes('UPDATE financial_transactions SET') && query.sql.includes(field)
    )).toBe(true);
    expect(queries.some(query => query.sql.includes('INSERT INTO financial_transactions ('))).toBe(false);
  });
});

describe('IGP expense persistence', () => {
  it('uses the structured expense columns and avoids defaulting RTL stock to swine', async () => {
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

    await saveFullStateToPostgres(pool as any, {
      hogRaising: {
        produces: ['Swine Raising (Baboyan)', 'Poultry Raising (RTL)'],
        expenses: [{
          id: 'rtl-expense-1',
          date: '2026-11-17',
          category: 'RTL Pullets Stock',
          stage: 'RTL',
          quantity: 200,
          amount: 50000,
          description: 'for purchasing eggs',
          recordedBy: 'Treasurer',
          fundSource: 'AFA Allocated Fund'
        }],
        sales: [],
        eggHarvests: []
      }
    });

    const expenseInsert = queries.find(query => query.sql.includes('INSERT INTO afa_igp_expenses'));
    expect(expenseInsert?.sql).toContain('date, category, quantity, description, amount, recorded_by, fund_source, stage');
    expect(expenseInsert?.sql).toContain('expense_data');
    expect(expenseInsert?.values).toEqual([
      'rtl-expense-1',
      'Poultry Raising (RTL)',
      '2026-11-17',
      'RTL Pullets Stock',
      200,
      'for purchasing eggs',
      50000,
      'Treasurer',
      'AFA Allocated Fund',
      'RTL',
      JSON.stringify({
        id: 'rtl-expense-1',
        date: '2026-11-17',
        category: 'RTL Pullets Stock',
        stage: 'RTL',
        quantity: 200,
        amount: 50000,
        description: 'for purchasing eggs',
        recordedBy: 'Treasurer',
        fundSource: 'AFA Allocated Fund'
      })
    ]);

    const stateWrites = queries.filter(query => query.sql.includes('INSERT INTO afa_igp ('));
    expect(stateWrites).toHaveLength(1);
    expect(stateWrites[0].sql).toContain('produces');
    expect(stateWrites[0].sql).not.toContain('expenses');
  });

  it('reconstructs an IGP expense solely from its structured columns', () => {
    const expenses = mergeIgpExpenses([{
      id: 'rtl-expense-1',
      produce: 'Poultry Raising (RTL)',
      date: '2026-11-17',
      category: 'RTL Pullets Stock',
      quantity: 200,
      description: 'for purchasing eggs',
      amount: 50000,
      recorded_by: 'Treasurer',
      fund_source: 'AFA Allocated Fund',
      stage: 'RTL'
    }]);

    expect(expenses).toEqual([{
      id: 'rtl-expense-1',
      produce: 'Poultry Raising (RTL)',
      date: '2026-11-17',
      category: 'RTL Pullets Stock',
      quantity: 200,
      description: 'for purchasing eggs',
      amount: 50000,
      recordedBy: 'Treasurer',
      fundSource: 'AFA Allocated Fund',
      stage: 'RTL'
    }]);
  });

  it('returns structured expense rows even when the IGP state row is missing', async () => {
    const expenseRow = {
      id: 'orphaned-rtl-expense',
      produce: 'Poultry Raising (RTL)',
      date: '2026-11-17',
      category: 'RTL Pullets Stock',
      quantity: '200',
      description: 'for purchasing eggs',
      amount: '50000',
      recorded_by: 'Treasurer',
      fund_source: 'AFA Allocated Fund',
      stage: 'RTL'
    };
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.includes('FROM afa_igp_expenses')) return { rows: [expenseRow] };
          return { rows: [] };
        },
        release: () => undefined
      })
    };

    const result = await fetchAllDataFromPostgres(pool as any);

    expect(result.hogRaising.expenses).toEqual([{
      id: 'orphaned-rtl-expense',
      produce: 'Poultry Raising (RTL)',
      date: '2026-11-17',
      category: 'RTL Pullets Stock',
      quantity: 200,
      description: 'for purchasing eggs',
      amount: 50000,
      recordedBy: 'Treasurer',
      fundSource: 'AFA Allocated Fund',
      stage: 'RTL'
    }]);
  });

  it('prefers normalized IGP rows while retaining JSON-only records as fallback', async () => {
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.includes("FROM afa_igp WHERE id IN")) {
            return {
              rows: [{
                id: 'main_state',
                sales: [
                  { id: 'legacy-sale', produce: 'Old project', date: '2026-01-01', hogsCount: 1, revenue: 10, recordedBy: 'Legacy' },
                  { id: 'json-only-sale', produce: 'Legacy-only project', date: '2025-12-01', hogsCount: 1, revenue: 5, recordedBy: 'Legacy' }
                ],
                chore_logs: [
                  { id: 'legacy-harvest', date: '2026-01-01', time: '08:00', collectedBy: 'Legacy', eggCount: 2, status: 'Pending Audit' },
                  { id: 'json-only-harvest', date: '2025-12-01', time: '08:00', collectedBy: 'Legacy', eggCount: 1, status: 'Pending Audit' }
                ],
                expenses: [{ id: 'legacy-expense', produce: 'Poultry Raising (RTL)', amount: 20 }]
              }]
            };
          }
          if(sql.includes('FROM afa_igp_livestocks')) return {
        rows: [
          { produce: 'Swine Raising (Baboyan)', stage: 'Fattening', head_count: 5 },
          { produce: 'Swine Raising (Baboyan)', stage: 'Gestation', head_count: 2 },
          { produce: 'Goat Raising', stage: 'Breeding', head_count: 4 },
          { produce: 'Goat Raising', stage: 'Growing', head_count: 8 }
        ]
      };
      if(sql.includes('FROM afa_igp_sales')) return {
        rows: [{
          id: 'legacy-sale', produce: 'Normalized project', date: '2026-02-01', quantity: 3, stage: 'RTL',
          revenue: '40', recorded_by: 'Normalized', notes: 'Updated'
        }]
      };
  if (sql.includes('FROM afa_igp_harvests')) return {
    rows: [{
      id: 'legacy-harvest', produce: 'Poultry Raising (RTL)', date: '2026-02-01', time: '09:00',
      collected_by: 'Normalized', egg_count: 5, status: 'Audited'
    }]
  };
  if (sql.includes('FROM afa_igp_expenses')) return { rows: [] };
  return { rows: [] };
},
  release: () => undefined
      })
    };

const result = await fetchAllDataFromPostgres(pool as any);

expect(result.hogRaising.livestockInventory).toEqual([
      { produce: 'Swine Raising (Baboyan)', stageBreakdown: { Fattening: 5, Gestation: 2 } },
  { produce: 'Goat Raising', stageBreakdown: { Breeding: 4, Growing: 8 } }
]);
expect(result.hogRaising.sales).toEqual([{
  id: 'legacy-sale',
  produce: 'Normalized project',
  date: '2026-02-01',
  quantity: 3,
  stage: 'RTL',
  revenue: 40,
  recordedBy: 'Normalized',
  notes: 'Updated'
}, {
  id: 'json-only-sale',
  produce: 'Legacy-only project',
  date: '2025-12-01',
  quantity: 1,
  revenue: 5,
  recordedBy: 'Legacy'
}]);
expect(result.hogRaising.eggHarvests[0]).toMatchObject({
  id: 'legacy-harvest',
  collectedBy: 'Normalized',
  eggCount: 5,
  status: 'Audited'
});
expect(result.hogRaising.eggHarvests[1]).toMatchObject({
  id: 'json-only-harvest',
  collectedBy: 'Legacy',
  eggCount: 1
});
expect(result.hogRaising.expenses).toEqual([{
  id: 'legacy-expense',
  produce: 'Poultry Raising (RTL)',
  amount: 20
}]);
  });

it('writes IGP sales and harvests to their normalized tables', async () => {
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
  const sale = {
    id: 'sale-1',
    produce: 'Poultry Raising (RTL)',
    date: '2026-02-01',
    stage: 'RTL',
    quantity: 30,
    revenue: 1500,
    recordedBy: 'Treasurer',
    fundSource: 'AFA Fund',
    notes: 'Egg sale'
  };
  const harvest = {
    id: 'harvest-1',
    produce: 'Poultry Raising (RTL)',
    date: '2026-02-01',
    time: '08:30',
    collectedBy: 'Member One',
    eggCount: 30,
    status: 'Pending Audit' as const
  };

  await saveFullStateToPostgres(pool as any, {
    hogRaising: {
      produces: ['Poultry Raising (RTL)'],
      livestockInventory: [
          { produce: 'Swine Raising (Baboyan)', stageBreakdown: { Fattening: 5, Gestation: 3 } },
        { produce: 'Goat Raising', stageBreakdown: { Growing: 4 } }
      ],
      expenses: [],
      sales: [sale],
      eggHarvests: [harvest]
    }
  });

  const igpInsert = queries.find(query => query.sql.includes('INSERT INTO afa_igp ('));
  const salesInsert = queries.find(query => query.sql.includes('INSERT INTO afa_igp_sales'));
  const harvestInsert = queries.find(query => query.sql.includes('INSERT INTO afa_igp_harvests'));
  const livestockInserts = queries.filter(query => query.sql.includes('INSERT INTO afa_igp_livestocks'));
  expect(igpInsert?.sql).toContain('INSERT INTO afa_igp (id, produces, closed_years)');
  expect(igpInsert?.values).toEqual(['main_state', ['Poultry Raising (RTL)'], []]);
  expect(salesInsert?.values).toEqual([
    sale.id, sale.produce, sale.date, sale.stage, sale.quantity,
    sale.revenue, sale.recordedBy, sale.fundSource, sale.notes
  ]);
  expect(harvestInsert?.values).toEqual([
    harvest.id, harvest.produce, harvest.date, harvest.time, harvest.collectedBy,
    harvest.eggCount, null, harvest.status, null, null, null, null, null, null
  ]);
  expect(queries.some(query => query.sql.includes('DELETE FROM afa_igp_sales'))).toBe(true);
  expect(queries.some(query => query.sql.includes('DELETE FROM afa_igp_harvests'))).toBe(true);
  expect(livestockInserts.map(query => query.values)).toEqual([
    ['Swine Raising (Baboyan)', 'Fattening', 5],
    ['Swine Raising (Baboyan)', 'Gestation', 3],
    ['Goat Raising', 'Growing', 4]
  ]);
  expect(queries.some(query => query.sql.includes('DELETE FROM afa_igp_livestocks'))).toBe(true);
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
