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
    `CREATE TABLE IF NOT EXISTS afa_igp (id VARCHAR(100) PRIMARY KEY, opening_hog_count INTEGER NOT NULL DEFAULT 0, herd_breakdown JSONB DEFAULT '{"fattening":0,"gestation":0,"lactating":0}'::jsonb, produces TEXT[], expenses JSONB, sales JSONB, groups JSONB, chore_logs JSONB, closed_years INT[]);`,
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
    `CREATE TABLE IF NOT EXISTS afa_igp_groups (
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      schedule_days TEXT[],
      sort_order INTEGER NOT NULL DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS afa_igp_group_members (
      group_id VARCHAR(100) NOT NULL REFERENCES afa_igp_groups(id),
      member_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, member_name)
    );`,
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

        INSERT INTO afa_igp_groups (id, name, schedule_days, sort_order)
        SELECT group_row->>'id',
          COALESCE(NULLIF(group_row->>'name', ''), 'Unnamed group'),
          ARRAY(
            SELECT jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(group_row->'scheduleDays') = 'array'
                THEN group_row->'scheduleDays' ELSE '[]'::jsonb END
            )
          ),
          (item.ordinality - 1)::integer
        FROM afa_igp AS igp
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(igp.groups) = 'array' THEN igp.groups ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS item(group_row, ordinality)
        WHERE NULLIF(group_row->>'id', '') IS NOT NULL
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO afa_igp_group_members (group_id, member_name, position)
        SELECT group_row->>'id', member.member_name, (member.ordinality - 1)::integer
        FROM afa_igp AS igp
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(igp.groups) = 'array' THEN igp.groups ELSE '[]'::jsonb END
        ) AS group_item(group_row)
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(group_row->'members') = 'array'
            THEN group_row->'members' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS member(member_name, ordinality)
        WHERE NULLIF(group_row->>'id', '') IS NOT NULL
          AND NULLIF(member.member_name, '') IS NOT NULL
        ON CONFLICT (group_id, member_name) DO NOTHING;

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
      CREATE TABLE IF NOT EXISTS afa_igp_groups (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        schedule_days TEXT[],
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_group_members (
        group_id VARCHAR(100) NOT NULL REFERENCES afa_igp_groups(id),
        member_name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (group_id, member_name)
      );
    `);
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

// src/api/achievements.ts
async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    return sendResponse(res, 405, { success: false, message: "Method not allowed." });
  }
  const resource = req.query?.resource || new URL(req.url || "/", "http://localhost").searchParams.get("resource");
  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      storageMode: "local",
      provider: "Local",
      message: "Database is not configured. Using locally saved achievements."
    });
  }
  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
    if (resource === "products") {
      const result2 = await pool.query(
        `SELECT id, name, ceb_name, category, description, unit, price, quantity_available,
          stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url,
          is_published
         FROM products
         WHERE is_published = TRUE
         ORDER BY name ASC`
      );
      const products = result2.rows.map((row) => ({
        id: row.id,
        name: row.name,
        cebName: row.ceb_name,
        category: row.category,
        description: row.description,
        unit: row.unit,
        price: Number(row.price || 0),
        quantityAvailable: row.quantity_available,
        stockStatus: row.stock_status,
        farmerName: row.farmer_name,
        farmerSitio: row.farmer_sitio,
        farmerPhone: row.farmer_phone,
        contactPerson: row.contact_person,
        imageUrl: row.image_url,
        isPublished: row.is_published
      }));
      return sendResponse(res, 200, { success: true, products });
    }
    const result = await pool.query(
      "SELECT id, year, title, ceb_title, description, icon FROM achievements ORDER BY year DESC, title ASC"
    );
    const achievements = result.rows.map((row) => ({
      id: row.id,
      year: row.year,
      title: row.title,
      cebTitle: row.ceb_title,
      description: row.description,
      icon: row.icon
    }));
    return sendResponse(res, 200, { success: true, achievements });
  } catch (error) {
    const resourceLabel = resource === "products" ? "products" : "achievements";
    console.error(`[Public ${resourceLabel}] Unable to load public data:`, error?.message || error);
    return sendResponse(res, 503, {
      success: false,
      message: resource === "products" ? "The public product catalog is temporarily unavailable." : "Association achievements are temporarily unavailable."
    });
  }
}
export {
  handler as default
};
