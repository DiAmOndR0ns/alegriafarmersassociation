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
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_paid_through INTEGER;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS inactive_reason TEXT;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS rsbsa_number VARCHAR(100);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS is_rsbsa_registered BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS gender VARCHAR(20);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date VARCHAR(50);`,
    `CREATE TABLE IF NOT EXISTS pending_members(
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      username VARCHAR(100),
      farm_location TEXT,
      primary_crops TEXT[],
      contact_number VARCHAR(50),
      joined_date VARCHAR(50),
      rsbsa_number VARCHAR(100),
      is_rsbsa_registered BOOLEAN DEFAULT FALSE,
      avatar_url TEXT,
      gender VARCHAR(20),
      birth_date VARCHAR(50),
      affiliations JSONB DEFAULT '[]'::jsonb,
      registration_status VARCHAR(80) DEFAULT 'Pending Secretary Approval',
      approved_by_secretary TEXT,
      approved_by_secretary_date VARCHAR(50)
    );`,
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
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);`,
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
    `CREATE TABLE IF NOT EXISTS afa_igp (id VARCHAR(100) PRIMARY KEY, produces TEXT[], closed_years INT[]);`,
    `CREATE TABLE IF NOT EXISTS afa_igp_livestocks (
      produce TEXT NOT NULL,
      stage TEXT NOT NULL,
      head_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (produce, stage)
    );`,
    `DO $$
      DECLARE
        has_stage BOOLEAN;
        has_head_count BOOLEAN;
        has_stage_breakdown BOOLEAN;
        has_opening_count BOOLEAN;
        has_initial_count BOOLEAN;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'stage'
        ) INTO has_stage;
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'head_count'
        ) INTO has_head_count;

        IF NOT has_stage OR NOT has_head_count THEN
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'stage_breakdown'
          ) INTO has_stage_breakdown;
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'opening_count'
          ) INTO has_opening_count;
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'initial_count'
          ) INTO has_initial_count;

          CREATE TABLE IF NOT EXISTS afa_igp_livestocks_migrated (
            produce TEXT NOT NULL,
            stage TEXT NOT NULL,
            head_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (produce, stage)
          );

          IF has_stage_breakdown THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, kv.key,
                CASE WHEN COALESCE(kv.value, '') ~ '^[0-9]+$' THEN kv.value::integer ELSE 0 END
              FROM afa_igp_livestocks AS l
              CROSS JOIN LATERAL jsonb_each_text(
                CASE WHEN jsonb_typeof(l.stage_breakdown) = 'object' THEN l.stage_breakdown ELSE '{}'::jsonb END
              ) AS kv(key, value)
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL AND NULLIF(trim(kv.key), '') IS NOT NULL
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          END IF;

          IF has_opening_count THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, 'General',
                CASE WHEN COALESCE(l.opening_count::text, '') ~ '^[0-9]+$' THEN l.opening_count ELSE 0 END
              FROM afa_igp_livestocks AS l
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL
                AND COALESCE(l.opening_count, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM afa_igp_livestocks_migrated m WHERE m.produce = l.produce)
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          ELSIF has_initial_count THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, 'General',
                CASE WHEN COALESCE(l.initial_count::text, '') ~ '^[0-9]+$' THEN l.initial_count ELSE 0 END
              FROM afa_igp_livestocks AS l
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL
                AND COALESCE(l.initial_count, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM afa_igp_livestocks_migrated m WHERE m.produce = l.produce)
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          END IF;

          DROP TABLE afa_igp_livestocks;
          ALTER TABLE afa_igp_livestocks_migrated RENAME TO afa_igp_livestocks;
        END IF;
      END $$;`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'herd_breakdown'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Swine Raising (Baboyan)', stage_name, stage_qty
            FROM afa_igp,
            LATERAL (VALUES
              ('Fattening', CASE WHEN COALESCE(herd_breakdown->>'fattening', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'fattening')::integer ELSE 0 END),
              ('Gestation', CASE WHEN COALESCE(herd_breakdown->>'gestation', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'gestation')::integer ELSE 0 END),
              ('Lactating', CASE WHEN COALESCE(herd_breakdown->>'lactating', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'lactating')::integer ELSE 0 END),
              ('Dispersal', CASE WHEN COALESCE(herd_breakdown->>'dispersal', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'dispersal')::integer ELSE 0 END)
            ) AS s(stage_name, stage_qty)
            WHERE stage_qty > 0
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Cattle Raising (Bakahan)', stage_name, stage_qty
            FROM afa_igp,
            LATERAL (VALUES
              ('Fattening', CASE WHEN COALESCE(herd_breakdown->>'cattleFattening', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'cattleFattening')::integer ELSE 0 END),
              ('Dispersal', CASE WHEN COALESCE(herd_breakdown->>'cattleDispersal', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'cattleDispersal')::integer ELSE 0 END)
            ) AS s(stage_name, stage_qty)
            WHERE stage_qty > 0
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Poultry Raising (RTL)', 'RTL',
              CASE WHEN COALESCE(herd_breakdown->>'rtlCount', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'rtlCount')::integer ELSE 0 END
            FROM afa_igp
            WHERE COALESCE(herd_breakdown->>'rtlCount', '0') <> '0'
            ON CONFLICT (produce, stage) DO NOTHING;
          $migration$;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestock'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT l.produce, kv.key,
              CASE WHEN COALESCE(kv.value, '') ~ '^[0-9]+$' THEN kv.value::integer ELSE 0 END
            FROM afa_igp_livestock AS l
            CROSS JOIN LATERAL jsonb_each_text(
              CASE WHEN jsonb_typeof(l.stage_breakdown) = 'object' THEN l.stage_breakdown ELSE '{}'::jsonb END
            ) AS kv(key, value)
            WHERE NULLIF(trim(kv.key), '') IS NOT NULL
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT l.produce, 'General',
              CASE WHEN COALESCE(l.opening_count::text, '') ~ '^[0-9]+$' THEN l.opening_count ELSE 0 END
            FROM afa_igp_livestock AS l
            WHERE COALESCE(l.stage_breakdown, '{}'::jsonb) = '{}'::jsonb
              AND COALESCE(l.opening_count, 0) > 0
            ON CONFLICT (produce, stage) DO NOTHING;
          $migration$;
          DROP TABLE IF EXISTS afa_igp_livestock;
        END IF;
      END $$;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS initial_count;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS opening_count;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS stage_breakdown;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS opening_hog_count;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS herd_breakdown;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS initial_count;`,
    `CREATE TABLE IF NOT EXISTS afa_igp_expenses(
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
    stage TEXT
  ); `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS expense_data JSONB; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS category TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS quantity NUMERIC; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS description TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS recorded_by TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS fund_source TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS stage TEXT; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_expenses' AND column_name = 'hog_stage'
  ) THEN
          EXECUTE 'UPDATE afa_igp_expenses SET stage = COALESCE(NULLIF(stage, ''''), hog_stage)';
        END IF;
      END $$; `,
    `CREATE TABLE IF NOT EXISTS afa_igp_harvests(
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
  ); `,
    `CREATE TABLE IF NOT EXISTS afa_igp_sales(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    stage TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    recorded_by TEXT,
    fund_source TEXT,
    notes TEXT
  ); `,
    `ALTER TABLE afa_igp_sales ADD COLUMN IF NOT EXISTS stage TEXT; `,
    `ALTER TABLE afa_igp_sales ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 0; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hog_stage'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET stage = COALESCE(NULLIF(stage, ''''), hog_stage)';
        END IF;
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'produce_count'
  ) AND EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hogs_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales
            SET quantity = CASE WHEN quantity = 0 THEN COALESCE(NULLIF(produce_count, 0), hogs_count, 0) ELSE quantity END';
        ELSIF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'produce_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET quantity = CASE WHEN quantity = 0 THEN produce_count ELSE quantity END';
        ELSIF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hogs_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET quantity = CASE WHEN quantity = 0 THEN hogs_count ELSE quantity END';
        END IF;
      END $$; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_expenses' AND column_name = 'expense_data'
  ) THEN
          EXECUTE $migration$
            UPDATE afa_igp_expenses SET
  category = COALESCE(NULLIF(category, ''), expense_data ->> 'category'),
    quantity = CASE
                WHEN quantity IS NULL OR quantity = 0 THEN
                  CASE WHEN COALESCE(expense_data ->> 'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense_data ->> 'quantity')::numeric ELSE quantity END
                ELSE quantity END,
    description = COALESCE(NULLIF(description, ''), expense_data ->> 'description'),
    amount = CASE
                WHEN amount IS NULL OR amount = 0 THEN
                  CASE WHEN COALESCE(expense_data ->> 'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense_data ->> 'amount')::numeric ELSE amount END
                ELSE amount END,
    recorded_by = COALESCE(NULLIF(recorded_by, ''), expense_data ->> 'recordedBy'),
    fund_source = COALESCE(NULLIF(fund_source, ''), expense_data ->> 'fundSource'),
    stage = COALESCE(NULLIF(stage, ''), expense_data ->> 'stage', expense_data ->> 'hogStage'),
    produce = CASE
  WHEN(COALESCE(stage, expense_data ->> 'stage', expense_data ->> 'hogStage') = 'RTL'
                  OR COALESCE(category, expense_data ->> 'category') ~* '(rtl|poultry|chicken|egg)')
                  AND COALESCE(produce, expense_data ->> 'produce', '') ~* '(swine|hog|baboy|^$)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(NULLIF(produce, ''), NULLIF(expense_data ->> 'produce', ''), 'Swine Raising (Baboyan)')
  END
            WHERE expense_data IS NOT NULL
  $migration$;
        END IF;
      END $$; `,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses(produce); `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'expenses'
  ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_expenses(
    id, produce, date, expense_data, category, quantity, description, amount, recorded_by, fund_source, stage
  )
            SELECT expense ->> 'id',
    CASE
                WHEN COALESCE(expense ->> 'stage', expense ->> 'hogStage') = 'RTL'
                  OR expense ->> 'category' ~* '(rtl|poultry|chicken|egg)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(
      NULLIF(expense ->> 'produce', ''),
      CASE WHEN expense ->> 'category' ~* '(calf|cattle|baka)'
                    THEN 'Cattle Raising (Bakahan)' END,
      'Swine Raising (Baboyan)'
    )
  END,
    expense ->> 'date',
    expense,
    expense ->> 'category',
    CASE WHEN COALESCE(expense ->> 'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense ->> 'quantity')::numeric END,
    expense ->> 'description',
    CASE WHEN COALESCE(expense ->> 'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense ->> 'amount')::numeric END,
    expense ->> 'recordedBy',
    expense ->> 'fundSource',
    COALESCE(expense ->> 'stage', expense ->> 'hogStage')
            FROM afa_igp AS igp
            CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(igp.expenses) = 'array' THEN igp.expenses ELSE '[]':: jsonb END
    ) AS item(expense)
            WHERE NULLIF(expense ->> 'id', '') IS NOT NULL
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
    stage = COALESCE(NULLIF(afa_igp_expenses.stage, ''), EXCLUDED.stage)
  $migration$;
        END IF;
      END $$; `,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'sales'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_sales (
              id, produce, date, stage, quantity, revenue, recorded_by, fund_source, notes
            )
            SELECT sale->>'id',
              COALESCE(NULLIF(sale->>'produce', ''), 'Unspecified'),
              sale->>'date',
              COALESCE(sale->>'stage', sale->>'hogStage'),
              CASE WHEN COALESCE(sale->>'quantity', sale->>'produceCount', sale->>'hogsCount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN COALESCE(sale->>'quantity', sale->>'produceCount', sale->>'hogsCount')::numeric ELSE 0 END,
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
          $migration$;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'chore_logs'
        ) THEN
          EXECUTE $migration$
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
          $migration$;
        END IF;
      END $$;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS expenses, DROP COLUMN IF EXISTS sales, DROP COLUMN IF EXISTS chore_logs;`,
    `DROP TABLE IF EXISTS afa_igp_group_members; `,
    `DROP TABLE IF EXISTS afa_igp_groups; `,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS groups; `,
    `ALTER TABLE afa_igp_expenses DROP COLUMN IF EXISTS hog_stage; `,
    `ALTER TABLE afa_igp_sales DROP COLUMN IF EXISTS hog_stage, DROP COLUMN IF EXISTS hogs_count, DROP COLUMN IF EXISTS produce_count; `,
    `DROP TABLE IF EXISTS hog_raising; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS ceb_name TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_available VARCHAR(100); `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_name TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_sitio TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_phone VARCHAR(50); `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS ceb_title TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS date_scheduled VARCHAR(50); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(100); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS time_scheduled VARCHAR(100); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS target_audience TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_url TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS attendees_count INTEGER DEFAULT 0; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS documented_notes TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS status_reason TEXT; `,
    `UPDATE financial_transactions AS tx
      SET activity_id = NULL
      WHERE tx.activity_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM activities AS activity WHERE activity.id = tx.activity_id); `,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) NOT NULL DEFAULT 'usable';`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lost_quantity INTEGER DEFAULT 0;`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS used_quantity INTEGER DEFAULT 0;`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS purchase_transaction_id VARCHAR(100);`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100);`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);`,
    `UPDATE financial_transactions AS tx
      SET meeting_id = NULL
      WHERE tx.meeting_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM meetings AS m WHERE m.id = tx.meeting_id);`,
    `UPDATE inventory AS item
      SET activity_id = NULL
      WHERE item.activity_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM activities AS a WHERE a.id = item.activity_id);`,
    `UPDATE inventory AS item
      SET meeting_id = NULL
      WHERE item.meeting_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM meetings AS m WHERE m.id = item.meeting_id);`,
    `UPDATE inventory
      SET asset_type = 'rental'
      WHERE (asset_type IS NULL OR asset_type = 'usable')
        AND (category = 'Rental Assets' OR catalog_product_id IS NOT NULL);`,
    `UPDATE inventory AS item
      SET purchase_transaction_id = NULL
      WHERE item.purchase_transaction_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM financial_transactions AS tx WHERE tx.id = item.purchase_transaction_id);`,
    `UPDATE inventory AS item
      SET catalog_product_id = NULL
      WHERE item.catalog_product_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM products AS product WHERE product.id = item.catalog_product_id); `,
    `DO $$
  BEGIN
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_activity_id_fkey'
            AND conrelid = 'financial_transactions':: regclass
  ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_activity_id_fkey
            FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_catalog_product_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_catalog_product_id_fkey
            FOREIGN KEY(catalog_product_id) REFERENCES products(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_purchase_transaction_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_purchase_transaction_id_fkey
            FOREIGN KEY(purchase_transaction_id) REFERENCES financial_transactions(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_meeting_id_fkey'
            AND conrelid = 'financial_transactions':: regclass
  ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_meeting_id_fkey
            FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_activity_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_activity_id_fkey
            FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_meeting_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_meeting_id_fkey
            FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
      END $$; `,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_activity_id_fkey; `,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_meeting_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_catalog_product_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_purchase_transaction_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_activity_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_meeting_id_fkey; `,
    `CREATE INDEX IF NOT EXISTS financial_transactions_activity_id_idx ON financial_transactions(activity_id); `,
    `CREATE INDEX IF NOT EXISTS financial_transactions_meeting_id_idx ON financial_transactions(meeting_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_catalog_product_id_idx ON inventory(catalog_product_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_purchase_transaction_id_idx ON inventory(purchase_transaction_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_activity_id_idx ON inventory(activity_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_meeting_id_idx ON inventory(meeting_id); `,
    `CREATE TABLE IF NOT EXISTS achievements(
    id VARCHAR(100) PRIMARY KEY,
    year VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    ceb_title TEXT,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
  ); `,
    `CREATE TABLE IF NOT EXISTS organization_funds(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    current_balance NUMERIC DEFAULT 0,
    description TEXT,
    custodian TEXT,
    last_updated VARCHAR(50)
  ); `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS category TEXT; `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS source_origin TEXT; `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS initial_fund NUMERIC DEFAULT 0; `,
    // Legacy databases still carry allocated_amount; newer ones only have initial_fund.
    // Guard the backfill so a missing legacy column cannot fail the whole migration.
    `DO $$
  BEGIN
       IF EXISTS(SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
         UPDATE organization_funds SET initial_fund = allocated_amount
  WHERE(initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
       END IF;
     END $$; `,
    `ALTER TABLE organization_funds DROP CONSTRAINT IF EXISTS organization_funds_code_key; `,
    // Drop legacy unused auditor_reports table (superseded by live AuditorReport + per-transaction auditing)
    `DROP TABLE IF EXISTS auditor_reports;`,
    // Executive Delegation Requests (Proposal Requirement: President to VP delegation)
    `CREATE TABLE IF NOT EXISTS delegation_requests(
    id VARCHAR(100) PRIMARY KEY,
    requested_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]':: jsonb,
    requested_date VARCHAR(50) NOT NULL,
    effective_start VARCHAR(50),
    effective_end VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pending',
    reviewed_by TEXT,
    reviewed_date VARCHAR(50),
    remarks TEXT
  ); `,
    `ALTER TABLE delegation_requests ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]':: jsonb; `,
    // Annual membership dues. One row per member per membership year; the roster
    // and the printed year-end list are derived from these receipts, not from a
    // hand-toggled Active/Inactive flag.
    `CREATE TABLE IF NOT EXISTS membership_payments(
    id VARCHAR(100) PRIMARY KEY,
    member_id VARCHAR(100) NOT NULL,
    member_name TEXT NOT NULL,
    member_id_number VARCHAR(100),
    year INTEGER NOT NULL,
    amount NUMERIC DEFAULT 0,
    date_paid VARCHAR(50),
    method VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending',
    recorded_by TEXT,
    recorded_at VARCHAR(50),
    verified_by TEXT,
    verified_date VARCHAR(50),
    voided_by TEXT,
    voided_date VARCHAR(50),
    void_reason TEXT,
    notes TEXT,
    transaction_id VARCHAR(100)
  ); `,
    `CREATE INDEX IF NOT EXISTS membership_payments_year_idx ON membership_payments(year); `,
    `CREATE INDEX IF NOT EXISTS membership_payments_member_idx ON membership_payments(member_id); `,
    // One live receipt per member per year; voided rows are kept for the audit trail.
    `CREATE UNIQUE INDEX IF NOT EXISTS membership_payments_one_live_per_year_idx
       ON membership_payments(member_id, year) WHERE status <> 'Voided'; `,
    // Immutable roster snapshot written when an officer closes a membership year.
    `CREATE TABLE IF NOT EXISTS membership_year_snapshots(
    year INTEGER PRIMARY KEY,
    closed_by TEXT,
    closed_at VARCHAR(50),
    dues_amount NUMERIC DEFAULT 0,
    total_members INTEGER DEFAULT 0,
    paid_members INTEGER DEFAULT 0,
    unpaid_members INTEGER DEFAULT 0,
    total_collected NUMERIC DEFAULT 0,
    listed_members JSONB DEFAULT '[]':: jsonb,
    unpaid_member_ids JSONB DEFAULT '[]':: jsonb,
    remarks TEXT
  ); `,
    `DO $$
      DECLARE queue_has_rows BOOLEAN;
  BEGIN
        IF to_regclass('public.sync_queue') IS NOT NULL THEN
          EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.sync_queue LIMIT 1)' INTO queue_has_rows;
          IF NOT queue_has_rows THEN
            EXECUTE 'DROP TABLE public.sync_queue';
  ELSE
            RAISE NOTICE 'Preserving non-empty legacy sync_queue table';
          END IF;
        END IF;
      END $$; `
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
    const details = failures.map(({ statement, error }) => `- ${error}: ${statement} `).join("\n");
    throw new Error(`Schema migration failed for ${failures.length} statement(s): 
${details} `);
  }
}
async function initDatabaseSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users(
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
    password_history JSONB DEFAULT '[]':: jsonb,
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    total_failed_logins INTEGER DEFAULT 0,
    reset_requested BOOLEAN DEFAULT FALSE
    , totp_secret TEXT
    , pending_totp_secret TEXT
    , mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
    , totp_last_used_step BIGINT
  );
  `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users(lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN('member', 'board_member'); `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS members(
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
      CREATE TABLE IF NOT EXISTS pending_members(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    username VARCHAR(100),
    farm_location TEXT,
    primary_crops TEXT[],
    contact_number VARCHAR(50),
    joined_date VARCHAR(50),
    rsbsa_number VARCHAR(100),
    is_rsbsa_registered BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    gender VARCHAR(20),
    birth_date VARCHAR(50),
    affiliations JSONB DEFAULT '[]'::jsonb,
    registration_status VARCHAR(80) DEFAULT 'Pending Secretary Approval',
    approved_by_secretary TEXT,
    approved_by_secretary_date VARCHAR(50)
  );
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings(
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
      CREATE TABLE IF NOT EXISTS resolutions(
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
      CREATE TABLE IF NOT EXISTS financial_transactions(
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
      CREATE TABLE IF NOT EXISTS announcements(
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
      CREATE TABLE IF NOT EXISTS system_logs(
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
        produces TEXT[],
        closed_years INT[]
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_livestocks (
        produce TEXT NOT NULL,
        stage TEXT NOT NULL,
        head_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (produce, stage)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_expenses(
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
    stage TEXT
  );
  `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);");
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_harvests(
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
      CREATE TABLE IF NOT EXISTS afa_igp_sales(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    stage TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    recorded_by TEXT,
    fund_source TEXT,
    notes TEXT
  );
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS products(
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
      CREATE TABLE IF NOT EXISTS inventory(
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
        ADD COLUMN IF NOT EXISTS lost_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS used_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) NOT NULL DEFAULT 'usable',
        ADD COLUMN IF NOT EXISTS catalog_product_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS purchase_transaction_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities(
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
      CREATE TABLE IF NOT EXISTS achievements(
    id VARCHAR(100) PRIMARY KEY,
    year VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    ceb_title TEXT,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
  );
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_funds(
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
        IF EXISTS(SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
          UPDATE organization_funds SET initial_fund = allocated_amount
  WHERE(initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
        END IF;
      END $$;
  `);
    await client.query(`
      ALTER TABLE organization_funds
        DROP CONSTRAINT IF EXISTS organization_funds_code_key;
  `);
    await client.query(`DROP TABLE IF EXISTS auditor_reports;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS delegation_requests(
    id VARCHAR(100) PRIMARY KEY,
    requested_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]':: jsonb,
    requested_date VARCHAR(50) NOT NULL,
    effective_start VARCHAR(50),
    effective_end VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pending',
    reviewed_by TEXT,
    reviewed_date VARCHAR(50),
    remarks TEXT
  );
  `);
    await client.query(`ALTER TABLE delegation_requests ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]':: jsonb`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS membership_payments(
    id VARCHAR(100) PRIMARY KEY,
    member_id VARCHAR(100) NOT NULL,
    member_name TEXT NOT NULL,
    member_id_number VARCHAR(100),
    year INTEGER NOT NULL,
    amount NUMERIC DEFAULT 0,
    date_paid VARCHAR(50),
    method VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending',
    recorded_by TEXT,
    recorded_at VARCHAR(50),
    verified_by TEXT,
    verified_date VARCHAR(50),
    voided_by TEXT,
    voided_date VARCHAR(50),
    void_reason TEXT,
    notes TEXT,
    transaction_id VARCHAR(100)
  );
      CREATE INDEX IF NOT EXISTS membership_payments_year_idx ON membership_payments(year);
      CREATE INDEX IF NOT EXISTS membership_payments_member_idx ON membership_payments(member_id);
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS membership_year_snapshots(
    year INTEGER PRIMARY KEY,
    closed_by TEXT,
    closed_at VARCHAR(50),
    dues_amount NUMERIC DEFAULT 0,
    total_members INTEGER DEFAULT 0,
    paid_members INTEGER DEFAULT 0,
    unpaid_members INTEGER DEFAULT 0,
    total_collected NUMERIC DEFAULT 0,
    listed_members JSONB DEFAULT '[]':: jsonb,
    unpaid_member_ids JSONB DEFAULT '[]':: jsonb,
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
var ENTITY_TABLE_MAP = {
  user: "users",
  users: "users",
  officer: "users",
  officers: "users",
  member: "members",
  members: "members",
  pendingmember: "pending_members",
  pendingmembers: "pending_members",
  pending_member: "pending_members",
  pending_members: "pending_members",
  meeting: "meetings",
  meetings: "meetings",
  resolution: "resolutions",
  resolutions: "resolutions",
  transaction: "financial_transactions",
  transactions: "financial_transactions",
  financialtransaction: "financial_transactions",
  financialtransactions: "financial_transactions",
  financial_transaction: "financial_transactions",
  financial_transactions: "financial_transactions",
  announcement: "announcements",
  announcements: "announcements",
  product: "products",
  products: "products",
  activity: "activities",
  activities: "activities",
  inventory: "inventory",
  inventories: "inventory",
  achievement: "achievements",
  achievements: "achievements",
  fund: "organization_funds",
  funds: "organization_funds",
  organizationfund: "organization_funds",
  organizationfunds: "organization_funds",
  organization_fund: "organization_funds",
  organization_funds: "organization_funds",
  delegationrequest: "delegation_requests",
  delegationrequests: "delegation_requests",
  delegation_request: "delegation_requests",
  delegation_requests: "delegation_requests",
  membershippayment: "membership_payments",
  membershippayments: "membership_payments",
  membership_payment: "membership_payments",
  membership_payments: "membership_payments",
  afa_igp: "afa_igp",
  afaigp: "afa_igp",
  igp: "afa_igp",
  systemlog: "system_logs",
  systemlogs: "system_logs",
  log: "system_logs",
  logs: "system_logs"
};
function lookupEntityTable(entity) {
  const lower = (entity || "").toLowerCase();
  const normalized = lower.replace(/[-_]/g, "");
  return ENTITY_TABLE_MAP[entity] || ENTITY_TABLE_MAP[lower] || ENTITY_TABLE_MAP[normalized];
}
async function deleteEntityFromPostgres(pool, entity, ids) {
  const tableName = lookupEntityTable(entity);
  if (!tableName) {
    throw new Error(`Unknown entity type for database deletion: ${entity} `);
  }
  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
  if (idList.length === 0) {
    return { success: true, deletedCount: 0, entity, table: tableName };
  }
  const client = await pool.connect();
  try {
    const res = await client.query(`DELETE FROM ${tableName} WHERE id = ANY($1)`, [idList]);
    console.log(`[DB DELETE] Removed ${res.rowCount || 0} record(s) from "${tableName}"(IDs: ${idList.join(", ")})`);
    return { success: true, deletedCount: res.rowCount || 0, entity, table: tableName };
  } finally {
    client.release();
  }
}
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
function isPresidentRole(role) {
  return role.trim().toLowerCase().replace(/\s+/g, "_") === "president";
}
function errorResponse(res, status, message) {
  return sendResponse(res, status, { success: false, message });
}
var AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1e3;
async function requireAuthenticated(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) errorResponse(res, 401, "Authentication required.");
    return user;
  } catch {
    errorResponse(res, 503, "Authentication service is temporarily unavailable.");
    return null;
  }
}

// src/api/delete.ts
async function assertSafeUserDeletion(pool, actorId, ids) {
  if (ids.includes(actorId)) throw new Error("The active account cannot be deleted.");
  const result = await pool.query("SELECT id, role FROM users WHERE id = ANY($1)", [ids]);
  if (result.rows.some((row) => isPresidentRole(row.role))) {
    throw new Error("President accounts cannot be deleted through this endpoint.");
  }
}
async function handler(req, res) {
  if (req.method && !["POST", "DELETE"].includes(req.method)) return sendResponse(res, 405, { success: false, message: "Method not allowed." });
  if (rejectCrossOriginMutation(req)) return sendResponse(res, 403, { success: false, message: "Cross-origin requests are not allowed." });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  if (!isPresidentRole(user.role)) return sendResponse(res, 403, { success: false, message: "President access is required for deletion." });
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: "Database is not configured." });
  const pool = getPool();
  try {
    const body = await parseRequestBody(req);
    if (body?.deletedIds && typeof body.deletedIds === "object") {
      let totalDeleted = 0;
      for (const [entity2, value] of Object.entries(body.deletedIds)) {
        const ids2 = Array.isArray(value) ? value.filter((id) => typeof id === "string" && id) : [];
        if (!ids2.length) continue;
        if (lookupEntityTable(entity2) === "users") await assertSafeUserDeletion(pool, user.id, ids2);
        totalDeleted += (await deleteEntityFromPostgres(pool, entity2, ids2)).deletedCount;
      }
      return sendResponse(res, 200, { success: true, deletedCount: totalDeleted });
    }
    const url = new URL(req.url || "", "http://localhost");
    const entity = body?.entity || req.params?.entity || url.searchParams.get("entity");
    const rawIds = body?.ids || (body?.id ? [body.id] : req.params?.id ? [req.params.id] : url.searchParams.get("id") ? [url.searchParams.get("id")] : []);
    const ids = (Array.isArray(rawIds) ? rawIds : [rawIds]).filter((id) => typeof id === "string" && id);
    if (typeof entity !== "string" || !ids.length) {
      return sendResponse(res, 400, { success: false, message: "Missing 'entity' or 'id'/'ids' parameter." });
    }
    if (lookupEntityTable(entity) === "users") await assertSafeUserDeletion(pool, user.id, ids);
    const result = await deleteEntityFromPostgres(pool, entity, ids);
    return sendResponse(res, 200, { success: true, deletedCount: result.deletedCount, table: result.table });
  } catch (error) {
    console.error("[Cloud DB Delete Error]:", error?.message || error);
    const status = ["The active account cannot be deleted.", "President accounts cannot be deleted through this endpoint."].includes(error?.message) ? 403 : 500;
    return sendResponse(res, status, { success: false, message: status === 403 ? error.message : "Unable to delete records." });
  }
}
export {
  handler as default
};
