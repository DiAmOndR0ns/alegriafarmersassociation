// src/api/auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt2 from "bcryptjs";

// src/api/db.ts
import pg from "pg";
var PgPool = pg?.Pool || pg?.default?.Pool || pg?.default || pg;
var poolInstance = null;
var lastUsedConnectionString = null;
var poolCache = /* @__PURE__ */ new Map();
var poolIdleTimers = /* @__PURE__ */ new Map();
var POOL_IDLE_TTL_MS = 6e4;
function scheduleIdleEviction(connectionString) {
  const existing = poolIdleTimers.get(connectionString);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    poolIdleTimers.delete(connectionString);
    const cached = poolCache.get(connectionString);
    if (!cached) return;
    poolCache.delete(connectionString);
    cached.end().catch(() => {
    });
  }, POOL_IDLE_TTL_MS);
  if (typeof timer?.unref === "function") timer.unref();
  poolIdleTimers.set(connectionString, timer);
}
var DATABASE_URL_ERROR = "DATABASE_URL must point at the hosted Supabase PostgreSQL project.";
function isLoopbackDatabaseUrl(rawUrl) {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, "");
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return /^[a-z]+:\/\/.*@(localhost|127\.0\.0\.1|\[::1\])([:/?]|$)/i.test(urlStr);
  }
}
function isDatabaseConfigured() {
  const dbUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
  return Boolean(
    dbUrl && dbUrl !== "" && !dbUrl.includes("[YOUR-PASSWORD]") && !dbUrl.includes("<password>") && !dbUrl.includes("YOUR_PASSWORD") && !dbUrl.includes("your_supabase_connection_string") && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) && !isLoopbackDatabaseUrl(dbUrl)
  );
}
function cleanDatabaseUrl(rawUrl) {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, "");
  let hostInfo = "Supabase";
  try {
    const parsed = new URL(urlStr);
    hostInfo = `${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}${parsed.pathname}`;
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("ssl");
    return {
      connectionString: parsed.toString(),
      isSsl: true,
      hostInfo
    };
  } catch {
    const cleaned = urlStr.replace(/[\?&]sslmode=[^&]*/g, "").replace(/[\?&]ssl=[^&]*/g, "").replace(/\?$/, "");
    return { connectionString: cleaned, isSsl: true, hostInfo };
  }
}
function getPool() {
  const rawDbUrl = process.env.DATABASE_URL;
  if (rawDbUrl && isLoopbackDatabaseUrl(rawDbUrl)) {
    throw new Error(DATABASE_URL_ERROR);
  }
  if (!rawDbUrl || !isDatabaseConfigured()) {
    throw new Error(DATABASE_URL_ERROR);
  }
  const { connectionString, isSsl } = cleanDatabaseUrl(rawDbUrl);
  const cached = poolCache.get(connectionString);
  if (cached) {
    scheduleIdleEviction(connectionString);
    poolInstance = cached;
    lastUsedConnectionString = connectionString;
    return cached;
  }
  const pool = new PgPool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 7e3,
    idleTimeoutMillis: 1e4,
    max: 6
  });
  pool.on("error", (err) => {
    console.warn("[PostgreSQL Pool Client Error]:", err?.message || err);
  });
  poolCache.set(connectionString, pool);
  scheduleIdleEviction(connectionString);
  poolInstance = pool;
  lastUsedConnectionString = connectionString;
  return pool;
}
async function runSchemaMigrations(client) {
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
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::jsonb;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_failed_logins INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_requested BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_step BIGINT;`,
    `UPDATE users SET mfa_enabled = TRUE WHERE lower(replace(role, ' ', '_')) = 'president' AND mfa_enabled = FALSE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users (lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN ('member', 'board_member');`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_status VARCHAR(50) DEFAULT 'Unaudited';`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audit_notes TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approval_status VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approved_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approved_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approval_remarks TEXT;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,
    `CREATE TABLE IF NOT EXISTS afa_igp (id VARCHAR(100) PRIMARY KEY, opening_hog_count INTEGER NOT NULL DEFAULT 0, herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb, produces TEXT[], expenses JSONB, sales JSONB, groups JSONB, chore_logs JSONB, closed_years INT[]);`,
    // The herd breakdown is stored as JSONB but its keys are declared by the
    // application (fattening, gestation, lactating, dispersal, cattleFattening,
    // cattleDispersal, rtlCount). Keep the default in step with the writer; the
    // column is added first so this ALTER cannot reference a missing column.
    `ALTER TABLE afa_igp ADD COLUMN IF NOT EXISTS herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb;`,
    `ALTER TABLE afa_igp ALTER COLUMN herd_breakdown SET DEFAULT '{"fattening":0,"gestation":0,"lactating":0,"dispersal":0,"cattleFattening":0,"cattleDispersal":0,"rtlCount":0}'::jsonb;`,
    // IGP ledger. Each record is its own row with typed columns so the books can
    // be queried, summed and audited in SQL. `expense_data` is kept only as the
    // original snapshot for rollback; the columns are the source of truth.
    `CREATE TABLE IF NOT EXISTS afa_igp_expenses (
      id VARCHAR(100) PRIMARY KEY,
      produce TEXT NOT NULL,
      date VARCHAR(50),
      category VARCHAR(100),
      quantity NUMERIC DEFAULT 0,
      description TEXT,
      amount NUMERIC NOT NULL DEFAULT 0,
      recorded_by TEXT,
      fund_source TEXT,
      hog_stage VARCHAR(50),
      expense_data JSONB
    );`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100);`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS description TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC NOT NULL DEFAULT 0;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS recorded_by TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS hog_stage VARCHAR(50);`,
    `ALTER TABLE afa_igp_expenses ALTER COLUMN expense_data DROP NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);`,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_date_idx ON afa_igp_expenses (date);`,
    `CREATE TABLE IF NOT EXISTS afa_igp_sales (
      id VARCHAR(100) PRIMARY KEY,
      produce TEXT NOT NULL,
      date VARCHAR(50),
      hog_stage VARCHAR(50),
      hogs_count INTEGER NOT NULL DEFAULT 0,
      produce_count INTEGER NOT NULL DEFAULT 0,
      revenue NUMERIC NOT NULL DEFAULT 0,
      recorded_by TEXT,
      fund_source TEXT,
      notes TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS afa_igp_sales_produce_idx ON afa_igp_sales (produce);`,
    `CREATE INDEX IF NOT EXISTS afa_igp_sales_date_idx ON afa_igp_sales (date);`,
    `CREATE TABLE IF NOT EXISTS afa_igp_harvests (
      id VARCHAR(100) PRIMARY KEY,
      produce TEXT,
      date VARCHAR(50),
      time VARCHAR(50),
      collected_by TEXT NOT NULL,
      egg_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'Pending Audit',
      audited_by TEXT,
      audited_date VARCHAR(50),
      audit_remarks TEXT,
      signed_by TEXT,
      signed_date VARCHAR(50),
      signature_remarks TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS afa_igp_harvests_status_idx ON afa_igp_harvests (status);`,
    `CREATE INDEX IF NOT EXISTS afa_igp_harvests_collected_idx ON afa_igp_harvests (collected_by);`,
    `CREATE TABLE IF NOT EXISTS afa_igp_groups (
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_days TEXT[],
      sort_order INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS afa_igp_group_members (
      group_id VARCHAR(100) NOT NULL REFERENCES afa_igp_groups(id) ON DELETE CASCADE,
      member_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, member_name)
    );`,
    // --- Backfill from the legacy JSONB arrays (idempotent). ---
    `INSERT INTO afa_igp_expenses (id, produce, date, category, quantity, description, amount, recorded_by, fund_source, hog_stage, expense_data)
      SELECT expense->>'id',
        COALESCE(NULLIF(expense->>'produce', ''), 'Swine Raising (Baboyan)'),
        NULLIF(expense->>'date', ''),
        NULLIF(expense->>'category', ''),
        COALESCE(NULLIF(expense->>'quantity', ''), '0')::numeric,
        expense->>'description',
        COALESCE(NULLIF(expense->>'amount', ''), '0')::numeric,
        NULLIF(expense->>'recordedBy', ''),
        NULLIF(expense->>'fundSource', ''),
        NULLIF(expense->>'hogStage', ''),
        expense
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.expenses) = 'array' THEN igp.expenses ELSE '[]'::jsonb END
      ) AS item(expense)
      WHERE NULLIF(expense->>'id', '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO afa_igp_sales (id, produce, date, hog_stage, hogs_count, produce_count, revenue, recorded_by, fund_source, notes)
      SELECT sale->>'id',
        COALESCE(NULLIF(sale->>'produce', ''), 'Swine Raising (Baboyan)'),
        NULLIF(sale->>'date', ''),
        NULLIF(sale->>'hogStage', ''),
        COALESCE(NULLIF(sale->>'hogsCount', ''), '0')::integer,
        COALESCE(NULLIF(sale->>'produceCount', ''), '0')::integer,
        COALESCE(NULLIF(sale->>'revenue', ''), '0')::numeric,
        NULLIF(sale->>'recordedBy', ''),
        NULLIF(sale->>'fundSource', ''),
        NULLIF(sale->>'notes', '')
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.sales) = 'array' THEN igp.sales ELSE '[]'::jsonb END
      ) AS item(sale)
      WHERE NULLIF(sale->>'id', '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO afa_igp_harvests (id, produce, date, time, collected_by, egg_count, notes, status, audited_by, audited_date, audit_remarks, signed_by, signed_date, signature_remarks)
      SELECT harvest->>'id',
        NULLIF(harvest->>'produce', ''),
        NULLIF(harvest->>'date', ''),
        NULLIF(harvest->>'time', ''),
        COALESCE(NULLIF(harvest->>'collectedBy', ''), 'Unknown'),
        COALESCE(NULLIF(harvest->>'eggCount', ''), '0')::integer,
        NULLIF(harvest->>'notes', ''),
        COALESCE(NULLIF(harvest->>'status', ''), 'Pending Audit'),
        NULLIF(harvest->>'auditedBy', ''),
        NULLIF(harvest->>'auditedDate', ''),
        NULLIF(harvest->>'auditRemarks', ''),
        NULLIF(harvest->>'signedBy', ''),
        NULLIF(harvest->>'signedDate', ''),
        NULLIF(harvest->>'signatureRemarks', '')
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.chore_logs) = 'array' THEN igp.chore_logs ELSE '[]'::jsonb END
      ) AS item(harvest)
      WHERE NULLIF(harvest->>'id', '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO afa_igp_groups (id, name, schedule_days, sort_order)
      SELECT grp->>'id',
        COALESCE(NULLIF(grp->>'name', ''), 'Group'),
        CASE WHEN jsonb_typeof(grp->'scheduleDays') = 'array'
          THEN ARRAY(SELECT jsonb_array_elements_text(grp->'scheduleDays'))
          ELSE ARRAY[]::text[] END,
        row_number() OVER ()
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.groups) = 'array' THEN igp.groups ELSE '[]'::jsonb END
      ) AS item(grp)
      WHERE NULLIF(grp->>'id', '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;`,
    `INSERT INTO afa_igp_group_members (group_id, member_name, position)
      SELECT grp->>'id', member, position - 1
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.groups) = 'array' THEN igp.groups ELSE '[]'::jsonb END
      ) AS item(grp)
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(grp->'members') = 'array' THEN grp->'members' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS m(member, position)
      WHERE NULLIF(grp->>'id', '') IS NOT NULL
      ON CONFLICT (group_id, member_name) DO NOTHING;`,
    `DROP TABLE IF EXISTS hog_raising;`,
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
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS status_reason TEXT;`,
    `CREATE TABLE IF NOT EXISTS achievements (
      id VARCHAR(100) PRIMARY KEY,
      year VARCHAR(20) NOT NULL,
      title TEXT NOT NULL,
      ceb_title TEXT,
      description TEXT NOT NULL,
      icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
    );`,
    `CREATE TABLE IF NOT EXISTS organization_funds (
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      code VARCHAR(50) NOT NULL,
      allocated_amount NUMERIC DEFAULT 0,
      current_balance NUMERIC DEFAULT 0,
      description TEXT,
      custodian TEXT,
      last_updated VARCHAR(50)
    );`,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS category TEXT;`,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS source_origin TEXT;`,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS initial_fund NUMERIC DEFAULT 0;`,
    // Legacy databases still carry allocated_amount; newer ones only have initial_fund.
    // Guard the backfill so a missing legacy column cannot fail the whole migration.
    `DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
         UPDATE organization_funds SET initial_fund = allocated_amount
          WHERE (initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
       END IF;
     END $$;`,
    `ALTER TABLE organization_funds DROP CONSTRAINT IF EXISTS organization_funds_code_key;`,
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
  const failures = [];
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (error) {
      const message = error?.message || String(error);
      failures.push({ statement: stmt, error: message });
      console.error("[Schema Migration Failure]:", message, "\nStatement:", stmt);
    }
  }
  if (failures.length > 0) {
    const details = failures.map(({ statement, error }) => `- ${error}: ${statement}`).join("\n");
    throw new Error(`Schema migration failed for ${failures.length} statement(s):
${details}`);
  }
}
async function initDatabaseSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
        primary_crops TEXT[],
        contact_number VARCHAR(50),
        status VARCHAR(50),
        avatar_url TEXT,
        member_id_number VARCHAR(100),
        rsbsa_number VARCHAR(100),
        is_rsbsa_registered BOOLEAN DEFAULT FALSE,
        password_history JSONB DEFAULT '[]'::jsonb,
        password_changed_at TIMESTAMPTZ,
        must_change_password BOOLEAN DEFAULT FALSE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMPTZ,
        total_failed_logins INTEGER DEFAULT 0,
        reset_requested BOOLEAN DEFAULT FALSE
        ,totp_secret TEXT
        ,pending_totp_secret TEXT
        ,mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
        ,totp_last_used_step BIGINT
      );
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users (lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN ('member', 'board_member');`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        farm_location TEXT,
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_transactions (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        category VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL,
        date VARCHAR(50),
        description TEXT,
        recorded_by TEXT,
        activity_id VARCHAR(100),
        fund_source TEXT,
        audited_status VARCHAR(50) DEFAULT 'Unaudited',
        audited_by TEXT,
        audited_date VARCHAR(50),
        audit_notes TEXT
      );
    `);
    await client.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS president_approval_status VARCHAR(50),
        ADD COLUMN IF NOT EXISTS president_approved_by TEXT,
        ADD COLUMN IF NOT EXISTS president_approved_date VARCHAR(50),
        ADD COLUMN IF NOT EXISTS president_approval_remarks TEXT;
    `);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp (
        id VARCHAR(100) PRIMARY KEY,
        opening_hog_count INTEGER NOT NULL DEFAULT 0,
        herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb,
        produces TEXT[],
        expenses JSONB,
        sales JSONB,
        groups JSONB,
        chore_logs JSONB,
        closed_years INT[]
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_expenses (
        id VARCHAR(100) PRIMARY KEY,
        produce TEXT NOT NULL,
        date VARCHAR(50),
        category VARCHAR(100),
        quantity NUMERIC DEFAULT 0,
        description TEXT,
        amount NUMERIC NOT NULL DEFAULT 0,
        recorded_by TEXT,
        fund_source TEXT,
        hog_stage VARCHAR(50),
        expense_data JSONB
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);");
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_expenses_date_idx ON afa_igp_expenses (date);");
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_sales (
        id VARCHAR(100) PRIMARY KEY,
        produce TEXT NOT NULL,
        date VARCHAR(50),
        hog_stage VARCHAR(50),
        hogs_count INTEGER NOT NULL DEFAULT 0,
        produce_count INTEGER NOT NULL DEFAULT 0,
        revenue NUMERIC NOT NULL DEFAULT 0,
        recorded_by TEXT,
        fund_source TEXT,
        notes TEXT
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_sales_produce_idx ON afa_igp_sales (produce);");
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_sales_date_idx ON afa_igp_sales (date);");
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_harvests (
        id VARCHAR(100) PRIMARY KEY,
        produce TEXT,
        date VARCHAR(50),
        time VARCHAR(50),
        collected_by TEXT NOT NULL,
        egg_count INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending Audit',
        audited_by TEXT,
        audited_date VARCHAR(50),
        audit_remarks TEXT,
        signed_by TEXT,
        signed_date VARCHAR(50),
        signature_remarks TEXT
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_harvests_status_idx ON afa_igp_harvests (status);");
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_groups (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        schedule_days TEXT[],
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_group_members (
        group_id VARCHAR(100) NOT NULL REFERENCES afa_igp_groups(id) ON DELETE CASCADE,
        member_name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (group_id, member_name)
      );
    `);
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
        status_reason TEXT,
        documented_notes TEXT,
        attendees_count INTEGER DEFAULT 0,
        target_audience TEXT,
        image_url TEXT
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id VARCHAR(100) PRIMARY KEY,
        year VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        ceb_title TEXT,
        description TEXT NOT NULL,
        icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_funds (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        code VARCHAR(50) NOT NULL,
        initial_fund NUMERIC DEFAULT 0,
        current_balance NUMERIC DEFAULT 0,
        description TEXT,
        custodian TEXT,
        last_updated VARCHAR(50)
      );
    `);
    await client.query(`
      ALTER TABLE organization_funds
        ADD COLUMN IF NOT EXISTS category TEXT,
        ADD COLUMN IF NOT EXISTS source_origin TEXT,
        ADD COLUMN IF NOT EXISTS initial_fund NUMERIC DEFAULT 0;
    `);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
          UPDATE organization_funds SET initial_fund = allocated_amount
           WHERE (initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
        END IF;
      END $$;
    `);
    await client.query(`
      ALTER TABLE organization_funds
        DROP CONSTRAINT IF EXISTS organization_funds_code_key;
    `);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id VARCHAR(100) PRIMARY KEY,
        timestamp VARCHAR(100),
        action VARCHAR(50),
        entity_type VARCHAR(50),
        payload JSONB,
        status VARCHAR(50) DEFAULT 'synced'
      );
    `);
    await client.query("COMMIT");
    console.log("[DB DEBUG] Database schema initialized successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[DB DEBUG] Schema initialization failed:", err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}
var schemaInitialized = false;
async function ensureDatabaseSchema(pool) {
  if (schemaInitialized) return;
  const client = await pool.connect();
  try {
    console.log("[DB DEBUG] ensureDatabaseSchema: Checking tables...");
    const check = await client.query(`SELECT to_regclass('public.members') as members_table`);
    console.log("[DB DEBUG] members table exists:", check.rows[0]?.members_table);
    if (!check.rows[0]?.members_table) {
      console.log("[DB DEBUG] Creating database schema...");
      await initDatabaseSchema(pool);
    } else {
      console.log("[DB DEBUG] Running schema migrations...");
      await runSchemaMigrations(client);
    }
    schemaInitialized = true;
  } catch (err) {
    console.error("[DB DEBUG] ensureDatabaseSchema failed:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint
    });
    throw err;
  } finally {
    client.release();
  }
}

// src/api/helper.ts
function sendResponse(res, statusCode, data) {
  try {
    if (res.headersSent) return;
    if (typeof res.setHeader === "function") {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
    }
    if (typeof res.status === "function" && typeof res.json === "function") {
      return res.status(statusCode).json(data);
    }
    res.statusCode = statusCode;
    if (typeof res.setHeader === "function") {
      res.setHeader("Content-Type", "application/json");
    }
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error("[sendResponse Error]:", err);
  }
}
async function parseRequestBody(req) {
  const maxBytes = 1024 * 1024;
  if (req.body !== void 0 && req.body !== null) {
    const body = req.body;
    const byteLength = typeof body === "string" ? Buffer.byteLength(body, "utf8") : Buffer.byteLength(JSON.stringify(body), "utf8");
    if (byteLength > maxBytes) {
      const error = new Error("Request body exceeds the 1 MiB limit.");
      error.statusCode = 413;
      throw error;
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    }
    return body;
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      size += Buffer.byteLength(text, "utf8");
      if (size > maxBytes) {
        settled = true;
        const error = new Error("Request body exceeds the 1 MiB limit.");
        error.statusCode = 413;
        reject(error);
        req.destroy(error);
        return;
      }
      raw += text;
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Request body contains invalid JSON.", { cause: error }));
      }
    });
    req.on("aborted", () => {
      if (settled) return;
      settled = true;
      reject(new Error("Request body was aborted before it was fully received."));
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new Error("Failed to read request body.", { cause: error }));
    });
  });
}

// src/utils/passwordPolicy.ts
import bcrypt from "bcryptjs";
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;

// src/api/auth.ts
var SESSION_SECONDS = 8 * 60 * 60;
var CHALLENGE_SECONDS = 15 * 60;
var ephemeralFallbackSecret = null;
var TOKEN_AUDIENCE = "fams-auth-v2";
function signingSecret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32 || new Set(value).size < 16 || /^(change.?me|secret|password)/i.test(value)) {
    const deploymentSeed = process.env.FAMS_SESSION_SEED;
    if (deploymentSeed && deploymentSeed.length >= 32) {
      return createHash("sha256").update(deploymentSeed).digest();
    }
    if (!ephemeralFallbackSecret) {
      console.warn("[Auth] SESSION_SECRET is missing or weak; using a per-process key. Sessions end on redeploy.");
      ephemeralFallbackSecret = createHash("sha256").update(randomBytes(32)).digest();
    }
    return ephemeralFallbackSecret;
  }
  return Buffer.from(value, "utf8");
}
function verifyToken(token) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", signingSecret()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.sub || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1e3)) return null;
    if (claims.aud !== TOKEN_AUDIENCE) return null;
    return claims;
  } catch {
    return null;
  }
}
function rejectCrossOriginMutation(req) {
  const fetchSite = String(req.headers?.["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return true;
  const origin = req.headers?.origin;
  if (!origin) return false;
  try {
    const originUrl = new URL(String(origin));
    const configured = process.env.APP_ORIGIN;
    if (configured) return originUrl.origin !== new URL(configured).origin;
    const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || req.get?.("host") || "").split(",")[0].trim();
    const proto = String(req.headers?.["x-forwarded-proto"] || (req.secure ? "https" : "http")).split(",")[0].trim();
    return originUrl.origin !== `${proto}://${host}`;
  } catch {
    return true;
  }
}
function encodeBase32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[value << 5 - bits & 31];
  return output;
}
async function initialize(pool) {
  await ensureDatabaseSchema(pool);
}
async function readBody(req) {
  try {
    return await parseRequestBody(req);
  } catch {
    return null;
  }
}
function errorResponse(res, status, message) {
  return sendResponse(res, status, { success: false, message });
}
async function mfaEnrollHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  try {
    signingSecret();
    const body = await readBody(req);
    const claims = body?.challengeToken ? verifyToken(String(body.challengeToken)) : null;
    if (!claims || claims.kind !== "mfa-setup") {
      return errorResponse(res, 401, "Invalid or expired MFA challenge.");
    }
    if (!claims.bootstrap && !claims.passwordVerified) {
      return errorResponse(res, 401, "Invalid or expired MFA challenge.");
    }
    const pool = getPool();
    await initialize(pool);
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [claims.sub]);
    const user = result.rows[0];
    if (!user || !user.is_approved) {
      return errorResponse(res, 401, "Invalid or expired MFA challenge.");
    }
    if (user.totp_secret) {
      return errorResponse(res, 409, "An authenticator is already enrolled for this account.");
    }
    const secret = user.pending_totp_secret || encodeBase32(randomBytes(20));
    if (!user.pending_totp_secret) {
      await pool.query("UPDATE users SET pending_totp_secret = $1 WHERE id = $2", [secret, user.id]);
    }
    return sendResponse(res, 200, {
      success: true,
      mfaSetupRequired: true,
      secret,
      otpauthUrl: `otpauth://totp/${encodeURIComponent(`FAMS:${user.username}`)}?secret=${secret}&issuer=FAMS&algorithm=SHA1&digits=6&period=30`
    });
  } catch (error) {
    console.error("[Auth MFA enroll failure]", error);
    return errorResponse(res, 500, "Unable to start authenticator setup.");
  }
}
export {
  mfaEnrollHandler as default
};
