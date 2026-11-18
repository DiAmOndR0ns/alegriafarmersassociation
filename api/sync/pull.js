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
  const dropTlsParams = (url) => {
    for (const key of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey"]) {
      url.searchParams.delete(key);
    }
  };
  try {
    const parsed = new URL(urlStr);
    hostInfo = `${parsed.hostname}${parsed.port ? ":" + parsed.port : ""}${parsed.pathname}`;
    dropTlsParams(parsed);
    return {
      connectionString: parsed.toString(),
      isSsl: true,
      hostInfo
    };
  } catch {
    const cleaned = urlStr.replace(/[?&](?:sslmode|ssl|sslrootcert|sslcert|sslkey)=[^&]*/g, "").replace(/\?$/, "");
    return { connectionString: cleaned, isSsl: true, hostInfo };
  }
}
function getDatabaseSslOptions() {
  const encodedCa = process.env.SUPABASE_CA_CERT_BASE64?.trim();
  if (!encodedCa) return { rejectUnauthorized: false };
  const ca = Buffer.from(encodedCa, "base64").toString("utf8").trim();
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
    console.warn("[DB TLS] SUPABASE_CA_CERT_BASE64 is not a PEM certificate; ignoring it.");
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true, ca };
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
    ssl: getDatabaseSslOptions(),
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
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS purpose TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS liquidation_deadline VARCHAR(50);`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_approval_status VARCHAR(50);`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approved_by TEXT;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approved_date VARCHAR(50);`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approval_remarks TEXT;`,
    `CREATE TABLE IF NOT EXISTS afa_igp (id VARCHAR(100) PRIMARY KEY, opening_hog_count INTEGER NOT NULL DEFAULT 0, herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb, produces TEXT[], expenses JSONB, sales JSONB, chore_logs JSONB, closed_years INT[]);`,
    `ALTER TABLE afa_igp ADD COLUMN IF NOT EXISTS opening_hog_count INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE afa_igp ADD COLUMN IF NOT EXISTS herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb;`,
    `ALTER TABLE afa_igp ADD COLUMN IF NOT EXISTS expenses JSONB;`,
    `CREATE TABLE IF NOT EXISTS afa_igp_expenses (
      id VARCHAR(100) PRIMARY KEY,
      produce TEXT NOT NULL,
      date VARCHAR(50),
      expense_data JSONB,
      category TEXT,
      quantity NUMERIC,
      description TEXT,
      amount NUMERIC,
      recorded_by TEXT,
      fund_source TEXT,
      hog_stage TEXT
    );`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS expense_data JSONB;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS category TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS quantity NUMERIC;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS description TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS recorded_by TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS hog_stage TEXT;`,
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
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_expenses' AND column_name = 'expense_data'
        ) THEN
          EXECUTE $migration$
            UPDATE afa_igp_expenses SET
              category = COALESCE(NULLIF(category, ''), expense_data->>'category'),
              quantity = CASE
                WHEN quantity IS NULL OR quantity = 0 THEN
                  CASE WHEN COALESCE(expense_data->>'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (expense_data->>'quantity')::numeric ELSE quantity END
                ELSE quantity END,
              description = COALESCE(NULLIF(description, ''), expense_data->>'description'),
              amount = CASE
                WHEN amount IS NULL OR amount = 0 THEN
                  CASE WHEN COALESCE(expense_data->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                    THEN (expense_data->>'amount')::numeric ELSE amount END
                ELSE amount END,
              recorded_by = COALESCE(NULLIF(recorded_by, ''), expense_data->>'recordedBy'),
              fund_source = COALESCE(NULLIF(fund_source, ''), expense_data->>'fundSource'),
              hog_stage = COALESCE(NULLIF(hog_stage, ''), expense_data->>'hogStage'),
              produce = CASE
                WHEN (COALESCE(hog_stage, expense_data->>'hogStage') = 'RTL'
                  OR COALESCE(category, expense_data->>'category') ~* '(rtl|poultry|chicken|egg)')
                  AND COALESCE(produce, expense_data->>'produce', '') ~* '(swine|hog|baboy|^$)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(NULLIF(produce, ''), NULLIF(expense_data->>'produce', ''), 'Swine Raising (Baboyan)')
              END
            WHERE expense_data IS NOT NULL
          $migration$;
        END IF;
      END $$;`,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'expenses'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_expenses (
              id, produce, date, expense_data, category, quantity, description, amount, recorded_by, fund_source, hog_stage
            )
            SELECT expense->>'id',
              CASE
                WHEN expense->>'hogStage' = 'RTL' OR expense->>'category' ~* '(rtl|poultry|chicken|egg)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(
                  NULLIF(expense->>'produce', ''),
                  CASE WHEN expense->>'category' ~* '(calf|cattle|baka)'
                    THEN 'Cattle Raising (Bakahan)' END,
                  'Swine Raising (Baboyan)'
                )
              END,
              expense->>'date',
              expense,
              expense->>'category',
              CASE WHEN COALESCE(expense->>'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (expense->>'quantity')::numeric END,
              expense->>'description',
              CASE WHEN COALESCE(expense->>'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (expense->>'amount')::numeric END,
              expense->>'recordedBy',
              expense->>'fundSource',
              expense->>'hogStage'
            FROM afa_igp AS igp
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(igp.expenses) = 'array' THEN igp.expenses ELSE '[]'::jsonb END
            ) AS item(expense)
            WHERE NULLIF(expense->>'id', '') IS NOT NULL
            ON CONFLICT (id) DO UPDATE SET
              produce = CASE
                WHEN afa_igp_expenses.produce ~* '(swine|hog|baboy)'
                  AND EXCLUDED.produce ~* '(poultry|rtl|chicken|egg)'
                  THEN EXCLUDED.produce
                ELSE COALESCE(NULLIF(afa_igp_expenses.produce, ''), EXCLUDED.produce)
              END,
              date = COALESCE(NULLIF(afa_igp_expenses.date, ''), EXCLUDED.date),
              expense_data = COALESCE(afa_igp_expenses.expense_data, EXCLUDED.expense_data),
              category = COALESCE(NULLIF(afa_igp_expenses.category, ''), EXCLUDED.category),
              quantity = CASE
                WHEN afa_igp_expenses.quantity IS NULL OR afa_igp_expenses.quantity = 0
                  THEN EXCLUDED.quantity
                ELSE afa_igp_expenses.quantity
              END,
              description = COALESCE(NULLIF(afa_igp_expenses.description, ''), EXCLUDED.description),
              amount = CASE
                WHEN afa_igp_expenses.amount IS NULL OR afa_igp_expenses.amount = 0
                  THEN EXCLUDED.amount
                ELSE afa_igp_expenses.amount
              END,
              recorded_by = COALESCE(NULLIF(afa_igp_expenses.recorded_by, ''), EXCLUDED.recorded_by),
              fund_source = COALESCE(NULLIF(afa_igp_expenses.fund_source, ''), EXCLUDED.fund_source),
              hog_stage = COALESCE(NULLIF(afa_igp_expenses.hog_stage, ''), EXCLUDED.hog_stage)
          $migration$;
        END IF;
      END $$;`,
    `DO $$
      BEGIN
        INSERT INTO afa_igp_sales (
          id, produce, date, hog_stage, hogs_count, produce_count, revenue, recorded_by, fund_source, notes
        )
        SELECT sale->>'id',
          COALESCE(NULLIF(sale->>'produce', ''), 'Unspecified'),
          sale->>'date',
          sale->>'hogStage',
          CASE WHEN COALESCE(sale->>'hogsCount', '') ~ '^[0-9]+$'
            THEN (sale->>'hogsCount')::integer ELSE 0 END,
          CASE WHEN COALESCE(sale->>'produceCount', '') ~ '^[0-9]+$'
            THEN (sale->>'produceCount')::integer ELSE 0 END,
          CASE WHEN COALESCE(sale->>'revenue', '') ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN (sale->>'revenue')::numeric ELSE 0 END,
          sale->>'recordedBy',
          sale->>'fundSource',
          sale->>'notes'
        FROM afa_igp AS igp
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(igp.sales) = 'array' THEN igp.sales ELSE '[]'::jsonb END
        ) AS item(sale)
        WHERE NULLIF(sale->>'id', '') IS NOT NULL
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO afa_igp_harvests (
          id, produce, date, time, collected_by, egg_count, notes, status,
          audited_by, audited_date, audit_remarks, signed_by, signed_date, signature_remarks
        )
        SELECT harvest->>'id',
          harvest->>'produce',
          harvest->>'date',
          harvest->>'time',
          COALESCE(NULLIF(harvest->>'collectedBy', ''), 'Unknown'),
          CASE WHEN COALESCE(harvest->>'eggCount', '') ~ '^[0-9]+$'
            THEN (harvest->>'eggCount')::integer ELSE 0 END,
          harvest->>'notes',
          COALESCE(NULLIF(harvest->>'status', ''), 'Pending Audit'),
          harvest->>'auditedBy',
          harvest->>'auditedDate',
          harvest->>'auditRemarks',
          harvest->>'signedBy',
          harvest->>'signedDate',
          harvest->>'signatureRemarks'
        FROM afa_igp AS igp
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(igp.chore_logs) = 'array' THEN igp.chore_logs ELSE '[]'::jsonb END
        ) AS item(harvest)
        WHERE NULLIF(harvest->>'id', '') IS NOT NULL
        ON CONFLICT (id) DO NOTHING;
      END $$;`,
    `DROP TABLE IF EXISTS afa_igp_group_members;`,
    `DROP TABLE IF EXISTS afa_igp_groups;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS groups;`,
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
    `UPDATE financial_transactions AS tx
      SET activity_id = NULL
      WHERE tx.activity_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM activities AS activity WHERE activity.id = tx.activity_id);`,
    `UPDATE inventory AS item
      SET catalog_product_id = NULL
      WHERE item.catalog_product_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM products AS product WHERE product.id = item.catalog_product_id);`,
    `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_activity_id_fkey'
            AND conrelid = 'financial_transactions'::regclass
        ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_activity_id_fkey
            FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_catalog_product_id_fkey'
            AND conrelid = 'inventory'::regclass
        ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_catalog_product_id_fkey
            FOREIGN KEY (catalog_product_id) REFERENCES products(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
      END $$;`,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_activity_id_fkey;`,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_catalog_product_id_fkey;`,
    `CREATE INDEX IF NOT EXISTS financial_transactions_activity_id_idx ON financial_transactions (activity_id);`,
    `CREATE INDEX IF NOT EXISTS inventory_catalog_product_id_idx ON inventory (catalog_product_id);`,
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
    `DO $$
      BEGIN
        IF to_regclass('public.sync_queue') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.sync_queue LIMIT 1) THEN
          DROP TABLE public.sync_queue;
        ELSIF to_regclass('public.sync_queue') IS NOT NULL THEN
          RAISE NOTICE 'Preserving non-empty legacy sync_queue table';
        END IF;
      END $$;`
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
        attendance_record JSONB,
        minutes_approval_status VARCHAR(50),
        approved_by TEXT,
        approved_date VARCHAR(50),
        approval_remarks TEXT
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
        purpose TEXT,
        liquidation_deadline VARCHAR(50),
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
        chore_logs JSONB,
        closed_years INT[]
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_expenses (
        id VARCHAR(100) PRIMARY KEY,
        produce TEXT NOT NULL,
        date VARCHAR(50),
        expense_data JSONB,
        category TEXT,
        quantity NUMERIC,
        description TEXT,
        amount NUMERIC,
        recorded_by TEXT,
        fund_source TEXT,
        hog_stage TEXT
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);");
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
      CREATE TABLE IF NOT EXISTS inventory (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        category VARCHAR(100),
        quantity INTEGER DEFAULT 0,
        damaged_quantity INTEGER DEFAULT 0,
        unit VARCHAR(50),
        item_condition VARCHAR(50),
        location TEXT,
        notes TEXT,
        catalog_product_id VARCHAR(100),
        recorded_by TEXT,
        date_recorded VARCHAR(50),
        last_updated VARCHAR(50)
      );
    `);
    await client.query(`
      ALTER TABLE inventory
        ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS catalog_product_id VARCHAR(100);
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
  try {
    console.log("[DB DEBUG] Ensuring all database tables exist...");
    await initDatabaseSchema(pool);
    const client = await pool.connect();
    try {
      await runSchemaMigrations(client);
    } finally {
      client.release();
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
  }
}
function mergeIgpExpenses(segmentedRows) {
  return segmentedRows.map((row) => {
    const legacy = row.expense_data && typeof row.expense_data === "object" ? row.expense_data : {};
    const legacyString = (key) => typeof legacy[key] === "string" ? legacy[key] : void 0;
    const legacyNumber = (key) => {
      const value = legacy[key];
      if (typeof value !== "number" && typeof value !== "string") return void 0;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : void 0;
    };
    return {
      id: row.id,
      ...row.produce || legacyString("produce") ? { produce: row.produce || legacyString("produce") } : {},
      ...row.date || legacyString("date") ? { date: row.date || legacyString("date") } : {},
      ...row.category || legacyString("category") ? { category: row.category || legacyString("category") } : {},
      ...row.quantity != null || legacyNumber("quantity") != null ? { quantity: Number(row.quantity ?? legacyNumber("quantity")) } : {},
      ...row.description || legacyString("description") ? { description: row.description || legacyString("description") } : {},
      ...row.amount != null || legacyNumber("amount") != null ? { amount: Number(row.amount ?? legacyNumber("amount")) } : {},
      ...row.recorded_by || legacyString("recordedBy") ? { recordedBy: row.recorded_by || legacyString("recordedBy") } : {},
      ...row.fund_source || legacyString("fundSource") ? { fundSource: row.fund_source || legacyString("fundSource") } : {},
      ...row.hog_stage || legacyString("hogStage") ? { hogStage: row.hog_stage || legacyString("hogStage") } : {}
    };
  });
}
function mergeIgpRecords(normalized, legacy) {
  const records = /* @__PURE__ */ new Map();
  for (const record of legacy) {
    if (typeof record?.id === "string" && record.id) records.set(record.id, record);
  }
  for (const record of normalized) {
    if (typeof record?.id !== "string" || !record.id) continue;
    const existing = records.get(record.id);
    records.set(record.id, existing ? { ...existing, ...record } : record);
  }
  return Array.from(records.values());
}
async function fetchAllDataFromPostgres(pool) {
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();
  try {
    const usersRes = await client.query("SELECT * FROM users ORDER BY name ASC");
    const membersRes = await client.query("SELECT * FROM members ORDER BY name ASC");
    const meetingsRes = await client.query("SELECT * FROM meetings ORDER BY date DESC");
    const resolutionsRes = await client.query("SELECT * FROM resolutions ORDER BY date_agreed DESC");
    const transactionsRes = await client.query("SELECT * FROM financial_transactions ORDER BY date DESC");
    const announcementsRes = await client.query("SELECT * FROM announcements ORDER BY date_posted DESC");
    const logsRes = await client.query("SELECT * FROM system_logs ORDER BY timestamp DESC");
    const hogQuery = await client.query("SELECT * FROM afa_igp WHERE id IN ('main_state', 'afa_igp_main', 'hog_raising_main') ORDER BY (id = 'main_state') DESC LIMIT 1");
    const hogRes = hogQuery.rows.length > 0 ? hogQuery : await client.query("SELECT * FROM afa_igp LIMIT 1");
    const igpExpenseRows = await client.query("SELECT * FROM afa_igp_expenses ORDER BY date DESC, id ASC");
    const igpSalesRows = await client.query("SELECT * FROM afa_igp_sales ORDER BY date DESC, id ASC");
    const igpHarvestRows = await client.query("SELECT * FROM afa_igp_harvests ORDER BY date DESC, time DESC, id ASC");
    const productsRes = await client.query("SELECT * FROM products ORDER BY name ASC");
    const inventoryRes = await client.query("SELECT * FROM inventory ORDER BY name ASC");
    const activitiesRes = await client.query("SELECT * FROM activities ORDER BY scheduled_date DESC");
    const achievementsRes = await client.query("SELECT * FROM achievements ORDER BY year DESC, title ASC");
    const fundsRes = await client.query("SELECT * FROM organization_funds ORDER BY name ASC");
    let auditorReports = [];
    let delegationRequests = [];
    try {
      const audRes = await client.query("SELECT * FROM auditor_reports ORDER BY date_submitted DESC");
      auditorReports = audRes.rows.map((r) => ({
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
    } catch {
    }
    try {
      const delRes = await client.query("SELECT * FROM delegation_requests ORDER BY requested_date DESC");
      delegationRequests = delRes.rows.map((r) => ({
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
    } catch {
    }
    let hogState = {
      openingHogCount: 0,
      herdBreakdown: { fattening: 0, gestation: 0, lactating: 0, dispersal: 0, cattleFattening: 0, cattleDispersal: 0, rtlCount: 0 },
      produces: [],
      expenses: [],
      sales: [],
      choreLogs: [],
      eggHarvests: [],
      closedYears: []
    };
    const normalizedSales = igpSalesRows.rows.map((r) => ({
      id: r.id,
      date: r.date || "",
      hogsCount: Number(r.hogs_count || 0),
      produceCount: Number(r.produce_count || 0),
      revenue: Number(r.revenue || 0),
      recordedBy: r.recorded_by || "",
      ...r.produce ? { produce: r.produce } : {},
      ...r.hog_stage ? { hogStage: r.hog_stage } : {},
      ...r.notes ? { notes: r.notes } : {},
      ...r.fund_source ? { fundSource: r.fund_source } : {}
    }));
    const normalizedHarvests = igpHarvestRows.rows.map((r) => ({
      id: r.id,
      date: r.date || "",
      time: r.time || "",
      collectedBy: r.collected_by || "",
      eggCount: Number(r.egg_count || 0),
      status: r.status || "Pending Audit",
      ...r.produce ? { produce: r.produce } : {},
      ...r.notes ? { notes: r.notes } : {},
      ...r.audited_by ? { auditedBy: r.audited_by } : {},
      ...r.audited_date ? { auditedDate: r.audited_date } : {},
      ...r.audit_remarks ? { auditRemarks: r.audit_remarks } : {},
      ...r.signed_by ? { signedBy: r.signed_by } : {},
      ...r.signed_date ? { signedDate: r.signed_date } : {},
      ...r.signature_remarks ? { signatureRemarks: r.signature_remarks } : {}
    }));
    if (hogRes.rows.length > 0) {
      const row = hogRes.rows[0];
      const rawProduces = Array.isArray(row.produces) ? row.produces : [];
      const cleanProduces = rawProduces.filter((p) => Boolean(p && p.trim()) && p !== "Tilapia Breeding" && !p.toLowerCase().includes("tilapia"));
      const rawBreakdown = row.herd_breakdown && typeof row.herd_breakdown === "object" ? row.herd_breakdown : {};
      hogState = {
        openingHogCount: Number(row.opening_hog_count || 0),
        herdBreakdown: {
          fattening: Math.max(0, Math.floor(Number(rawBreakdown.fattening) || 0)),
          gestation: Math.max(0, Math.floor(Number(rawBreakdown.gestation) || 0)),
          lactating: Math.max(0, Math.floor(Number(rawBreakdown.lactating) || 0)),
          dispersal: Math.max(0, Math.floor(Number(rawBreakdown.dispersal) || 0)),
          cattleFattening: Math.max(0, Math.floor(Number(rawBreakdown.cattleFattening) || 0)),
          cattleDispersal: Math.max(0, Math.floor(Number(rawBreakdown.cattleDispersal) || 0)),
          rtlCount: Math.max(0, Math.floor(Number(rawBreakdown.rtlCount) || 0))
        },
        produces: cleanProduces,
        expenses: mergeIgpRecords(
          mergeIgpExpenses(igpExpenseRows.rows),
          Array.isArray(row.expenses) ? row.expenses : []
        ),
        sales: mergeIgpRecords(normalizedSales, Array.isArray(row.sales) ? row.sales : []),
        choreLogs: mergeIgpRecords(normalizedHarvests, Array.isArray(row.chore_logs) ? row.chore_logs : []),
        eggHarvests: mergeIgpRecords(normalizedHarvests, Array.isArray(row.chore_logs) ? row.chore_logs : []),
        closedYears: row.closed_years || []
      };
    } else {
      hogState.expenses = mergeIgpExpenses(igpExpenseRows.rows);
      hogState.sales = normalizedSales;
      hogState.choreLogs = normalizedHarvests;
      hogState.eggHarvests = normalizedHarvests;
    }
    const members = membersRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      farmLocation: r.farm_location,
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
    const users = usersRes.rows.map((r) => ({
      id: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      isApproved: r.is_approved,
      joinedDate: r.joined_date,
      farmLocation: r.farm_location,
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number,
      status: r.status,
      avatarUrl: r.avatar_url,
      memberIdNumber: r.member_id_number,
      rsbsaNumber: r.rsbsa_number,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered),
      resetRequested: Boolean(r.reset_requested),
      mfaEnabled: Boolean(r.mfa_enabled)
    }));
    const meetings = meetingsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      location: r.location,
      attendanceCount: Number(r.attendance_count || 0),
      agenda: r.agenda,
      minutes: r.minutes,
      officerInCharge: r.officer_in_charge,
      attendanceRecord: r.attendance_record || {},
      minutesApprovalStatus: r.minutes_approval_status || void 0,
      approvedBy: r.approved_by || void 0,
      approvedDate: r.approved_date || void 0,
      approvalRemarks: r.approval_remarks || void 0
    }));
    const resolutions = resolutionsRes.rows.map((r) => ({
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
    const transactions = transactionsRes.rows.map((r) => ({
      id: r.id,
      type: r.type,
      category: r.category,
      amount: Number(r.amount || 0),
      date: r.date,
      description: r.description,
      recordedBy: r.recorded_by,
      activityId: r.activity_id,
      fundSource: r.fund_source,
      auditedStatus: r.audited_status,
      auditedBy: r.audited_by,
      auditedDate: r.audited_date,
      auditNotes: r.audit_notes,
      purpose: r.purpose || void 0,
      liquidationDeadline: r.liquidation_deadline || void 0,
      presidentApprovalStatus: r.president_approval_status || void 0,
      presidentApprovedBy: r.president_approved_by || void 0,
      presidentApprovedDate: r.president_approved_date || void 0,
      presidentApprovalRemarks: r.president_approval_remarks || void 0
    }));
    const announcements = announcementsRes.rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      content: r.content,
      datePosted: r.date_posted,
      priority: r.priority,
      postedBy: r.posted_by
    }));
    const logs = logsRes.rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      user: r.user_name,
      role: r.role,
      action: r.action,
      details: r.details,
      syncStatus: r.sync_status || "synced",
      hash: r.hash,
      previousHash: r.previous_hash
    }));
    const products = productsRes.rows.map((r) => ({
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
    const inventory = inventoryRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      quantity: Number(r.quantity || 0),
      damagedQuantity: r.damaged_quantity == null ? void 0 : Number(r.damaged_quantity),
      unit: r.unit,
      condition: r.item_condition,
      location: r.location || void 0,
      notes: r.notes || void 0,
      catalogProductId: r.catalog_product_id || void 0,
      recordedBy: r.recorded_by || "",
      dateRecorded: r.date_recorded || "",
      lastUpdated: r.last_updated || ""
    }));
    const activities = activitiesRes.rows.map((r) => ({
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
      statusReason: r.status_reason,
      documentedNotes: r.documented_notes,
      attendeesCount: Number(r.attendees_count || 0),
      targetAudience: r.target_audience,
      imageUrl: r.image_url
    }));
    const achievements = achievementsRes.rows.map((r) => ({
      id: r.id,
      year: r.year,
      title: r.title,
      cebTitle: r.ceb_title,
      description: r.description,
      icon: r.icon
    }));
    const funds = fundsRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      initialFund: Number(r.initial_fund ?? r.allocated_amount ?? 0),
      currentBalance: Number(r.current_balance || 0),
      category: r.category || "",
      source: r.source_origin || "",
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
      inventory,
      activities,
      achievements,
      funds,
      organizationFunds: funds,
      auditorReports,
      delegationRequests
    };
  } finally {
    client.release();
  }
}

// src/api/auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt2 from "bcryptjs";

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

// src/utils/passwordPolicy.ts
import bcrypt from "bcryptjs";
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;

// src/api/auth.ts
var SESSION_COOKIE = "fams_session";
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
function getCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(entry.slice(separator + 1).trim());
      } catch {
        return void 0;
      }
    }
  }
  return void 0;
}
async function getAuthenticatedUser(req) {
  const user = await readAuthenticatedUser(req);
  return user && user.isApproved ? user : null;
}
async function readAuthenticatedUser(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims || claims.kind !== "session") return null;
  if (!isDatabaseConfigured()) return null;
  const pool = getPool();
  await ensureDatabaseSchema(pool);
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [claims.sub]);
  return result.rows[0] ? safeUser(result.rows[0]) : null;
}
function safeUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    isApproved: Boolean(row.is_approved),
    joinedDate: row.joined_date || void 0,
    farmLocation: row.farm_location || void 0,
    primaryCrops: Array.isArray(row.primary_crops) ? row.primary_crops : [],
    contactNumber: row.contact_number || void 0,
    status: row.status || void 0,
    avatarUrl: row.avatar_url || void 0,
    memberIdNumber: row.member_id_number || void 0,
    rsbsaNumber: row.rsbsa_number || void 0,
    isRsbsaRegistered: Boolean(row.is_rsbsa_registered),
    mustChangePassword: Boolean(row.must_change_password),
    mfaEnabled: Boolean(row.mfa_enabled)
  };
}

// src/api/pull.ts
async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    return sendResponse(res, 405, { success: false, message: "Method not allowed." });
  }
  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      storageMode: "local",
      provider: "Local",
      message: "DATABASE_URL is not configured. Running in local storage mode; data stays on this device."
    });
  }
  let user;
  try {
    user = await getAuthenticatedUser(req);
  } catch (error) {
    console.warn("[Cloud DB Pull Auth Warning]:", error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      offlineMode: true,
      message: "Authentication service is temporarily unavailable."
    });
  }
  if (!user) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: "Sign in to synchronize database."
    });
  }
  try {
    const data = await fetchAllDataFromPostgres(getPool());
    return sendResponse(res, 200, { success: true, data });
  } catch (error) {
    console.warn("[Cloud DB Pull Warning]:", error?.message || error);
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: `Offline fallback: ${error?.message || "Database unavailable"}`
    });
  }
}
export {
  handler as default
};
