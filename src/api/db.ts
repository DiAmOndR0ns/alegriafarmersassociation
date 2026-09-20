import pg from 'pg';
import { OFFICIAL_OFFICERS, INITIAL_PRODUCTS } from '../initialData';
import { AuditorReport, DelegationRequest } from '../types';

// Bulletproof Pool resolution across CJS, ESM, and bundled Vercel serverless environments
const PgPool = (pg as any)?.Pool || (pg as any)?.default?.Pool || (pg as any)?.default || pg;

let poolInstance: pg.Pool | null = null;
let lastUsedConnectionString: string | null = null;

export function isDatabaseConfigured(): boolean {
  const dbUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
  return Boolean(
    dbUrl && 
    dbUrl !== '' && 
    !dbUrl.includes('[YOUR-PASSWORD]') && 
    !dbUrl.includes('<password>') &&
    !dbUrl.includes('YOUR_PASSWORD') && 
    !dbUrl.includes('your_supabase_connection_string') &&
    (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))
  );
}

export function cleanDatabaseUrl(rawUrl: string): { connectionString: string; isSsl: boolean; hostInfo: string } {
  let urlStr = rawUrl.trim().replace(/^["']|["']$/g, '');
  let hostInfo = 'PostgreSQL';

  try {
    const parsed = new URL(urlStr);
    hostInfo = `${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}`;
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    return {
      connectionString: parsed.toString(),
      isSsl: true,
      hostInfo,
    };
  } catch {
    const cleaned = urlStr
      .replace(/[\?&]sslmode=[^&]*/g, '')
      .replace(/[\?&]ssl=[^&]*/g, '')
      .replace(/\?$/, '');
    return { connectionString: cleaned, isSsl: true, hostInfo };
  }
}

export function getPool(): pg.Pool {
  const rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl || !isDatabaseConfigured()) {
    throw new Error('DATABASE_URL environment variable is not configured');
  }

  const { connectionString } = cleanDatabaseUrl(rawDbUrl);

  if (!poolInstance || lastUsedConnectionString !== connectionString) {
    if (poolInstance) {
      poolInstance.end().catch(() => {});
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    poolInstance = new PgPool({
      connectionString,
      ssl: { 
        rejectUnauthorized: false 
      },
      connectionTimeoutMillis: 7000,
      idleTimeoutMillis: 10000,
      max: 6,
    });

    poolInstance.on('error', (err: any) => {
      console.warn('[PostgreSQL Pool Client Error]:', err?.message || err);
    });

    lastUsedConnectionString = connectionString;
  }

  return poolInstance;
}

export async function runSchemaMigrations(client: pg.PoolClient) {
  const statements = [
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS member_id_number VARCHAR(100);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS rsbsa_number VARCHAR(100);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS is_rsbsa_registered BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS gender VARCHAR(20);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date VARCHAR(50);`,

    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id_number VARCHAR(100);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS rsbsa_number VARCHAR(100);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_rsbsa_registered BOOLEAN DEFAULT FALSE;`,

    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_status VARCHAR(50) DEFAULT 'Unaudited';`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audit_notes TEXT;`,

    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,

    `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS ceb_name TEXT;`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_available VARCHAR(100);`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_name TEXT;`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_sitio TEXT;`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_phone VARCHAR(50);`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person TEXT;`,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE;`,

    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS ceb_title TEXT;`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS date_scheduled VARCHAR(50);`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(100);`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS time_scheduled VARCHAR(100);`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS target_audience TEXT;`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_url TEXT;`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS attendees_count INTEGER DEFAULT 0;`,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS documented_notes TEXT;`,

    // Formal Auditor Reports (Proposal Requirement)
    `CREATE TABLE IF NOT EXISTS auditor_reports (
      id VARCHAR(100) PRIMARY KEY,
      report_period VARCHAR(100) NOT NULL,
      report_type VARCHAR(50) NOT NULL,
      total_income NUMERIC DEFAULT 0,
      total_expenses NUMERIC DEFAULT 0,
      net_surplus NUMERIC DEFAULT 0,
      findings TEXT,
      recommendations TEXT,
      prepared_by TEXT NOT NULL,
      certified_by TEXT,
      status VARCHAR(50) DEFAULT 'Submitted',
      date_submitted VARCHAR(50),
      date_certified VARCHAR(50)
    );`,

    // Executive Delegation Requests (Proposal Requirement: President to VP delegation)
    `CREATE TABLE IF NOT EXISTS delegation_requests (
      id VARCHAR(100) PRIMARY KEY,
      requested_by TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_date VARCHAR(50) NOT NULL,
      effective_start VARCHAR(50),
      effective_end VARCHAR(50),
      status VARCHAR(50) DEFAULT 'Pending',
      reviewed_by TEXT,
      reviewed_date VARCHAR(50),
      remarks TEXT
    );`,

    // Sync Queue Audit Table
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id VARCHAR(100) PRIMARY KEY,
      timestamp VARCHAR(100),
      action VARCHAR(50),
      entity_type VARCHAR(50),
      payload JSONB,
      status VARCHAR(50) DEFAULT 'synced'
    );`
  ];

  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (e: any) {
      console.warn('[Schema Migration Warning]:', e?.message || e);
    }
  }
}

export async function initDatabaseSchema(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name TEXT NOT NULL,
        role VARCHAR(50) NOT NULL,
        is_approved BOOLEAN DEFAULT TRUE,
        joined_date VARCHAR(50),
        farm_location TEXT,
        farm_size NUMERIC,
        primary_crops TEXT[],
        contact_number VARCHAR(50),
        status VARCHAR(50),
        avatar_url TEXT,
        member_id_number VARCHAR(100),
        rsbsa_number VARCHAR(100),
        is_rsbsa_registered BOOLEAN DEFAULT FALSE
      );
    `);

    // 2. Members
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        farm_location TEXT,
        farm_size NUMERIC,
        primary_crops TEXT[],
        contact_number VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active',
        joined_date VARCHAR(50),
        member_id_number VARCHAR(100),
        rsbsa_number VARCHAR(100),
        is_rsbsa_registered BOOLEAN DEFAULT FALSE,
        avatar_url TEXT,
        gender VARCHAR(20),
        birth_date VARCHAR(50)
      );
    `);

    // 3. Meetings
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        date VARCHAR(50),
        location TEXT,
        attendance_count INTEGER DEFAULT 0,
        agenda TEXT,
        minutes TEXT,
        officer_in_charge TEXT,
        attendance_record JSONB
      );
    `);

    // 4. Resolutions
    await client.query(`
      CREATE TABLE IF NOT EXISTS resolutions (
        id VARCHAR(100) PRIMARY KEY,
        resolution_number VARCHAR(100) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        date_agreed VARCHAR(50),
        moved_by TEXT,
        seconded_by TEXT,
        vote_in_favor INTEGER DEFAULT 0,
        vote_against INTEGER DEFAULT 0,
        vote_abstain INTEGER DEFAULT 0,
        status VARCHAR(50)
      );
    `);

    // 5. Financial Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL,
        date VARCHAR(50),
        description TEXT,
        recorded_by TEXT,
        fund_source TEXT,
        audited_status VARCHAR(50) DEFAULT 'Unaudited',
        audited_by TEXT,
        audited_date VARCHAR(50),
        audit_notes TEXT
      );
    `);

    // 6. Announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        category VARCHAR(100),
        content TEXT,
        date_posted VARCHAR(50),
        priority VARCHAR(50),
        posted_by TEXT
      );
    `);

    // 7. System Logs (Audit chain)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id VARCHAR(100) PRIMARY KEY,
        timestamp VARCHAR(100),
        user_name TEXT,
        role VARCHAR(50),
        action TEXT,
        details TEXT,
        sync_status VARCHAR(50),
        hash TEXT,
        previous_hash TEXT
      );
    `);

    // 8. Hog Raising IGP State
    await client.query(`
      CREATE TABLE IF NOT EXISTS hog_raising (
        id VARCHAR(100) PRIMARY KEY,
        capital_grant NUMERIC,
        produces TEXT[],
        expenses JSONB,
        sales JSONB,
        groups JSONB,
        chore_logs JSONB,
        closed_years INT[]
      );
    `);

    // 9. Products
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        ceb_name TEXT,
        category VARCHAR(100),
        description TEXT,
        unit VARCHAR(50),
        price NUMERIC,
        quantity_available VARCHAR(100),
        stock_status VARCHAR(50),
        farmer_name TEXT,
        farmer_sitio TEXT,
        farmer_phone VARCHAR(50),
        contact_person TEXT,
        image_url TEXT,
        is_published BOOLEAN DEFAULT TRUE,
        updated_by TEXT,
        managed_by TEXT,
        date_updated VARCHAR(50)
      );
    `);

    // 10. Activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id VARCHAR(100) PRIMARY KEY,
        title TEXT NOT NULL,
        ceb_title TEXT,
        category VARCHAR(100),
        scheduled_date VARCHAR(50),
        date_scheduled VARCHAR(50),
        scheduled_time VARCHAR(100),
        time_scheduled VARCHAR(100),
        location TEXT,
        description TEXT,
        organizer TEXT,
        status VARCHAR(50),
        documented_notes TEXT,
        attendees_count INTEGER DEFAULT 0,
        target_audience TEXT,
        image_url TEXT
      );
    `);

    // 11. Organization Funds
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_funds (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        allocated_amount NUMERIC DEFAULT 0,
        current_balance NUMERIC DEFAULT 0,
        description TEXT,
        custodian TEXT,
        last_updated VARCHAR(50)
      );
    `);

    // 12. Auditor Reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS auditor_reports (
        id VARCHAR(100) PRIMARY KEY,
        report_period VARCHAR(100) NOT NULL,
        report_type VARCHAR(50) NOT NULL,
        total_income NUMERIC DEFAULT 0,
        total_expenses NUMERIC DEFAULT 0,
        net_surplus NUMERIC DEFAULT 0,
        findings TEXT,
        recommendations TEXT,
        prepared_by TEXT NOT NULL,
        certified_by TEXT,
        status VARCHAR(50) DEFAULT 'Submitted',
        date_submitted VARCHAR(50),
        date_certified VARCHAR(50)
      );
    `);

    // 13. Delegation Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS delegation_requests (
        id VARCHAR(100) PRIMARY KEY,
        requested_by TEXT NOT NULL,
        reason TEXT NOT NULL,
        requested_date VARCHAR(50) NOT NULL,
        effective_start VARCHAR(50),
        effective_end VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Pending',
        reviewed_by TEXT,
        reviewed_date VARCHAR(50),
        remarks TEXT
      );
    `);

    await client.query('COMMIT');
    console.log('[DB DEBUG] Database schema initialized successfully');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[DB DEBUG] Schema initialization failed:', err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getTableStats(pool: pg.Pool): Promise<{
  tableCounts: Record<string, number>;
  totalRecords: number;
}> {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        (SELECT count(*) FROM users) as users,
        (SELECT count(*) FROM members) as members,
        (SELECT count(*) FROM meetings) as meetings,
        (SELECT count(*) FROM resolutions) as resolutions,
        (SELECT count(*) FROM financial_transactions) as financial_transactions,
        (SELECT count(*) FROM announcements) as announcements,
        (SELECT count(*) FROM system_logs) as system_logs,
        (SELECT count(*) FROM hog_raising) as hog_raising,
        (SELECT count(*) FROM products) as products,
        (SELECT count(*) FROM activities) as activities,
        (SELECT count(*) FROM organization_funds) as organization_funds,
        (SELECT count(*) FROM auditor_reports) as auditor_reports,
        (SELECT count(*) FROM delegation_requests) as delegation_requests
    `);
    const row = res.rows[0] || {};
    const tableCounts: Record<string, number> = {
      users: Number(row.users || 0),
      members: Number(row.members || 0),
      meetings: Number(row.meetings || 0),
      resolutions: Number(row.resolutions || 0),
      financial_transactions: Number(row.financial_transactions || 0),
      announcements: Number(row.announcements || 0),
      system_logs: Number(row.system_logs || 0),
      hog_raising: Number(row.hog_raising || 0),
      products: Number(row.products || 0),
      activities: Number(row.activities || 0),
      organization_funds: Number(row.organization_funds || 0),
      auditor_reports: Number(row.auditor_reports || 0),
      delegation_requests: Number(row.delegation_requests || 0),
    };
    const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
    return { tableCounts, totalRecords };
  } catch (err: any) {
    console.error('[DB DEBUG] getTableStats failed:', err?.message || err);
    return {
      tableCounts: {},
      totalRecords: 0,
    };
  } finally {
    client.release();
  }
}

let schemaInitialized = false;

/**
 * Directly and immediately deletes one or more entities from the PostgreSQL Cloud Database.
 */
export async function deleteEntityFromPostgres(
  pool: pg.Pool,
  entity: string,
  ids: string | string[]
): Promise<{ success: boolean; deletedCount: number; entity: string; table: string }> {
  const tableMap: Record<string, string> = {
    user: 'users',
    users: 'users',
    officer: 'users',
    officers: 'users',
    member: 'members',
    members: 'members',
    meeting: 'meetings',
    meetings: 'meetings',
    resolution: 'resolutions',
    resolutions: 'resolutions',
    transaction: 'financial_transactions',
    transactions: 'financial_transactions',
    financialtransaction: 'financial_transactions',
    financialtransactions: 'financial_transactions',
    financial_transaction: 'financial_transactions',
    financial_transactions: 'financial_transactions',
    announcement: 'announcements',
    announcements: 'announcements',
    product: 'products',
    products: 'products',
    activity: 'activities',
    activities: 'activities',
    fund: 'organization_funds',
    funds: 'organization_funds',
    organizationfund: 'organization_funds',
    organizationfunds: 'organization_funds',
    organization_fund: 'organization_funds',
    organization_funds: 'organization_funds',
    auditorreport: 'auditor_reports',
    auditorreports: 'auditor_reports',
    auditor_report: 'auditor_reports',
    auditor_reports: 'auditor_reports',
    delegationrequest: 'delegation_requests',
    delegationrequests: 'delegation_requests',
    delegation_request: 'delegation_requests',
    delegation_requests: 'delegation_requests',
    systemlog: 'system_logs',
    systemlogs: 'system_logs',
    log: 'system_logs',
    logs: 'system_logs'
  };

  const normalized = (entity || '').toLowerCase().replace(/[-_]/g, '');
  const tableName = tableMap[entity] || tableMap[(entity || '').toLowerCase()] || tableMap[normalized];
  if (!tableName) {
    throw new Error(`Unknown entity type for database deletion: ${entity}`);
  }

  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
  if (idList.length === 0) {
    return { success: true, deletedCount: 0, entity, table: tableName };
  }

  const client = await pool.connect();
  try {
    const res = await client.query(`DELETE FROM ${tableName} WHERE id = ANY($1)`, [idList]);
    console.log(`[DB DELETE] Removed ${res.rowCount || 0} record(s) from "${tableName}" (IDs: ${idList.join(', ')})`);
    return { success: true, deletedCount: res.rowCount || 0, entity, table: tableName };
  } finally {
    client.release();
  }
}

/**
 * Ensures the database tables and columns exist.
 * CRITICAL: NEVER auto-seeds dummy records.
 * Only if the users table has 0 accounts, it creates the 6 designated officer
 * credentials using ON CONFLICT DO NOTHING, allowing officers to log in.
 */
export async function ensureDatabaseSchema(pool: pg.Pool) {
  if (schemaInitialized) return;
  const client = await pool.connect();
  try {
    console.log('[DB DEBUG] ensureDatabaseSchema: Checking tables...');
    const check = await client.query(`SELECT to_regclass('public.members') as members_table`);
    console.log('[DB DEBUG] members table exists:', check.rows[0]?.members_table);
    
    if (!check.rows[0]?.members_table) {
      console.log('[DB DEBUG] Creating database schema...');
      await initDatabaseSchema(pool);
    } else {
      console.log('[DB DEBUG] Running schema migrations...');
      await runSchemaMigrations(client);
    }

    // Only provision the 6 official officer logins if users table is empty
    const counts = await client.query(`SELECT count(*) as count FROM users`);
    const usersCount = Number(counts.rows[0]?.count || 0);
    console.log('[DB DEBUG] Current users count:', usersCount);

    if (usersCount === 0) {
      console.log('[DB DEBUG] No users found. Provisioning the 6 official officer accounts...');
      for (const u of OFFICIAL_OFFICERS) {
        await client.query(`
          INSERT INTO users (id, username, password, name, role, is_approved, joined_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING;
        `, [
          u.id, 
          u.username, 
          u.password || 'password123', 
          u.name, 
          u.role, 
          true, 
          u.joinedDate || '2024-01-01', 
          'Active'
        ]);
      }
      console.log('[DB DEBUG] Officer accounts provisioned');
    }

    // Clean out any legacy hog or tilapia items from products table to strictly respect user directive
    try {
      await client.query(`
        DELETE FROM products 
        WHERE name ILIKE '%baboy%' 
           OR name ILIKE '%hog%' 
           OR name ILIKE '%tilapia%' 
           OR ceb_name ILIKE '%baboy%' 
           OR ceb_name ILIKE '%hog%'
           OR category = 'Livestock'
      `);
    } catch {}

    schemaInitialized = true;
  } catch (err: any) {
    console.error('[DB DEBUG] ensureDatabaseSchema failed:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint
    });
    // Don't swallow the error - rethrow it
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Wipes out all dummy and seed data from Supabase/PostgreSQL.
 * Leaves the 6 officer accounts intact so officers can log in, but
 * empties all members, meetings, resolutions, transactions, announcements,
 * products, activities, and funds so real data can be entered.
 */
export async function purgeAllDummyData(pool: pg.Pool) {
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Truncate all operational tables
    await client.query('TRUNCATE TABLE members CASCADE');
    await client.query('TRUNCATE TABLE meetings CASCADE');
    await client.query('TRUNCATE TABLE resolutions CASCADE');
    await client.query('TRUNCATE TABLE financial_transactions CASCADE');
    await client.query('TRUNCATE TABLE announcements CASCADE');
    await client.query('TRUNCATE TABLE products CASCADE');
    await client.query('TRUNCATE TABLE activities CASCADE');
    await client.query('TRUNCATE TABLE organization_funds CASCADE');
    await client.query('TRUNCATE TABLE system_logs CASCADE');
    
    try {
      await client.query('TRUNCATE TABLE auditor_reports CASCADE');
      await client.query('TRUNCATE TABLE delegation_requests CASCADE');
      await client.query('TRUNCATE TABLE sync_queue CASCADE');
    } catch {}

    // Reset hog_raising to clean Association IGP state
    await client.query('DELETE FROM hog_raising');
    await client.query(`
      INSERT INTO hog_raising (id, capital_grant, produces, expenses, sales, groups, chore_logs, closed_years)
      VALUES ('main_state', 0, ARRAY['Hog Raising', 'Chairs Rental (Abang sa Lingkoranan)', 'Sacks Rental (Abang sa Sako)', 'Poultry Raising'], '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ARRAY[]::int[]);
    `);

    // Remove all users except official 6 officers
    await client.query(`DELETE FROM users WHERE id NOT IN ('user-pres', 'user-vp', 'user-sec', 'user-tres', 'user-aud', 'user-pio')`);
    for (const u of OFFICIAL_OFFICERS) {
      await client.query(`
        INSERT INTO users (id, username, password, name, role, is_approved, joined_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING;
      `, [u.id, u.username, u.password || 'password123', u.name, u.role, true, u.joinedDate || '2024-01-01', 'Active']);
    }

    await client.query('COMMIT');
    return {
      success: true,
      message: 'All operational records successfully purged! Ready for real data.',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function fetchAllDataFromPostgres(pool: pg.Pool) {
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();
  try {
    const usersRes = await client.query('SELECT * FROM users ORDER BY name ASC');
    const membersRes = await client.query('SELECT * FROM members ORDER BY name ASC');
    const meetingsRes = await client.query('SELECT * FROM meetings ORDER BY date DESC');
    const resolutionsRes = await client.query('SELECT * FROM resolutions ORDER BY date_agreed DESC');
    const transactionsRes = await client.query('SELECT * FROM financial_transactions ORDER BY date DESC');
    const announcementsRes = await client.query('SELECT * FROM announcements ORDER BY date_posted DESC');
    const logsRes = await client.query('SELECT * FROM system_logs ORDER BY timestamp DESC');
    const hogQuery = await client.query("SELECT * FROM hog_raising WHERE id IN ('main_state', 'hog_raising_main') ORDER BY (id = 'main_state') DESC LIMIT 1");
    const hogRes = hogQuery.rows.length > 0 ? hogQuery : await client.query('SELECT * FROM hog_raising LIMIT 1');
    const productsRes = await client.query('SELECT * FROM products ORDER BY name ASC');
    const activitiesRes = await client.query('SELECT * FROM activities ORDER BY scheduled_date DESC');
    const fundsRes = await client.query('SELECT * FROM organization_funds ORDER BY name ASC');
    
    let auditorReports: any[] = [];
    let delegationRequests: any[] = [];
    try {
      const audRes = await client.query('SELECT * FROM auditor_reports ORDER BY date_submitted DESC');
      auditorReports = audRes.rows.map(r => ({
        id: r.id,
        reportPeriod: r.report_period,
        reportType: r.report_type,
        totalIncome: Number(r.total_income || 0),
        totalExpenses: Number(r.total_expenses || 0),
        netSurplus: Number(r.net_surplus || 0),
        findings: r.findings,
        recommendations: r.recommendations,
        preparedBy: r.prepared_by,
        certifiedBy: r.certified_by,
        status: r.status,
        dateSubmitted: r.date_submitted,
        dateCertified: r.date_certified
      }));
    } catch {}

    try {
      const delRes = await client.query('SELECT * FROM delegation_requests ORDER BY requested_date DESC');
      delegationRequests = delRes.rows.map(r => ({
        id: r.id,
        requestedBy: r.requested_by,
        reason: r.reason,
        requestedDate: r.requested_date,
        effectiveStart: r.effective_start,
        effectiveEnd: r.effective_end,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedDate: r.reviewed_date,
        remarks: r.remarks
      }));
    } catch {}

    let hogState = {
      capitalGrant: 0,
      produces: ['Hog Raising', 'Chairs Rental (Abang sa Lingkoranan)', 'Sacks Rental (Abang sa Sako)', 'Poultry Raising'],
      expenses: [],
      sales: [],
      groups: [],
      choreLogs: [],
      closedYears: []
    };

    if (hogRes.rows.length > 0) {
      const row = hogRes.rows[0];
      const rawProduces: string[] = Array.isArray(row.produces) ? row.produces : ['Hog Raising'];
      const cleanProduces = rawProduces.filter((p: string) => p !== 'Tilapia Breeding' && !p.toLowerCase().includes('tilapia'));
      if (!cleanProduces.includes('Chairs Rental (Abang sa Lingkoranan)')) {
        cleanProduces.push('Chairs Rental (Abang sa Lingkoranan)');
      }
      if (!cleanProduces.includes('Sacks Rental (Abang sa Sako)')) {
        cleanProduces.push('Sacks Rental (Abang sa Sako)');
      }
      hogState = {
        capitalGrant: Number(row.capital_grant || 0),
        produces: cleanProduces,
        expenses: row.expenses || [],
        sales: row.sales || [],
        groups: row.groups || [],
        choreLogs: row.chore_logs || [],
        closedYears: row.closed_years || []
      };
    }

    const members = membersRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      farmLocation: r.farm_location,
      farmSize: Number(r.farm_size || 0),
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number,
      status: r.status,
      joinedDate: r.joined_date,
      memberIdNumber: r.member_id_number,
      rsbsaNumber: r.rsbsa_number,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered),
      avatarUrl: r.avatar_url,
      gender: r.gender,
      birthDate: r.birth_date
    }));

    const users = usersRes.rows.map(r => ({
      id: r.id,
      username: r.username,
      password: r.password,
      name: r.name,
      role: r.role,
      isApproved: r.is_approved,
      joinedDate: r.joined_date,
      farmLocation: r.farm_location,
      farmSize: Number(r.farm_size || 0),
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number,
      status: r.status,
      avatarUrl: r.avatar_url,
      memberIdNumber: r.member_id_number,
      rsbsaNumber: r.rsbsa_number,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered)
    }));

    const meetings = meetingsRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      date: r.date,
      location: r.location,
      attendanceCount: Number(r.attendance_count || 0),
      agenda: r.agenda,
      minutes: r.minutes,
      officerInCharge: r.officer_in_charge,
      attendanceRecord: r.attendance_record || {}
    }));

    const resolutions = resolutionsRes.rows.map(r => ({
      id: r.id,
      resolutionNumber: r.resolution_number,
      title: r.title,
      description: r.description,
      dateAgreed: r.date_agreed,
      movedBy: r.moved_by,
      secondedBy: r.seconded_by,
      voteInFavor: Number(r.vote_in_favor || 0),
      voteAgainst: Number(r.vote_against || 0),
      voteAbstain: Number(r.vote_abstain || 0),
      status: r.status
    }));

    const transactions = transactionsRes.rows.map(r => ({
      id: r.id,
      type: r.type,
      category: r.category,
      amount: Number(r.amount || 0),
      date: r.date,
      description: r.description,
      recordedBy: r.recorded_by,
      fundSource: r.fund_source,
      auditedStatus: r.audited_status,
      auditedBy: r.audited_by,
      auditedDate: r.audited_date,
      auditNotes: r.audit_notes
    }));

    const announcements = announcementsRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      content: r.content,
      datePosted: r.date_posted,
      priority: r.priority,
      postedBy: r.posted_by
    }));

    const logs = logsRes.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      user: r.user_name,
      role: r.role,
      action: r.action,
      details: r.details,
      syncStatus: r.sync_status || 'synced',
      hash: r.hash,
      previousHash: r.previous_hash
    }));

    const products = productsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      cebName: r.ceb_name,
      category: r.category,
      description: r.description,
      unit: r.unit,
      price: Number(r.price || 0),
      quantityAvailable: r.quantity_available,
      stockStatus: r.stock_status,
      farmerName: r.farmer_name,
      farmerSitio: r.farmer_sitio,
      farmerPhone: r.farmer_phone,
      contactPerson: r.contact_person,
      imageUrl: r.image_url,
      isPublished: r.is_published,
      updatedBy: r.updated_by,
      managedBy: r.managed_by,
      dateUpdated: r.date_updated
    }));

    const activities = activitiesRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      cebTitle: r.ceb_title,
      category: r.category,
      scheduledDate: r.scheduled_date || r.date_scheduled,
      dateScheduled: r.date_scheduled || r.scheduled_date,
      scheduledTime: r.scheduled_time || r.time_scheduled,
      timeScheduled: r.time_scheduled || r.scheduled_time,
      location: r.location,
      description: r.description,
      organizer: r.organizer,
      status: r.status,
      documentedNotes: r.documented_notes,
      attendeesCount: Number(r.attendees_count || 0),
      targetAudience: r.target_audience,
      imageUrl: r.image_url
    }));

    const funds = fundsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      allocatedAmount: Number(r.allocated_amount || 0),
      currentBalance: Number(r.current_balance || 0),
      description: r.description,
      custodian: r.custodian,
      lastUpdated: r.last_updated
    }));

    return {
      users,
      members,
      meetings,
      resolutions,
      transactions,
      financialTransactions: transactions,
      announcements,
      logs,
      systemLogs: logs,
      hogRaising: hogState,
      products,
      activities,
      funds,
      organizationFunds: funds,
      auditorReports,
      delegationRequests
    };
  } finally {
    client.release();
  }
}

export async function saveFullStateToPostgres(pool: pg.Pool, state: any) {
  console.log('[DB DEBUG] saveFullStateToPostgres called');
  console.log('[DB DEBUG] State keys:', Object.keys(state || {}));
  
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();

  try {
    console.log('[DB DEBUG] Starting transaction...');
    await client.query('BEGIN');

    // Track all deleted IDs across entities so they are NEVER re-inserted in this transaction
    const deletedUserIds = new Set<string>();
    const deletedMemberIds = new Set<string>();
    const deletedMeetingIds = new Set<string>();
    const deletedResolutionIds = new Set<string>();
    const deletedTxIds = new Set<string>();
    const deletedAnnouncementIds = new Set<string>();
    const deletedProductIds = new Set<string>();
    const deletedActivityIds = new Set<string>();
    const deletedFundIds = new Set<string>();
    const deletedAuditorIds = new Set<string>();
    const deletedDelegationIds = new Set<string>();

    // 1. Handle Explicit Batch Deletions
    if (state.deletedIds && typeof state.deletedIds === 'object') {
      const d = state.deletedIds;
      if (Array.isArray(d.users) && d.users.length > 0) {
        d.users.forEach((id: string) => deletedUserIds.add(id));
        await client.query('DELETE FROM users WHERE id = ANY($1)', [d.users]);
        console.log('[DB DELETE] Batch deleted users:', d.users);
      }
      if (Array.isArray(d.members) && d.members.length > 0) {
        d.members.forEach((id: string) => deletedMemberIds.add(id));
        await client.query('DELETE FROM members WHERE id = ANY($1)', [d.members]);
        console.log('[DB DELETE] Batch deleted members:', d.members);
      }
      if (Array.isArray(d.meetings) && d.meetings.length > 0) {
        d.meetings.forEach((id: string) => deletedMeetingIds.add(id));
        await client.query('DELETE FROM meetings WHERE id = ANY($1)', [d.meetings]);
        console.log('[DB DELETE] Batch deleted meetings:', d.meetings);
      }
      if (Array.isArray(d.resolutions) && d.resolutions.length > 0) {
        d.resolutions.forEach((id: string) => deletedResolutionIds.add(id));
        await client.query('DELETE FROM resolutions WHERE id = ANY($1)', [d.resolutions]);
        console.log('[DB DELETE] Batch deleted resolutions:', d.resolutions);
      }
      const txs = d.financialTransactions || d.transactions;
      if (Array.isArray(txs) && txs.length > 0) {
        txs.forEach((id: string) => deletedTxIds.add(id));
        await client.query('DELETE FROM financial_transactions WHERE id = ANY($1)', [txs]);
        console.log('[DB DELETE] Batch deleted transactions:', txs);
      }
      if (Array.isArray(d.announcements) && d.announcements.length > 0) {
        d.announcements.forEach((id: string) => deletedAnnouncementIds.add(id));
        await client.query('DELETE FROM announcements WHERE id = ANY($1)', [d.announcements]);
        console.log('[DB DELETE] Batch deleted announcements:', d.announcements);
      }
      if (Array.isArray(d.products) && d.products.length > 0) {
        d.products.forEach((id: string) => deletedProductIds.add(id));
        await client.query('DELETE FROM products WHERE id = ANY($1)', [d.products]);
        console.log('[DB DELETE] Batch deleted products:', d.products);
      }
      if (Array.isArray(d.activities) && d.activities.length > 0) {
        d.activities.forEach((id: string) => deletedActivityIds.add(id));
        await client.query('DELETE FROM activities WHERE id = ANY($1)', [d.activities]);
        console.log('[DB DELETE] Batch deleted activities:', d.activities);
      }
      const funds = d.funds || d.organizationFunds;
      if (Array.isArray(funds) && funds.length > 0) {
        funds.forEach((id: string) => deletedFundIds.add(id));
        await client.query('DELETE FROM organization_funds WHERE id = ANY($1)', [funds]);
        console.log('[DB DELETE] Batch deleted funds:', funds);
      }
      const auds = d.auditorReports || d.auditor_reports;
      if (Array.isArray(auds) && auds.length > 0) {
        auds.forEach((id: string) => deletedAuditorIds.add(id));
        await client.query('DELETE FROM auditor_reports WHERE id = ANY($1)', [auds]);
      }
      const dels = d.delegationRequests || d.delegation_requests;
      if (Array.isArray(dels) && dels.length > 0) {
        dels.forEach((id: string) => deletedDelegationIds.add(id));
        await client.query('DELETE FROM delegation_requests WHERE id = ANY($1)', [dels]);
      }
    }

    // 2. Single item deletion support
    if (state.deleteItem && state.deleteItem.entity && state.deleteItem.id) {
      const tableMap: Record<string, string> = {
        user: 'users',
        users: 'users',
        officer: 'users',
        officers: 'users',
        member: 'members',
        members: 'members',
        meeting: 'meetings',
        meetings: 'meetings',
        resolution: 'resolutions',
        resolutions: 'resolutions',
        transaction: 'financial_transactions',
        transactions: 'financial_transactions',
        financialtransaction: 'financial_transactions',
        financialtransactions: 'financial_transactions',
        financial_transaction: 'financial_transactions',
        financial_transactions: 'financial_transactions',
        announcement: 'announcements',
        announcements: 'announcements',
        product: 'products',
        products: 'products',
        activity: 'activities',
        activities: 'activities',
        fund: 'organization_funds',
        funds: 'organization_funds'
      };
      const normEntity = state.deleteItem.entity.toLowerCase().replace(/[-_]/g, '');
      const tbl = tableMap[state.deleteItem.entity] || tableMap[state.deleteItem.entity.toLowerCase()] || tableMap[normEntity];
      if (tbl) {
        await client.query(`DELETE FROM ${tbl} WHERE id = $1`, [state.deleteItem.id]);
        if (tbl === 'users') deletedUserIds.add(state.deleteItem.id);
        if (tbl === 'members') deletedMemberIds.add(state.deleteItem.id);
        if (tbl === 'meetings') deletedMeetingIds.add(state.deleteItem.id);
        if (tbl === 'resolutions') deletedResolutionIds.add(state.deleteItem.id);
        if (tbl === 'financial_transactions') deletedTxIds.add(state.deleteItem.id);
        if (tbl === 'announcements') deletedAnnouncementIds.add(state.deleteItem.id);
        if (tbl === 'products') deletedProductIds.add(state.deleteItem.id);
        if (tbl === 'activities') deletedActivityIds.add(state.deleteItem.id);
        if (tbl === 'organization_funds') deletedFundIds.add(state.deleteItem.id);
        console.log(`[DB DELETE] Single deleted ${tbl} ID: ${state.deleteItem.id}`);
      }
    }

    // 1. Users (filtered to never re-insert deleted users)
    if (state.users && Array.isArray(state.users)) {
      const activeUsers = state.users.filter((u: any) => !deletedUserIds.has(u.id));
      console.log('[DB DEBUG] Saving', activeUsers.length, 'users...');
      for (const u of activeUsers) {
        await client.query(`
          INSERT INTO users (id, username, password, name, role, is_approved, joined_date, farm_location, farm_size, primary_crops, contact_number, status, avatar_url, member_id_number, rsbsa_number, is_rsbsa_registered)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            is_approved = EXCLUDED.is_approved,
            joined_date = EXCLUDED.joined_date,
            farm_location = EXCLUDED.farm_location,
            farm_size = EXCLUDED.farm_size,
            primary_crops = EXCLUDED.primary_crops,
            contact_number = EXCLUDED.contact_number,
            status = EXCLUDED.status,
            avatar_url = EXCLUDED.avatar_url,
            member_id_number = EXCLUDED.member_id_number,
            rsbsa_number = EXCLUDED.rsbsa_number,
            is_rsbsa_registered = EXCLUDED.is_rsbsa_registered;
        `, [
          u.id, u.username, u.password || 'password123', u.name, u.role, u.isApproved,
          u.joinedDate || null, u.farmLocation || null, u.farmSize || null,
          u.primaryCrops || [], u.contactNumber || null, u.status || 'Active',
          u.avatarUrl || null, u.memberIdNumber || null, u.rsbsaNumber || null,
          Boolean(u.isRsbsaRegistered)
        ]);
      }
      console.log('[DB DEBUG] Users saved');
    }

    // 2. Members (filtered to never re-insert deleted members)
    if (state.members && Array.isArray(state.members)) {
      const activeMembers = state.members.filter((m: any) => !deletedMemberIds.has(m.id));
      console.log('[DB DEBUG] Saving', activeMembers.length, 'members...');
      for (const m of activeMembers) {
        await client.query(`
          INSERT INTO members (id, name, farm_location, farm_size, primary_crops, contact_number, status, joined_date, member_id_number, rsbsa_number, is_rsbsa_registered, avatar_url, gender, birth_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            farm_location = EXCLUDED.farm_location,
            farm_size = EXCLUDED.farm_size,
            primary_crops = EXCLUDED.primary_crops,
            contact_number = EXCLUDED.contact_number,
            status = EXCLUDED.status,
            joined_date = EXCLUDED.joined_date,
            member_id_number = EXCLUDED.member_id_number,
            rsbsa_number = EXCLUDED.rsbsa_number,
            is_rsbsa_registered = EXCLUDED.is_rsbsa_registered,
            avatar_url = EXCLUDED.avatar_url,
            gender = EXCLUDED.gender,
            birth_date = EXCLUDED.birth_date;
        `, [
          m.id, m.name, m.farmLocation || null, m.farmSize || null,
          m.primaryCrops || [], m.contactNumber || null, m.status || 'Active',
          m.joinedDate || null, m.memberIdNumber || null, m.rsbsaNumber || null,
          Boolean(m.isRsbsaRegistered), m.avatarUrl || null, m.gender || null,
          m.birthDate || null
        ]);
      }
      console.log('[DB DEBUG] Members saved');
    }

    // 3. Transactions (filtered to never re-insert deleted transactions)
    const rawTxList = state.financialTransactions || state.transactions;
    if (rawTxList && Array.isArray(rawTxList)) {
      const txList = rawTxList.filter((tx: any) => !deletedTxIds.has(tx.id));
      console.log('[DB DEBUG] Saving', txList.length, 'transactions...');
      for (const tx of txList) {
        await client.query(`
          INSERT INTO financial_transactions (id, type, category, amount, date, description, recorded_by, fund_source, audited_status, audited_by, audited_date, audit_notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            date = EXCLUDED.date,
            description = EXCLUDED.description,
            recorded_by = EXCLUDED.recorded_by,
            fund_source = EXCLUDED.fund_source,
            audited_status = EXCLUDED.audited_status,
            audited_by = EXCLUDED.audited_by,
            audited_date = EXCLUDED.audited_date,
            audit_notes = EXCLUDED.audit_notes;
        `, [
          tx.id, tx.type, tx.category, tx.amount, tx.date, tx.description,
          tx.recordedBy, tx.fundSource || null, tx.auditedStatus || 'Unaudited', tx.auditedBy || null,
          tx.auditedDate || null, tx.auditNotes || null
        ]);
      }
      console.log('[DB DEBUG] Transactions saved');
    }

    // 4. Meetings (filtered to never re-insert deleted meetings)
    if (state.meetings && Array.isArray(state.meetings)) {
      const activeMeetings = state.meetings.filter((mt: any) => !deletedMeetingIds.has(mt.id));
      console.log('[DB DEBUG] Saving', activeMeetings.length, 'meetings...');
      for (const mt of activeMeetings) {
        await client.query(`
          INSERT INTO meetings (id, title, date, location, attendance_count, agenda, minutes, officer_in_charge, attendance_record)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            date = EXCLUDED.date,
            location = EXCLUDED.location,
            attendance_count = EXCLUDED.attendance_count,
            agenda = EXCLUDED.agenda,
            minutes = EXCLUDED.minutes,
            officer_in_charge = EXCLUDED.officer_in_charge,
            attendance_record = EXCLUDED.attendance_record;
        `, [
          mt.id, mt.title, mt.date, mt.location, mt.attendanceCount || 0,
          mt.agenda || '', mt.minutes || '', mt.officerInCharge || '',
          JSON.stringify(mt.attendanceRecord || {})
        ]);
      }
      console.log('[DB DEBUG] Meetings saved');
    }

    // 5. Hog Raising IGP State
    if (state.hogRaising) {
      console.log('[DB DEBUG] Saving hog raising state...');
      const grantAmount = typeof state.hogRaising.capitalGrant === 'number'
        ? state.hogRaising.capitalGrant
        : (Number(state.hogRaising.capitalGrant) || 0);

      await client.query(`
        INSERT INTO hog_raising (id, capital_grant, produces, expenses, sales, groups, chore_logs, closed_years)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          capital_grant = EXCLUDED.capital_grant,
          produces = EXCLUDED.produces,
          expenses = EXCLUDED.expenses,
          sales = EXCLUDED.sales,
          groups = EXCLUDED.groups,
          chore_logs = EXCLUDED.chore_logs,
          closed_years = EXCLUDED.closed_years;
      `, [
        'main_state',
        grantAmount,
        state.hogRaising.produces || ['Hog Raising'],
        JSON.stringify(state.hogRaising.expenses || []),
        JSON.stringify(state.hogRaising.sales || []),
        JSON.stringify(state.hogRaising.groups || []),
        JSON.stringify(state.hogRaising.choreLogs || []),
        state.hogRaising.closedYears || []
      ]);
      await client.query("DELETE FROM hog_raising WHERE id != 'main_state'");
      console.log('[DB DEBUG] Hog raising state saved');
    }

    // 6. System Logs
    const logList = state.systemLogs || state.logs;
    if (logList && Array.isArray(logList)) {
      console.log('[DB DEBUG] Saving', logList.length, 'system logs...');
      for (const lg of logList) {
        await client.query(`
          INSERT INTO system_logs (id, timestamp, user_name, role, action, details, sync_status, hash, previous_hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            timestamp = EXCLUDED.timestamp,
            user_name = EXCLUDED.user_name,
            role = EXCLUDED.role,
            action = EXCLUDED.action,
            details = EXCLUDED.details,
            sync_status = EXCLUDED.sync_status,
            hash = EXCLUDED.hash,
            previous_hash = EXCLUDED.previous_hash;
        `, [
          lg.id, lg.timestamp, (lg as any).user || (lg as any).userName || 'Officer', lg.role, lg.action, lg.details,
          lg.syncStatus || 'synced', lg.hash || null, lg.previousHash || null
        ]);
      }
      console.log('[DB DEBUG] System logs saved');
    }

    // 7. Products (filtered to never re-insert deleted products)
    if (state.products && Array.isArray(state.products)) {
      const activeProducts = state.products.filter((p: any) => !deletedProductIds.has(p.id));
      console.log('[DB DEBUG] Saving', activeProducts.length, 'products...');
      for (const p of activeProducts) {
        await client.query(`
          INSERT INTO products (id, name, ceb_name, category, description, unit, price, quantity_available, stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url, is_published, updated_by, managed_by, date_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            ceb_name = EXCLUDED.ceb_name,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            unit = EXCLUDED.unit,
            price = EXCLUDED.price,
            quantity_available = EXCLUDED.quantity_available,
            stock_status = EXCLUDED.stock_status,
            farmer_name = EXCLUDED.farmer_name,
            farmer_sitio = EXCLUDED.farmer_sitio,
            farmer_phone = EXCLUDED.farmer_phone,
            contact_person = EXCLUDED.contact_person,
            image_url = EXCLUDED.image_url,
            is_published = EXCLUDED.is_published,
            updated_by = EXCLUDED.updated_by,
            managed_by = EXCLUDED.managed_by,
            date_updated = EXCLUDED.date_updated;
        `, [
          p.id, p.name, p.cebName || null, p.category, p.description, p.unit,
          p.price, p.quantityAvailable || null, p.stockStatus, p.farmerName || null,
          p.farmerSitio || null, p.farmerPhone || null, p.contactPerson || null,
          p.imageUrl || null, p.isPublished ?? true, p.updatedBy || null,
          p.managedBy || null, p.dateUpdated || null
        ]);
      }
      console.log('[DB DEBUG] Products saved');
    }

    // 8. Resolutions (filtered to never re-insert deleted resolutions)
    if (state.resolutions && Array.isArray(state.resolutions)) {
      const activeResolutions = state.resolutions.filter((r: any) => !deletedResolutionIds.has(r.id));
      console.log('[DB DEBUG] Saving', activeResolutions.length, 'resolutions...');
      for (const r of activeResolutions) {
        await client.query(`
          INSERT INTO resolutions (id, resolution_number, title, description, date_agreed, moved_by, seconded_by, vote_in_favor, vote_against, vote_abstain, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            resolution_number = EXCLUDED.resolution_number,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            date_agreed = EXCLUDED.date_agreed,
            moved_by = EXCLUDED.moved_by,
            seconded_by = EXCLUDED.seconded_by,
            vote_in_favor = EXCLUDED.vote_in_favor,
            vote_against = EXCLUDED.vote_against,
            vote_abstain = EXCLUDED.vote_abstain,
            status = EXCLUDED.status;
        `, [
          r.id, r.resolutionNumber, r.title, r.description, r.dateAgreed,
          r.movedBy, r.secondedBy, r.voteInFavor, r.voteAgainst, r.voteAbstain, r.status
        ]);
      }
      console.log('[DB DEBUG] Resolutions saved');
    }

    // 9. Announcements (filtered to never re-insert deleted announcements)
    if (state.announcements && Array.isArray(state.announcements)) {
      const activeAnnouncements = state.announcements.filter((a: any) => !deletedAnnouncementIds.has(a.id));
      console.log('[DB DEBUG] Saving', activeAnnouncements.length, 'announcements...');
      for (const a of activeAnnouncements) {
        await client.query(`
          INSERT INTO announcements (id, title, category, content, date_posted, priority, posted_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            content = EXCLUDED.content,
            date_posted = EXCLUDED.date_posted,
            priority = EXCLUDED.priority,
            posted_by = EXCLUDED.posted_by;
        `, [a.id, a.title, a.category, a.content, a.datePosted, a.priority, a.postedBy]);
      }
      console.log('[DB DEBUG] Announcements saved');
    }

    // 10. Activities (filtered to never re-insert deleted activities)
    if (state.activities && Array.isArray(state.activities)) {
      const activeActivities = state.activities.filter((act: any) => !deletedActivityIds.has(act.id));
      console.log('[DB DEBUG] Saving', activeActivities.length, 'activities...');
      for (const act of activeActivities) {
        await client.query(`
          INSERT INTO activities (id, title, ceb_title, category, scheduled_date, date_scheduled, scheduled_time, time_scheduled, location, description, organizer, status, documented_notes, attendees_count, target_audience, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            ceb_title = EXCLUDED.ceb_title,
            category = EXCLUDED.category,
            scheduled_date = EXCLUDED.scheduled_date,
            date_scheduled = EXCLUDED.date_scheduled,
            scheduled_time = EXCLUDED.scheduled_time,
            time_scheduled = EXCLUDED.time_scheduled,
            location = EXCLUDED.location,
            description = EXCLUDED.description,
            organizer = EXCLUDED.organizer,
            status = EXCLUDED.status,
            documented_notes = EXCLUDED.documented_notes,
            attendees_count = EXCLUDED.attendees_count,
            target_audience = EXCLUDED.target_audience,
            image_url = EXCLUDED.image_url;
        `, [
          act.id, act.title, act.cebTitle || null, act.category,
          act.scheduledDate || act.dateScheduled || null,
          act.dateScheduled || act.scheduledDate || null,
          act.scheduledTime || act.timeScheduled || null,
          act.timeScheduled || act.scheduledTime || null,
          act.location, act.description, act.organizer, act.status,
          act.documentedNotes || null, act.attendeesCount || 0,
          act.targetAudience || null, act.imageUrl || null
        ]);
      }
      console.log('[DB DEBUG] Activities saved');
    }

    // 11. Organization Funds (filtered to never re-insert deleted funds)
    const rawFundList = state.organizationFunds || state.funds;
    if (rawFundList && Array.isArray(rawFundList)) {
      const fundList = rawFundList.filter((f: any) => !deletedFundIds.has(f.id));
      console.log('[DB DEBUG] Saving', fundList.length, 'organization funds...');
      for (const f of fundList) {
        await client.query(`
          INSERT INTO organization_funds (id, name, code, allocated_amount, current_balance, description, custodian, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            allocated_amount = EXCLUDED.allocated_amount,
            current_balance = EXCLUDED.current_balance,
            description = EXCLUDED.description,
            custodian = EXCLUDED.custodian,
            last_updated = EXCLUDED.last_updated;
        `, [
          f.id, f.name, f.code, f.allocatedAmount || 0, f.currentBalance || 0,
          f.description || '', f.custodian || '', f.lastUpdated || new Date().toISOString().split('T')[0]
        ]);
      }
      console.log('[DB DEBUG] Organization funds saved');
    }

    // 12. Auditor Reports
    if (state.auditorReports && Array.isArray(state.auditorReports)) {
      console.log('[DB DEBUG] Saving', state.auditorReports.length, 'auditor reports...');
      for (const ar of state.auditorReports) {
        await client.query(`
          INSERT INTO auditor_reports (id, report_period, report_type, total_income, total_expenses, net_surplus, findings, recommendations, prepared_by, certified_by, status, date_submitted, date_certified)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            report_period = EXCLUDED.report_period,
            report_type = EXCLUDED.report_type,
            total_income = EXCLUDED.total_income,
            total_expenses = EXCLUDED.total_expenses,
            net_surplus = EXCLUDED.net_surplus,
            findings = EXCLUDED.findings,
            recommendations = EXCLUDED.recommendations,
            prepared_by = EXCLUDED.prepared_by,
            certified_by = EXCLUDED.certified_by,
            status = EXCLUDED.status,
            date_submitted = EXCLUDED.date_submitted,
            date_certified = EXCLUDED.date_certified;
        `, [
          ar.id, ar.reportPeriod, ar.reportType, ar.totalIncome || 0, ar.totalExpenses || 0,
          ar.netSurplus || 0, ar.findings || '', ar.recommendations || '', ar.preparedBy,
          ar.certifiedBy || null, ar.status || 'Submitted', ar.dateSubmitted, ar.dateCertified || null
        ]);
      }
      console.log('[DB DEBUG] Auditor reports saved');
    }

    // 13. Delegation Requests
    if (state.delegationRequests && Array.isArray(state.delegationRequests)) {
      console.log('[DB DEBUG] Saving', state.delegationRequests.length, 'delegation requests...');
      for (const dr of state.delegationRequests) {
        await client.query(`
          INSERT INTO delegation_requests (id, requested_by, reason, requested_date, effective_start, effective_end, status, reviewed_by, reviewed_date, remarks)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            requested_by = EXCLUDED.requested_by,
            reason = EXCLUDED.reason,
            requested_date = EXCLUDED.requested_date,
            effective_start = EXCLUDED.effective_start,
            effective_end = EXCLUDED.effective_end,
            status = EXCLUDED.status,
            reviewed_by = EXCLUDED.reviewed_by,
            reviewed_date = EXCLUDED.reviewed_date,
            remarks = EXCLUDED.remarks;
        `, [
          dr.id, dr.requestedBy, dr.reason, dr.requestedDate, dr.effectiveStart || null,
          dr.effectiveEnd || null, dr.status || 'Pending', dr.reviewedBy || null,
          dr.reviewedDate || null, dr.remarks || null
        ]);
      }
      console.log('[DB DEBUG] Delegation requests saved');
    }

    console.log('[DB DEBUG] Committing transaction...');
    await client.query('COMMIT');
    console.log('[DB DEBUG] Transaction committed successfully');
    return { success: true };
  } catch (err: any) {
    console.error('[DB DEBUG] Transaction failed:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      where: err?.where
    });
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Directly and atomically updates the Capital Grant in PostgreSQL / Supabase
 */
export async function updateDatabaseCapitalGrant(pool: pg.Pool, amount: number): Promise<number> {
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();
  try {
    const numAmount = typeof amount === 'number' ? amount : (parseFloat(amount as any) || 0);
    const res = await client.query(`
      INSERT INTO hog_raising (id, capital_grant, produces, expenses, sales, groups, chore_logs, closed_years)
      VALUES ('main_state', $1, ARRAY['Hog Raising'], '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ARRAY[]::int[])
      ON CONFLICT (id) DO UPDATE SET capital_grant = EXCLUDED.capital_grant
      RETURNING capital_grant;
    `, [numAmount]);
    await client.query("DELETE FROM hog_raising WHERE id != 'main_state'");
    return Number(res.rows[0]?.capital_grant || 0);
  } finally {
    client.release();
  }
}
