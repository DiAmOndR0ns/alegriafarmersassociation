// src/api/db.ts
import pg from "pg";

// src/utils/fundBalance.ts
function getInitialFund(fund) {
  const initial = Number(fund.initialFund);
  if (Number.isFinite(initial)) return initial;
  const legacy = Number(fund.allocatedAmount);
  return Number.isFinite(legacy) ? legacy : 0;
}

// src/api/sanitize.ts
var MAX_TEXT_LENGTH = 2e4;
var MARKUP_CHARS = /[<>]/g;
var HANDLER_NAME = /(?:onerror|onload|onclick|onmouseover|onfocus|onstart|onbegin|javascript|vbscript)/gi;
function cleanText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const limit = Math.min(Math.max(1, maxLength), MAX_TEXT_LENGTH);
  return value.slice(0, MAX_TEXT_LENGTH).replace(MARKUP_CHARS, "").replace(/(?:java|vb)script\s*:/gi, "").replace(HANDLER_NAME, "").slice(0, limit);
}
function cleanTextList(value, maxItemLength = 80, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  const cleaned = [];
  for (const entry of value) {
    const text = cleanText(entry, maxItemLength)?.trim();
    if (text && !cleaned.includes(text)) cleaned.push(text);
  }
  return cleaned.slice(0, maxItems);
}
function safeImageUrl(value, maxLength = 4e5) {
  if (typeof value !== "string") return null;
  const url = value.trim().slice(0, maxLength);
  if (!url) return null;
  if (/^https?:\/\/[^\s<>"]+$/i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  return null;
}
function cleanDateString(value, maxLength = 50) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().slice(0, maxLength);
  if (!text) return null;
  if (/^\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return text;
  return null;
}
function cleanNumber(value, max = 1e9) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}
var FORGED_USER_FIELDS = [
  "password",
  "passwordHash",
  "password_history",
  "passwordHistory",
  "mfaEnabled",
  "mfa_enabled",
  "totpSecret",
  "pendingTotpSecret",
  "isApproved",
  "failedLoginAttempts",
  "lockedUntil",
  "resetRequested"
];
function sanitizeUserRows(rows, options = {}) {
  const safeRows = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const clean = { ...row };
    for (const key of FORGED_USER_FIELDS) delete clean[key];
    if (options.roleAuthorized) {
      clean.roleAuthorized = true;
    } else {
      if (clean.role !== void 0 && clean.role !== "Member") {
        clean.role = "Member";
      }
      delete clean.roleAuthorized;
    }
    safeRows.push(clean);
  }
  return safeRows;
}

// src/api/db.ts
var AUDITED_STATUSES = ["Unaudited", "Audited", "Flagged"];
var ASSIGNABLE_ROLE_VALUES = [
  "Vice_President",
  "Secretary",
  "Assistant_Secretary",
  "Board_Member",
  "Treasurer",
  "Assistant_Treasurer",
  "Auditor",
  "PIO",
  "Member"
];
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
    ssl: { rejectUnauthorized: true },
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
    `CREATE TABLE IF NOT EXISTS afa_igp_expenses (
      id VARCHAR(100) PRIMARY KEY,
      produce TEXT NOT NULL,
      date VARCHAR(50),
      expense_data JSONB NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);`,
    `INSERT INTO afa_igp_expenses (id, produce, date, expense_data)
      SELECT expense->>'id',
        COALESCE(NULLIF(expense->>'produce', ''), 'Swine Raising (Baboyan)'),
        expense->>'date',
        expense
      FROM afa_igp AS igp
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(igp.expenses) = 'array' THEN igp.expenses ELSE '[]'::jsonb END
      ) AS item(expense)
      WHERE NULLIF(expense->>'id', '') IS NOT NULL
      ON CONFLICT (id) DO NOTHING;`,
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
        expense_data JSONB NOT NULL
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);");
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
var ENTITY_TABLE_MAP = {
  user: "users",
  users: "users",
  officer: "users",
  officers: "users",
  member: "members",
  members: "members",
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
  auditorreport: "auditor_reports",
  auditorreports: "auditor_reports",
  auditor_report: "auditor_reports",
  auditor_reports: "auditor_reports",
  delegationrequest: "delegation_requests",
  delegationrequests: "delegation_requests",
  delegation_request: "delegation_requests",
  delegation_requests: "delegation_requests",
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
async function saveEntity(client, rows, mapping) {
  const activeRows = rows.filter((row) => row?.id && !mapping.deletedIds.has(row.id));
  if (activeRows.length === 0) return;
  const columns = ["id", ...mapping.fields.map(([column]) => column)];
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns.slice(1).map(
    (column) => mapping.table === "users" && column === "password" ? `password = CASE WHEN EXCLUDED.password IS NOT NULL AND EXCLUDED.password != '' THEN EXCLUDED.password ELSE users.password END` : `${column} = EXCLUDED.${column}`
  );
  const query = `INSERT INTO ${mapping.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}`;
  for (const row of activeRows) {
    const values = [row.id, ...mapping.fields.map(([, , transform]) => transform(row, row))];
    await client.query(query, values);
  }
}
async function saveIgpExpenseSegments(client, expenses, defaultProduce) {
  const ids = [];
  for (const expense of expenses) {
    if (typeof expense?.id !== "string" || !expense.id.trim()) {
      throw new Error("Cannot sync IGP expense without a valid id");
    }
    const produce = typeof expense.produce === "string" && expense.produce.trim() ? expense.produce : defaultProduce || "Swine Raising (Baboyan)";
    const segmentedExpense = { ...expense, produce };
    ids.push(expense.id);
    await client.query(`
      INSERT INTO afa_igp_expenses (id, produce, date, expense_data)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        produce = EXCLUDED.produce,
        date = EXCLUDED.date,
        expense_data = EXCLUDED.expense_data;
    `, [expense.id, produce, expense.date || null, JSON.stringify(segmentedExpense)]);
  }
  await client.query(
    "DELETE FROM afa_igp_expenses WHERE NOT (id = ANY($1::varchar[]))",
    [ids]
  );
}
async function saveFullStateToPostgres(pool, state) {
  console.log("[DB DEBUG] saveFullStateToPostgres called");
  console.log("[DB DEBUG] State keys:", Object.keys(state || {}));
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();
  try {
    console.log("[DB DEBUG] Starting transaction...");
    await client.query("BEGIN");
    const deletedUserIds = /* @__PURE__ */ new Set();
    const deletedMemberIds = /* @__PURE__ */ new Set();
    const deletedMeetingIds = /* @__PURE__ */ new Set();
    const deletedResolutionIds = /* @__PURE__ */ new Set();
    const deletedTxIds = /* @__PURE__ */ new Set();
    const deletedAnnouncementIds = /* @__PURE__ */ new Set();
    const deletedProductIds = /* @__PURE__ */ new Set();
    const deletedInventoryIds = /* @__PURE__ */ new Set();
    const deletedActivityIds = /* @__PURE__ */ new Set();
    const deletedAchievementIds = /* @__PURE__ */ new Set();
    const deletedFundIds = /* @__PURE__ */ new Set();
    const deletedAuditorIds = /* @__PURE__ */ new Set();
    const deletedDelegationIds = /* @__PURE__ */ new Set();
    if (state.deletedIds && typeof state.deletedIds === "object") {
      const d = state.deletedIds;
      if (Array.isArray(d.users) && d.users.length > 0) {
        d.users.forEach((id) => deletedUserIds.add(id));
        await client.query("DELETE FROM users WHERE id = ANY($1)", [d.users]);
        console.log("[DB DELETE] Batch deleted users:", d.users);
      }
      if (Array.isArray(d.members) && d.members.length > 0) {
        d.members.forEach((id) => deletedMemberIds.add(id));
        await client.query("DELETE FROM members WHERE id = ANY($1)", [d.members]);
        console.log("[DB DELETE] Batch deleted members:", d.members);
      }
      if (Array.isArray(d.meetings) && d.meetings.length > 0) {
        d.meetings.forEach((id) => deletedMeetingIds.add(id));
        await client.query("DELETE FROM meetings WHERE id = ANY($1)", [d.meetings]);
        console.log("[DB DELETE] Batch deleted meetings:", d.meetings);
      }
      if (Array.isArray(d.resolutions) && d.resolutions.length > 0) {
        d.resolutions.forEach((id) => deletedResolutionIds.add(id));
        await client.query("DELETE FROM resolutions WHERE id = ANY($1)", [d.resolutions]);
        console.log("[DB DELETE] Batch deleted resolutions:", d.resolutions);
      }
      const txs = d.financialTransactions || d.transactions;
      if (Array.isArray(txs) && txs.length > 0) {
        txs.forEach((id) => deletedTxIds.add(id));
        await client.query("DELETE FROM financial_transactions WHERE id = ANY($1)", [txs]);
        console.log("[DB DELETE] Batch deleted transactions:", txs);
      }
      if (Array.isArray(d.announcements) && d.announcements.length > 0) {
        d.announcements.forEach((id) => deletedAnnouncementIds.add(id));
        await client.query("DELETE FROM announcements WHERE id = ANY($1)", [d.announcements]);
        console.log("[DB DELETE] Batch deleted announcements:", d.announcements);
      }
      if (Array.isArray(d.products) && d.products.length > 0) {
        d.products.forEach((id) => deletedProductIds.add(id));
        await client.query("DELETE FROM products WHERE id = ANY($1)", [d.products]);
        console.log("[DB DELETE] Batch deleted products:", d.products);
      }
      if (Array.isArray(d.inventory) && d.inventory.length > 0) {
        d.inventory.forEach((id) => deletedInventoryIds.add(id));
        await client.query("DELETE FROM inventory WHERE id = ANY($1)", [d.inventory]);
        console.log("[DB DELETE] Batch deleted inventory records:", d.inventory);
      }
      if (Array.isArray(d.activities) && d.activities.length > 0) {
        d.activities.forEach((id) => deletedActivityIds.add(id));
        await client.query("DELETE FROM activities WHERE id = ANY($1)", [d.activities]);
        console.log("[DB DELETE] Batch deleted activities:", d.activities);
      }
      if (Array.isArray(d.achievements) && d.achievements.length > 0) {
        d.achievements.forEach((id) => deletedAchievementIds.add(id));
        await client.query("DELETE FROM achievements WHERE id = ANY($1)", [d.achievements]);
      }
      const funds = d.funds || d.organizationFunds;
      if (Array.isArray(funds) && funds.length > 0) {
        funds.forEach((id) => deletedFundIds.add(id));
        await client.query("DELETE FROM organization_funds WHERE id = ANY($1)", [funds]);
        console.log("[DB DELETE] Batch deleted funds:", funds);
      }
      const auds = d.auditorReports || d.auditor_reports;
      if (Array.isArray(auds) && auds.length > 0) {
        auds.forEach((id) => deletedAuditorIds.add(id));
        await client.query("DELETE FROM auditor_reports WHERE id = ANY($1)", [auds]);
      }
      const dels = d.delegationRequests || d.delegation_requests;
      if (Array.isArray(dels) && dels.length > 0) {
        dels.forEach((id) => deletedDelegationIds.add(id));
        await client.query("DELETE FROM delegation_requests WHERE id = ANY($1)", [dels]);
      }
    }
    if (state.deleteItem && state.deleteItem.entity && state.deleteItem.id) {
      const tbl = lookupEntityTable(state.deleteItem.entity);
      if (tbl) {
        await client.query(`DELETE FROM ${tbl} WHERE id = $1`, [state.deleteItem.id]);
        if (tbl === "users") deletedUserIds.add(state.deleteItem.id);
        if (tbl === "members") deletedMemberIds.add(state.deleteItem.id);
        if (tbl === "meetings") deletedMeetingIds.add(state.deleteItem.id);
        if (tbl === "resolutions") deletedResolutionIds.add(state.deleteItem.id);
        if (tbl === "financial_transactions") deletedTxIds.add(state.deleteItem.id);
        if (tbl === "announcements") deletedAnnouncementIds.add(state.deleteItem.id);
        if (tbl === "products") deletedProductIds.add(state.deleteItem.id);
        if (tbl === "inventory") deletedInventoryIds.add(state.deleteItem.id);
        if (tbl === "activities") deletedActivityIds.add(state.deleteItem.id);
        if (tbl === "achievements") deletedAchievementIds.add(state.deleteItem.id);
        if (tbl === "organization_funds") deletedFundIds.add(state.deleteItem.id);
        if (tbl === "auditor_reports") deletedAuditorIds.add(state.deleteItem.id);
        if (tbl === "delegation_requests") deletedDelegationIds.add(state.deleteItem.id);
        console.log(`[DB DELETE] Single deleted ${tbl} ID: ${state.deleteItem.id}`);
      }
    }
    if (state.users && Array.isArray(state.users)) {
      const activeUsers = state.users.filter((u) => !deletedUserIds.has(u.id));
      console.log("[DB DEBUG] Saving", activeUsers.length, "users...");
      for (const u of activeUsers) {
        if (!u || typeof u.username !== "string" || !u.username.trim()) continue;
        const cleanUsername = String(u.username).trim().toLowerCase().slice(0, 100);
        const existingRow = await client.query("SELECT id, role FROM users WHERE lower(username) = lower($1) LIMIT 1", [cleanUsername]);
        const existingRole = existingRow.rows[0]?.role;
        const targetId = existingRow.rows[0]?.id || void 0;
        const isNewAccount = !targetId;
        const incomingRole = ASSIGNABLE_ROLE_VALUES.includes(String(u.role)) ? String(u.role) : "Member";
        const isCurrentPresident = existingRole && existingRole.toLowerCase() === "president";
        const targetRole = isCurrentPresident && incomingRole.toLowerCase() !== "president" ? existingRole : incomingRole;
        const isApproved = false;
        const cleanName = cleanText(u.name, 200) || cleanUsername;
        const rowId = typeof u.id === "string" && u.id ? u.id : void 0;
        let resolvedId = targetId || rowId;
        if (!resolvedId) {
          console.warn("[Cloud DB Push] Skipping user row without a resolvable account id:", cleanUsername);
          continue;
        }
        await client.query(`
          INSERT INTO users (id, username, password, name, role, is_approved, joined_date, farm_location, primary_crops, contact_number, status, avatar_url, member_id_number, rsbsa_number, is_rsbsa_registered, mfa_enabled)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            name = EXCLUDED.name,
            role = CASE WHEN $17::boolean THEN EXCLUDED.role ELSE users.role END,
            joined_date = EXCLUDED.joined_date,
            farm_location = EXCLUDED.farm_location,
            primary_crops = EXCLUDED.primary_crops,
            contact_number = EXCLUDED.contact_number,
            status = EXCLUDED.status,
            avatar_url = EXCLUDED.avatar_url,
            member_id_number = EXCLUDED.member_id_number,
            rsbsa_number = EXCLUDED.rsbsa_number,
            is_rsbsa_registered = EXCLUDED.is_rsbsa_registered,
            mfa_enabled = COALESCE(users.mfa_enabled, EXCLUDED.mfa_enabled);
        `, [
          resolvedId,
          cleanUsername,
          "",
          cleanName,
          targetRole,
          isApproved,
          cleanDateString(u.joinedDate, 50),
          cleanText(u.farmLocation, 200),
          cleanTextList(u.primaryCrops),
          cleanText(u.contactNumber, 50),
          u.status === "Inactive" ? "Inactive" : "Active",
          safeImageUrl(u.avatarUrl),
          cleanText(u.memberIdNumber, 100),
          cleanText(u.rsbsaNumber, 100),
          Boolean(u.isRsbsaRegistered),
          // MFA is enabled by enrollment only (auth endpoints), never by a sync row.
          false,
          !isNewAccount && u.roleAuthorized === true
        ]);
      }
      console.log("[DB DEBUG] Users saved");
    }
    if (state.members && Array.isArray(state.members)) {
      const activeMembers = state.members.filter((m) => !deletedMemberIds.has(m.id));
      console.log("[DB DEBUG] Saving", activeMembers.length, "members...");
      for (const m of activeMembers) {
        if (!m || typeof m.id !== "string" || !m.id) continue;
        const memberName = cleanText(m.name, 200);
        if (!memberName) continue;
        await client.query(`
          INSERT INTO members (id, name, farm_location, primary_crops, contact_number, status, joined_date, member_id_number, rsbsa_number, is_rsbsa_registered, avatar_url, gender, birth_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            farm_location = EXCLUDED.farm_location,
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
          m.id,
          memberName,
          cleanText(m.farmLocation, 200),
          cleanTextList(m.primaryCrops),
          cleanText(m.contactNumber, 50),
          m.status === "Inactive" ? "Inactive" : "Active",
          cleanDateString(m.joinedDate, 50),
          cleanText(m.memberIdNumber, 100),
          cleanText(m.rsbsaNumber, 100),
          Boolean(m.isRsbsaRegistered),
          safeImageUrl(m.avatarUrl),
          cleanText(m.gender, 20),
          cleanDateString(m.birthDate, 50)
        ]);
      }
      console.log("[DB DEBUG] Members saved");
    }
    const rawTxList = state.financialTransactions || state.transactions;
    if (rawTxList && Array.isArray(rawTxList) && state.auditorReviewOnly === true) {
      for (const tx of rawTxList) {
        if (!tx?.id || deletedTxIds.has(tx.id)) continue;
        await client.query(`
          UPDATE financial_transactions SET
            audited_status = COALESCE($2, audited_status),
            audited_by = COALESCE($3, audited_by),
            audited_date = COALESCE($4, audited_date),
            audit_notes = COALESCE($5, audit_notes)
          WHERE id = $1;
        `, [
          tx.id,
          tx.auditedStatus || null,
          tx.auditedBy || null,
          tx.auditedDate || null,
          tx.auditNotes || null
        ]);
      }
      console.log("[DB DEBUG] Auditor financial reviews saved");
    } else if (rawTxList && Array.isArray(rawTxList) && state.presidentApprovalOnly === true) {
      for (const tx of rawTxList) {
        if (!tx?.id || deletedTxIds.has(tx.id)) continue;
        await client.query(`
          UPDATE financial_transactions SET
            president_approval_status = COALESCE($2, president_approval_status),
            president_approved_by = COALESCE($3, president_approved_by),
            president_approved_date = COALESCE($4, president_approved_date),
            president_approval_remarks = COALESCE($5, president_approval_remarks)
          WHERE id = $1 AND audited_status = 'Audited';
        `, [
          tx.id,
          tx.presidentApprovalStatus || null,
          tx.presidentApprovedBy || null,
          tx.presidentApprovedDate || null,
          tx.presidentApprovalRemarks || null
        ]);
      }
      console.log("[DB DEBUG] President financial approvals saved");
    } else if (rawTxList && Array.isArray(rawTxList)) {
      const txList = rawTxList.filter((tx) => !deletedTxIds.has(tx.id));
      const pendingActivityIds = new Set(
        (Array.isArray(state.activities) ? state.activities : []).filter(
          (activity) => activity?.id && !deletedActivityIds.has(activity.id) && cleanText(activity.title, 300)
        ).map((activity) => activity.id)
      );
      let existingActivityIds = null;
      console.log("[DB DEBUG] Saving", txList.length, "transactions...");
      for (const tx of txList) {
        if (!tx || typeof tx.id !== "string" || !tx.id) continue;
        const txType = String(tx.type || "").toLowerCase();
        if (txType !== "income" && txType !== "expense") continue;
        const txAmount = Number(tx.amount);
        if (!Number.isFinite(txAmount) || txAmount < 0) continue;
        let activityId = cleanText(tx.activityId, 100);
        if (activityId && !pendingActivityIds.has(activityId)) {
          if (!existingActivityIds) {
            const existingActivities = await client.query("SELECT id FROM activities");
            existingActivityIds = new Set(existingActivities.rows.map((row) => String(row.id)));
          }
          if (!existingActivityIds.has(activityId)) activityId = null;
        }
        await client.query(`
          INSERT INTO financial_transactions (id, type, category, amount, date, description, recorded_by, activity_id, fund_source, purpose, liquidation_deadline, audited_status, audited_by, audited_date, audit_notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            date = EXCLUDED.date,
            description = EXCLUDED.description,
            recorded_by = EXCLUDED.recorded_by,
            activity_id = EXCLUDED.activity_id,
            fund_source = EXCLUDED.fund_source,
            purpose = COALESCE(EXCLUDED.purpose, financial_transactions.purpose),
            liquidation_deadline = COALESCE(EXCLUDED.liquidation_deadline, financial_transactions.liquidation_deadline),
            audited_status = EXCLUDED.audited_status,
            audited_by = EXCLUDED.audited_by,
            audited_date = EXCLUDED.audited_date,
            audit_notes = EXCLUDED.audit_notes;
        `, [
          tx.id,
          txType === "income" ? "income" : "expense",
          cleanText(tx.category, 100) || "Uncategorized",
          cleanNumber(txAmount),
          cleanDateString(tx.date, 50),
          cleanText(tx.description, 2e3),
          cleanText(tx.recordedBy, 200),
          activityId,
          cleanText(tx.fundSource, 200),
          cleanText(tx.purpose, 2e3),
          cleanDateString(tx.liquidationDeadline, 50),
          AUDITED_STATUSES.includes(String(tx.auditedStatus)) ? String(tx.auditedStatus) : "Unaudited",
          cleanText(tx.auditedBy, 200),
          cleanDateString(tx.auditedDate, 50),
          cleanText(tx.auditNotes, 2e3)
        ]);
      }
      console.log("[DB DEBUG] Transactions saved");
    }
    if (state.meetings && Array.isArray(state.meetings)) {
      const activeMeetings = state.meetings.filter((mt) => !deletedMeetingIds.has(mt.id));
      console.log("[DB DEBUG] Saving", activeMeetings.length, "meetings...");
      for (const mt of activeMeetings) {
        if (!mt || typeof mt.id !== "string" || !mt.id) continue;
        const meetingTitle = cleanText(mt.title, 300);
        if (!meetingTitle) continue;
        await client.query(`
          INSERT INTO meetings (id, title, date, location, attendance_count, agenda, minutes, officer_in_charge, attendance_record, minutes_approval_status, approved_by, approved_date, approval_remarks)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            date = EXCLUDED.date,
            location = EXCLUDED.location,
            attendance_count = EXCLUDED.attendance_count,
            agenda = EXCLUDED.agenda,
            minutes = EXCLUDED.minutes,
            officer_in_charge = EXCLUDED.officer_in_charge,
            attendance_record = EXCLUDED.attendance_record,
            minutes_approval_status = COALESCE(EXCLUDED.minutes_approval_status, meetings.minutes_approval_status),
            approved_by = COALESCE(EXCLUDED.approved_by, meetings.approved_by),
            approved_date = COALESCE(EXCLUDED.approved_date, meetings.approved_date),
            approval_remarks = COALESCE(EXCLUDED.approval_remarks, meetings.approval_remarks);
        `, [
          mt.id,
          meetingTitle,
          cleanDateString(mt.date, 50),
          cleanText(mt.location, 200),
          Math.min(Math.max(0, Math.floor(Number(mt.attendanceCount) || 0)), 1e5),
          cleanText(mt.agenda, 2e4) || "",
          cleanText(mt.minutes, 2e4) || "",
          cleanText(mt.officerInCharge, 200) || "",
          JSON.stringify(mt.attendanceRecord && typeof mt.attendanceRecord === "object" ? mt.attendanceRecord : {}),
          cleanText(mt.minutesApprovalStatus, 50),
          cleanText(mt.approvedBy, 200),
          cleanDateString(mt.approvedDate, 50),
          cleanText(mt.approvalRemarks, 2e3)
        ]);
      }
      console.log("[DB DEBUG] Meetings saved");
    }
    if (state.hogRaising) {
      console.log("[DB DEBUG] Saving AFA IGP state...");
      const safeBreakdown = {
        fattening: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.fattening) || 0)),
        gestation: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.gestation) || 0)),
        lactating: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.lactating) || 0)),
        dispersal: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.dispersal) || 0)),
        cattleFattening: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.cattleFattening) || 0)),
        cattleDispersal: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.cattleDispersal) || 0)),
        rtlCount: Math.max(0, Math.floor(Number(state.hogRaising.herdBreakdown?.rtlCount) || 0))
      };
      await client.query(`
        INSERT INTO afa_igp (id, opening_hog_count, herd_breakdown, produces, expenses, sales, groups, chore_logs, closed_years)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          opening_hog_count = EXCLUDED.opening_hog_count,
          herd_breakdown = EXCLUDED.herd_breakdown,
          produces = EXCLUDED.produces,
          expenses = EXCLUDED.expenses,
          sales = EXCLUDED.sales,
          groups = EXCLUDED.groups,
          chore_logs = EXCLUDED.chore_logs,
          closed_years = EXCLUDED.closed_years;
      `, [
        "main_state",
        Math.max(0, Math.floor(Number(state.hogRaising.openingHogCount) || 0)),
        JSON.stringify(safeBreakdown),
        state.hogRaising.produces || [],
        JSON.stringify(state.hogRaising.expenses || []),
        JSON.stringify(state.hogRaising.sales || []),
        JSON.stringify(state.hogRaising.groups || []),
        JSON.stringify(state.hogRaising.eggHarvests || state.hogRaising.choreLogs || []),
        state.hogRaising.closedYears || []
      ]);
      await client.query("DELETE FROM afa_igp WHERE id != 'main_state'");
      await saveIgpExpenseSegments(
        client,
        state.hogRaising.expenses || [],
        state.hogRaising.produces?.[0]
      );
      console.log("[DB DEBUG] AFA IGP state saved");
    }
    if (Array.isArray(state.eggHarvests) && !state.hogRaising) {
      let eggHarvests = state.eggHarvests;
      if (state.appendEggHarvests) {
        const existing = await client.query(
          "SELECT chore_logs FROM afa_igp WHERE id = 'main_state' FOR UPDATE"
        );
        const existingEggHarvests = Array.isArray(existing.rows[0]?.chore_logs) ? existing.rows[0].chore_logs : [];
        const existingIds = new Set(existingEggHarvests.map((harvest) => harvest?.id));
        eggHarvests = [
          ...eggHarvests.filter((harvest) => !existingIds.has(harvest?.id)),
          ...existingEggHarvests
        ];
      }
      await client.query(`
        INSERT INTO afa_igp (id, chore_logs)
        VALUES ('main_state', $1)
        ON CONFLICT (id) DO UPDATE SET chore_logs = EXCLUDED.chore_logs
      `, [JSON.stringify(eggHarvests)]);
    }
    const logList = state.systemLogs || state.logs;
    if (logList && Array.isArray(logList)) {
      console.log("[DB DEBUG] Saving", logList.length, "system logs...");
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
          lg.id,
          cleanDateString(lg.timestamp, 100),
          cleanText(lg.user || lg.userName, 200) || "Officer",
          cleanText(lg.role, 50),
          cleanText(lg.action, 300),
          cleanText(lg.details, 4e3),
          lg.syncStatus === "pending" ? "pending" : "synced",
          /^[a-f0-9]{64}$/i.test(String(lg.hash || "")) ? String(lg.hash) : null,
          /^[a-f0-9]{1,64}$/i.test(String(lg.previousHash || "")) ? String(lg.previousHash) : null
        ]);
      }
      console.log("[DB DEBUG] System logs saved");
    }
    if (state.products && Array.isArray(state.products)) {
      const activeProducts = state.products.filter((p) => !deletedProductIds.has(p.id));
      console.log("[DB DEBUG] Saving", activeProducts.length, "products...");
      for (const p of activeProducts) {
        if (!p || typeof p.id !== "string" || !p.id || !cleanText(p.name, 300)) continue;
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
          p.id,
          cleanText(p.name, 300) || "Unnamed product",
          cleanText(p.cebName, 300),
          cleanText(p.category, 100),
          cleanText(p.description, 5e3),
          cleanText(p.unit, 50),
          cleanNumber(p.price),
          cleanText(p.quantityAvailable, 100),
          cleanText(p.stockStatus, 50),
          cleanText(p.farmerName, 200),
          cleanText(p.farmerSitio, 200),
          cleanText(p.farmerPhone, 50),
          cleanText(p.contactPerson, 200),
          safeImageUrl(p.imageUrl),
          p.isPublished !== false,
          cleanText(p.updatedBy, 200),
          cleanText(p.managedBy, 200),
          cleanDateString(p.dateUpdated, 50)
        ]);
      }
      console.log("[DB DEBUG] Products saved");
    }
    if (state.resolutions && Array.isArray(state.resolutions)) {
      const activeResolutions = state.resolutions.filter((r) => !deletedResolutionIds.has(r.id));
      console.log("[DB DEBUG] Saving", activeResolutions.length, "resolutions...");
      for (const r of activeResolutions) {
        if (!r || typeof r.id !== "string" || !r.id) continue;
        if (!cleanText(r.resolutionNumber, 100) || !cleanText(r.title, 300)) continue;
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
          r.id,
          cleanText(r.resolutionNumber, 100),
          cleanText(r.title, 300),
          cleanText(r.description, 2e4),
          cleanDateString(r.dateAgreed, 50),
          cleanText(r.movedBy, 200),
          cleanText(r.secondedBy, 200),
          Math.floor(cleanNumber(r.voteInFavor, 1e5)),
          Math.floor(cleanNumber(r.voteAgainst, 1e5)),
          Math.floor(cleanNumber(r.voteAbstain, 1e5)),
          cleanText(r.status, 50)
        ]);
      }
      console.log("[DB DEBUG] Resolutions saved");
    }
    if (state.announcements && Array.isArray(state.announcements)) {
      const activeAnnouncements = state.announcements.filter((a) => !deletedAnnouncementIds.has(a.id));
      console.log("[DB DEBUG] Saving", activeAnnouncements.length, "announcements...");
      for (const a of activeAnnouncements) {
        if (!a || typeof a.id !== "string" || !a.id) continue;
        const announcementTitle = cleanText(a.title, 300);
        if (!announcementTitle) continue;
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
        `, [
          a.id,
          announcementTitle,
          cleanText(a.category, 100),
          cleanText(a.content, 2e4),
          cleanDateString(a.datePosted, 50),
          cleanText(a.priority, 50),
          cleanText(a.postedBy, 200)
        ]);
      }
      console.log("[DB DEBUG] Announcements saved");
    }
    if (state.activities && Array.isArray(state.activities)) {
      const activeActivities = state.activities.filter((act) => !deletedActivityIds.has(act.id));
      console.log("[DB DEBUG] Saving", activeActivities.length, "activities...");
      for (const act of activeActivities) {
        if (!act || typeof act.id !== "string" || !act.id) continue;
        const activityTitle = cleanText(act.title, 300);
        if (!activityTitle) continue;
        await client.query(`
          INSERT INTO activities (id, title, ceb_title, category, scheduled_date, date_scheduled, scheduled_time, time_scheduled, location, description, organizer, status, status_reason, documented_notes, attendees_count, target_audience, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
            status_reason = EXCLUDED.status_reason,
            documented_notes = EXCLUDED.documented_notes,
            attendees_count = EXCLUDED.attendees_count,
            target_audience = EXCLUDED.target_audience,
            image_url = EXCLUDED.image_url;
        `, [
          act.id,
          activityTitle,
          cleanText(act.cebTitle, 300),
          cleanText(act.category, 100),
          cleanDateString(act.scheduledDate || act.dateScheduled, 50),
          cleanDateString(act.dateScheduled || act.scheduledDate, 50),
          cleanText(act.scheduledTime || act.timeScheduled, 100),
          cleanText(act.timeScheduled || act.scheduledTime, 100),
          cleanText(act.location, 200),
          cleanText(act.description, 2e4),
          cleanText(act.organizer, 200),
          cleanText(act.status, 50),
          cleanText(act.statusReason, 1e3),
          cleanText(act.documentedNotes, 2e4),
          Math.min(Math.max(0, Math.floor(Number(act.attendeesCount) || 0)), 1e5),
          cleanText(act.targetAudience, 300),
          safeImageUrl(act.imageUrl)
        ]);
      }
      console.log("[DB DEBUG] Activities saved");
    }
    const rawFundList = state.organizationFunds || state.funds;
    if (rawFundList && Array.isArray(rawFundList)) {
      const fundList = rawFundList.filter((f) => !deletedFundIds.has(f.id));
      console.log("[DB DEBUG] Saving", fundList.length, "organization funds...");
      for (const f of fundList) {
        if (!f || typeof f.id !== "string" || !f.id) continue;
        const fundName = cleanText(f.name, 200);
        if (!fundName) continue;
        const fundCode = (cleanText(f.code, 50) || fundName).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 50) || "FUND";
        await client.query(`
          INSERT INTO organization_funds (id, name, code, initial_fund, current_balance, description, custodian, last_updated, category, source_origin)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            initial_fund = EXCLUDED.initial_fund,
            current_balance = EXCLUDED.current_balance,
            description = EXCLUDED.description,
            custodian = EXCLUDED.custodian,
            last_updated = EXCLUDED.last_updated,
            category = EXCLUDED.category,
            source_origin = EXCLUDED.source_origin;
        `, [
          f.id,
          fundName,
          fundCode,
          cleanNumber(getInitialFund(f)),
          cleanNumber(f.currentBalance),
          cleanText(f.description, 2e3) || "",
          cleanText(f.custodian, 200) || "",
          cleanDateString(f.lastUpdated, 50) || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          cleanText(f.category, 100),
          cleanText(f.source, 200)
        ]);
      }
      console.log("[DB DEBUG] Organization funds saved");
    }
    if (state.auditorReports && Array.isArray(state.auditorReports)) {
      console.log("[DB DEBUG] Saving", state.auditorReports.length, "auditor reports...");
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
          ar.id,
          cleanText(ar.reportPeriod, 100) || "Unscheduled",
          cleanText(ar.reportType, 50) || "General",
          cleanNumber(ar.totalIncome),
          cleanNumber(ar.totalExpenses),
          cleanNumber(ar.netSurplus),
          cleanText(ar.findings, 2e4) || "",
          cleanText(ar.recommendations, 2e4) || "",
          cleanText(ar.preparedBy, 200) || "Auditor",
          cleanText(ar.certifiedBy, 200),
          cleanText(ar.status, 50) || "Submitted",
          cleanDateString(ar.dateSubmitted, 50),
          cleanDateString(ar.dateCertified, 50)
        ]);
      }
      console.log("[DB DEBUG] Auditor reports saved");
    }
    if (state.delegationRequests && Array.isArray(state.delegationRequests)) {
      console.log("[DB DEBUG] Saving", state.delegationRequests.length, "delegation requests...");
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
          dr.id,
          cleanText(dr.requestedBy, 200) || "Officer",
          cleanText(dr.reason, 2e3) || "Delegation",
          cleanDateString(dr.requestedDate, 50),
          cleanDateString(dr.effectiveStart, 50),
          cleanDateString(dr.effectiveEnd, 50),
          cleanText(dr.status, 50) || "Pending",
          cleanText(dr.reviewedBy, 200),
          cleanDateString(dr.reviewedDate, 50),
          cleanText(dr.remarks, 2e3)
        ]);
      }
      console.log("[DB DEBUG] Delegation requests saved");
    }
    const saveMappings = [
      { table: "members", deletedIds: deletedMemberIds, fields: [
        ["name", "name", (r) => r.name],
        ["farm_location", "farmLocation", (r) => r.farmLocation || null],
        ["primary_crops", "primaryCrops", (r) => r.primaryCrops || []],
        ["contact_number", "contactNumber", (r) => r.contactNumber || null],
        ["status", "status", (r) => r.status || "Active"],
        ["joined_date", "joinedDate", (r) => r.joinedDate || null],
        ["member_id_number", "memberIdNumber", (r) => r.memberIdNumber || null],
        ["rsbsa_number", "rsbsaNumber", (r) => r.rsbsaNumber || null],
        ["is_rsbsa_registered", "isRsbsaRegistered", (r) => Boolean(r.isRsbsaRegistered)],
        ["avatar_url", "avatarUrl", (r) => r.avatarUrl || null],
        ["gender", "gender", (r) => r.gender || null],
        ["birth_date", "birthDate", (r) => r.birthDate || null]
      ] },
      { table: "financial_transactions", deletedIds: deletedTxIds, fields: [
        ["type", "type", (r) => r.type],
        ["category", "category", (r) => r.category],
        ["amount", "amount", (r) => r.amount],
        ["date", "date", (r) => r.date],
        ["description", "description", (r) => r.description],
        ["recorded_by", "recordedBy", (r) => r.recordedBy],
        ["fund_source", "fundSource", (r) => r.fundSource || null],
        ["audited_status", "auditedStatus", (r) => r.auditedStatus || "Unaudited"],
        ["audited_by", "auditedBy", (r) => r.auditedBy || null],
        ["audited_date", "auditedDate", (r) => r.auditedDate || null],
        ["audit_notes", "auditNotes", (r) => r.auditNotes || null]
      ] },
      { table: "meetings", deletedIds: deletedMeetingIds, fields: [
        ["title", "title", (r) => r.title],
        ["date", "date", (r) => r.date],
        ["location", "location", (r) => r.location],
        ["attendance_count", "attendanceCount", (r) => r.attendanceCount || 0],
        ["agenda", "agenda", (r) => r.agenda || ""],
        ["minutes", "minutes", (r) => r.minutes || ""],
        ["officer_in_charge", "officerInCharge", (r) => r.officerInCharge || ""],
        ["attendance_record", "attendanceRecord", (r) => JSON.stringify(r.attendanceRecord || {})]
      ] },
      { table: "system_logs", deletedIds: /* @__PURE__ */ new Set(), fields: [
        ["timestamp", "timestamp", (r) => r.timestamp],
        ["user_name", "user", (r) => r.user || r.userName || "Officer"],
        ["role", "role", (r) => r.role],
        ["action", "action", (r) => r.action],
        ["details", "details", (r) => r.details],
        ["sync_status", "syncStatus", (r) => r.syncStatus || "synced"],
        ["hash", "hash", (r) => r.hash || null],
        ["previous_hash", "previousHash", (r) => r.previousHash || null]
      ] },
      { table: "products", deletedIds: deletedProductIds, fields: [
        ["name", "name", (r) => r.name],
        ["ceb_name", "cebName", (r) => r.cebName || null],
        ["category", "category", (r) => r.category],
        ["description", "description", (r) => r.description],
        ["unit", "unit", (r) => r.unit],
        ["price", "price", (r) => r.price],
        ["quantity_available", "quantityAvailable", (r) => r.quantityAvailable || null],
        ["stock_status", "stockStatus", (r) => r.stockStatus],
        ["farmer_name", "farmerName", (r) => r.farmerName || null],
        ["farmer_sitio", "farmerSitio", (r) => r.farmerSitio || null],
        ["farmer_phone", "farmerPhone", (r) => r.farmerPhone || null],
        ["contact_person", "contactPerson", (r) => r.contactPerson || null],
        ["image_url", "imageUrl", (r) => r.imageUrl || null],
        ["is_published", "isPublished", (r) => r.isPublished ?? true],
        ["updated_by", "updatedBy", (r) => r.updatedBy || null],
        ["managed_by", "managedBy", (r) => r.managedBy || null],
        ["date_updated", "dateUpdated", (r) => r.dateUpdated || null]
      ] },
      { table: "inventory", deletedIds: deletedInventoryIds, fields: [
        ["name", "name", (r) => cleanText(r.name, 300) || "Unnamed inventory item"],
        ["category", "category", (r) => cleanText(r.category, 100) || "Other"],
        ["quantity", "quantity", (r) => Math.floor(cleanNumber(r.quantity))],
        ["damaged_quantity", "damagedQuantity", (r) => Math.min(
          Math.floor(cleanNumber(r.quantity)),
          Math.floor(cleanNumber(r.damagedQuantity))
        )],
        ["unit", "unit", (r) => cleanText(r.unit, 50) || "units"],
        ["item_condition", "condition", (r) => cleanText(r.condition, 50) || "Good"],
        ["location", "location", (r) => cleanText(r.location, 500)],
        ["notes", "notes", (r) => cleanText(r.notes, 5e3)],
        ["catalog_product_id", "catalogProductId", (r) => cleanText(r.catalogProductId, 100)],
        ["recorded_by", "recordedBy", (r) => cleanText(r.recordedBy, 200) || "Auditor"],
        ["date_recorded", "dateRecorded", (r) => cleanDateString(r.dateRecorded, 50)],
        ["last_updated", "lastUpdated", (r) => cleanDateString(r.lastUpdated, 50)]
      ] },
      { table: "resolutions", deletedIds: deletedResolutionIds, fields: [
        ["resolution_number", "resolutionNumber", (r) => r.resolutionNumber],
        ["title", "title", (r) => r.title],
        ["description", "description", (r) => r.description],
        ["date_agreed", "dateAgreed", (r) => r.dateAgreed],
        ["moved_by", "movedBy", (r) => r.movedBy],
        ["seconded_by", "secondedBy", (r) => r.secondedBy],
        ["vote_in_favor", "voteInFavor", (r) => r.voteInFavor],
        ["vote_against", "voteAgainst", (r) => r.voteAgainst],
        ["vote_abstain", "voteAbstain", (r) => r.voteAbstain],
        ["status", "status", (r) => r.status]
      ] },
      { table: "announcements", deletedIds: deletedAnnouncementIds, fields: [
        ["title", "title", (r) => r.title],
        ["category", "category", (r) => r.category],
        ["content", "content", (r) => r.content],
        ["date_posted", "datePosted", (r) => r.datePosted],
        ["priority", "priority", (r) => r.priority],
        ["posted_by", "postedBy", (r) => r.postedBy]
      ] },
      { table: "activities", deletedIds: deletedActivityIds, fields: [
        ["title", "title", (r) => r.title],
        ["ceb_title", "cebTitle", (r) => r.cebTitle || null],
        ["category", "category", (r) => r.category],
        ["scheduled_date", "scheduledDate", (r) => r.scheduledDate || r.dateScheduled || null],
        ["date_scheduled", "dateScheduled", (r) => r.dateScheduled || r.scheduledDate || null],
        ["scheduled_time", "scheduledTime", (r) => r.scheduledTime || r.timeScheduled || null],
        ["time_scheduled", "timeScheduled", (r) => r.timeScheduled || r.scheduledTime || null],
        ["location", "location", (r) => r.location],
        ["description", "description", (r) => r.description],
        ["organizer", "organizer", (r) => r.organizer],
        ["status", "status", (r) => r.status],
        ["status_reason", "statusReason", (r) => r.statusReason || null],
        ["documented_notes", "documentedNotes", (r) => r.documentedNotes || null],
        ["attendees_count", "attendeesCount", (r) => r.attendeesCount || 0],
        ["target_audience", "targetAudience", (r) => r.targetAudience || null],
        ["image_url", "imageUrl", (r) => r.imageUrl || null]
      ] },
      { table: "achievements", deletedIds: deletedAchievementIds, fields: [
        ["year", "year", (r) => r.year],
        ["title", "title", (r) => r.title],
        ["ceb_title", "cebTitle", (r) => r.cebTitle || null],
        ["description", "description", (r) => r.description],
        ["icon", "icon", (r) => r.icon || "Trophy"]
      ] },
      { table: "organization_funds", deletedIds: deletedFundIds, fields: [
        ["name", "name", (r) => r.name],
        ["code", "code", (r) => r.code],
        ["initial_fund", "initialFund", (r) => getInitialFund(r)],
        ["current_balance", "currentBalance", (r) => r.currentBalance || 0],
        ["description", "description", (r) => r.description || ""],
        ["custodian", "custodian", (r) => r.custodian || ""],
        ["last_updated", "lastUpdated", (r) => r.lastUpdated || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]],
        ["category", "category", (r) => r.category || null],
        ["source_origin", "source", (r) => r.source || null]
      ] },
      { table: "auditor_reports", deletedIds: deletedAuditorIds, fields: [
        ["report_period", "reportPeriod", (r) => r.reportPeriod],
        ["report_type", "reportType", (r) => r.reportType],
        ["total_income", "totalIncome", (r) => r.totalIncome || 0],
        ["total_expenses", "totalExpenses", (r) => r.totalExpenses || 0],
        ["net_surplus", "netSurplus", (r) => r.netSurplus || 0],
        ["findings", "findings", (r) => r.findings || ""],
        ["recommendations", "recommendations", (r) => r.recommendations || ""],
        ["prepared_by", "preparedBy", (r) => r.preparedBy],
        ["certified_by", "certifiedBy", (r) => r.certifiedBy || null],
        ["status", "status", (r) => r.status || "Submitted"],
        ["date_submitted", "dateSubmitted", (r) => r.dateSubmitted],
        ["date_certified", "dateCertified", (r) => r.dateCertified || null]
      ] },
      { table: "delegation_requests", deletedIds: deletedDelegationIds, fields: [
        ["requested_by", "requestedBy", (r) => r.requestedBy],
        ["reason", "reason", (r) => r.reason],
        ["requested_date", "requestedDate", (r) => r.requestedDate],
        ["effective_start", "effectiveStart", (r) => r.effectiveStart || null],
        ["effective_end", "effectiveEnd", (r) => r.effectiveEnd || null],
        ["status", "status", (r) => r.status || "Pending"],
        ["reviewed_by", "reviewedBy", (r) => r.reviewedBy || null],
        ["reviewed_date", "reviewedDate", (r) => r.reviewedDate || null],
        ["remarks", "remarks", (r) => r.remarks || null]
      ] }
    ];
    for (const mapping of saveMappings) {
      const stateKeyByTable = {
        financial_transactions: ["financialTransactions", "transactions"],
        system_logs: ["systemLogs", "logs"],
        organization_funds: ["organizationFunds", "funds"],
        auditor_reports: ["auditorReports"],
        delegation_requests: ["delegationRequests"]
      };
      const stateKeys = stateKeyByTable[mapping.table] || [mapping.table];
      const rows = stateKeys.map((key) => state[key]).find(Array.isArray);
      if (Array.isArray(rows)) await saveEntity(client, rows, mapping);
    }
    if (state.hogRaising) {
      const hog = state.hogRaising;
      const safeBreakdown = {
        fattening: Math.max(0, Math.floor(Number(hog.herdBreakdown?.fattening) || 0)),
        gestation: Math.max(0, Math.floor(Number(hog.herdBreakdown?.gestation) || 0)),
        lactating: Math.max(0, Math.floor(Number(hog.herdBreakdown?.lactating) || 0)),
        dispersal: Math.max(0, Math.floor(Number(hog.herdBreakdown?.dispersal) || 0)),
        cattleFattening: Math.max(0, Math.floor(Number(hog.herdBreakdown?.cattleFattening) || 0)),
        cattleDispersal: Math.max(0, Math.floor(Number(hog.herdBreakdown?.cattleDispersal) || 0)),
        rtlCount: Math.max(0, Math.floor(Number(hog.herdBreakdown?.rtlCount) || 0))
      };
      await client.query(`
        INSERT INTO afa_igp (id, opening_hog_count, herd_breakdown, produces, expenses, sales, groups, chore_logs, closed_years)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET opening_hog_count = EXCLUDED.opening_hog_count,
          herd_breakdown = EXCLUDED.herd_breakdown,
          produces = EXCLUDED.produces, expenses = EXCLUDED.expenses, sales = EXCLUDED.sales,
          groups = EXCLUDED.groups, chore_logs = EXCLUDED.chore_logs, closed_years = EXCLUDED.closed_years
      `, [
        "main_state",
        Math.max(0, Math.floor(Number(hog.openingHogCount) || 0)),
        JSON.stringify(safeBreakdown),
        hog.produces || [],
        JSON.stringify(hog.expenses || []),
        JSON.stringify(hog.sales || []),
        JSON.stringify(hog.groups || []),
        JSON.stringify(hog.choreLogs || []),
        hog.closedYears || []
      ]);
      await client.query("DELETE FROM afa_igp WHERE id != 'main_state'");
    }
    console.log("[DB DEBUG] Committing transaction...");
    await client.query("COMMIT");
    console.log("[DB DEBUG] Transaction committed successfully");
    return { success: true };
  } catch (err) {
    console.error("[DB DEBUG] Transaction failed:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      where: err?.where
    });
    await client.query("ROLLBACK");
    throw err;
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
function isSecretaryRole(role) {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized === "secretary" || normalized === "assistant_secretary";
}
function isTreasurerRole(role) {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized === "treasurer" || normalized === "assistant_treasurer";
}
function errorResponse(res, status, message) {
  return sendResponse(res, status, { success: false, message });
}
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

// src/api/push.ts
var MAX_EGG_COUNT = 1e5;
var ASSIGNABLE_ROLES = [
  "Vice_President",
  "Secretary",
  "Assistant_Secretary",
  "Board_Member",
  "Treasurer",
  "Assistant_Treasurer",
  "Auditor",
  "PIO",
  "Member"
];
function isValidSyncState(state) {
  return typeof state === "object" && state !== null && !Array.isArray(state);
}
var PRESIDENT_APPROVAL_FIELDS = [
  "presidentApprovalStatus",
  "presidentApprovedBy",
  "presidentApprovedDate",
  "presidentApprovalRemarks"
];
var AUDITOR_REVIEW_FIELDS = [
  "auditedStatus",
  "auditedBy",
  "auditedDate",
  "auditNotes"
];
function extractAuditorReview(state, role) {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized !== "auditor") return null;
  const incoming = state.financialTransactions ?? state.transactions;
  if (!Array.isArray(incoming)) return null;
  const reviews = [];
  for (const record of incoming) {
    if (!record || typeof record !== "object") continue;
    const row = record;
    if (typeof row.id !== "string" || !row.id) continue;
    const status = row.auditedStatus;
    if (status !== "Audited" && status !== "Flagged") continue;
    const review = { id: row.id };
    for (const field of AUDITOR_REVIEW_FIELDS) {
      if (row[field] !== void 0) review[field] = row[field];
    }
    reviews.push(review);
  }
  return reviews.length > 0 ? reviews : null;
}
function extractPresidentFinancialApproval(state, role) {
  if (!isPresidentRole(role)) return null;
  const incoming = state.financialTransactions ?? state.transactions;
  if (!Array.isArray(incoming)) return null;
  const approvals = [];
  for (const record of incoming) {
    if (!record || typeof record !== "object") continue;
    const row = record;
    if (typeof row.id !== "string" || !row.id) continue;
    const status = row.presidentApprovalStatus;
    if (status !== "Approved" && status !== "Returned") continue;
    const approval = { id: row.id };
    for (const field of PRESIDENT_APPROVAL_FIELDS) {
      if (row[field] !== void 0) approval[field] = row[field];
    }
    approvals.push(approval);
  }
  return approvals.length > 0 ? approvals : null;
}
function separateEggHarvestsFromFinancialState(state, role, name) {
  const safeState = { ...state };
  const hogRaising = safeState.hogRaising;
  const eggHarvests = Array.isArray(safeState.eggHarvests) ? safeState.eggHarvests : Array.isArray(hogRaising?.eggHarvests) ? hogRaising.eggHarvests : [];
  const normalizedRole = role.trim().toLowerCase().replace(/\s+/g, "_");
  const isMember = normalizedRole === "member";
  const mayUpdateEggWorkflow = normalizedRole === "auditor" || normalizedRole === "president";
  for (const key of ["transactions", "financialTransactions", "funds", "organizationFunds", "hogRaising"]) {
    delete safeState[key];
  }
  if (safeState.deletedIds && typeof safeState.deletedIds === "object") {
    const {
      transactions: _transactions,
      financialTransactions: _financialTransactions,
      funds: _funds,
      organizationFunds: _organizationFunds,
      ...allowedDeletions
    } = safeState.deletedIds;
    safeState.deletedIds = allowedDeletions;
  }
  if (safeState.deleteItem) {
    const entity = String(safeState.deleteItem.entity || "").toLowerCase().replace(/[\s-]/g, "_");
    if (["transaction", "transactions", "financial_transaction", "financial_transactions", "fund", "funds", "organization_fund", "organization_funds"].includes(entity)) {
      delete safeState.deleteItem;
    }
  }
  if (isMember) {
    safeState.eggHarvests = eggHarvests.filter(
      (entry) => entry && typeof entry === "object" && entry.status === "Pending Audit" && typeof name === "string" && entry.collectedBy === name && Number.isInteger(entry.eggCount) && entry.eggCount >= 0 && entry.eggCount <= MAX_EGG_COUNT && typeof entry.date === "string" && typeof entry.time === "string"
    ).map((entry) => ({
      ...typeof entry.id === "string" ? { id: entry.id } : {},
      collectedBy: entry.collectedBy,
      eggCount: entry.eggCount,
      date: entry.date.slice(0, 50),
      time: entry.time.slice(0, 50),
      status: "Pending Audit",
      notes: typeof entry.notes === "string" ? entry.notes.slice(0, 1e3) : void 0
    }));
    safeState.appendEggHarvests = true;
  } else if (mayUpdateEggWorkflow) {
    safeState.eggHarvests = eggHarvests;
    delete safeState.appendEggHarvests;
  } else {
    delete safeState.eggHarvests;
    delete safeState.appendEggHarvests;
  }
  return safeState;
}
async function handler(req, res) {
  if (req.method && req.method !== "POST") return sendResponse(res, 405, { success: false, message: "Method not allowed." });
  if (rejectCrossOriginMutation(req)) return sendResponse(res, 403, { success: false, message: "Cross-origin requests are not allowed." });
  if (!isDatabaseConfigured()) return sendResponse(res, 503, { success: false, message: "Database is not configured." });
  const user = await requireAuthenticated(req, res);
  if (!user) return;
  try {
    const rawState = await parseRequestBody(req);
    if (!isValidSyncState(rawState)) {
      return sendResponse(res, 400, { success: false, message: "A valid state object is required." });
    }
    const state = rawState;
    if (state.roleUpdate !== void 0) {
      if (!isPresidentRole(user.role)) {
        return sendResponse(res, 403, { success: false, message: "Only the President may designate or reassign officer roles." });
      }
      if (typeof state.roleUpdate !== "object" || state.roleUpdate === null || Array.isArray(state.roleUpdate)) {
        return sendResponse(res, 400, { success: false, message: "A valid user and assignable role are required." });
      }
      const { userId, role } = state.roleUpdate;
      if (typeof userId !== "string" || !userId.trim() || typeof role !== "string" || !ASSIGNABLE_ROLES.includes(role)) {
        return sendResponse(res, 400, { success: false, message: "A valid user and assignable role are required." });
      }
      const result = await getPool().query(
        `UPDATE users
         SET role = $1
         WHERE id = $2 AND lower(replace(role, ' ', '_')) <> 'president'
         RETURNING id`,
        [role, userId]
      );
      if (result.rowCount === 0) {
        return sendResponse(res, 409, { success: false, message: "The account was not found or cannot be reassigned. Presidential changes require the turnover workflow." });
      }
      return sendResponse(res, 200, { success: true, offlineMode: false, message: "Officer role designation saved." });
    }
    if (state.deleteItem && ["user", "users", "officer", "officers"].includes(String(state.deleteItem.entity).toLowerCase())) {
      return sendResponse(res, 403, { success: false, message: "User accounts cannot be deleted through bulk synchronization." });
    }
    let safeState = { ...state };
    if (!isPresidentRole(user.role)) {
      if (isSecretaryRole(user.role) && Array.isArray(safeState.users)) {
        safeState.users = safeState.users.filter((u) => u && typeof u === "object" && u.role === "Member");
      } else {
        delete safeState.users;
      }
    }
    const roleAuthorized = state.roleUpdate !== void 0;
    if (Array.isArray(safeState.users)) {
      safeState.users = sanitizeUserRows(safeState.users, { roleAuthorized });
    }
    if (!isPresidentRole(user.role) && user.role.trim().toLowerCase() !== "pio") {
      delete safeState.achievements;
      if (safeState.deletedIds && typeof safeState.deletedIds === "object") {
        const { achievements: _deletedAchievements, ...allowedDeletions } = safeState.deletedIds;
        safeState.deletedIds = allowedDeletions;
      }
      if (safeState.deleteItem && ["achievement", "achievements"].includes(String(safeState.deleteItem.entity || "").toLowerCase())) {
        delete safeState.deleteItem;
      }
    }
    if (!isTreasurerRole(user.role)) {
      const presidentApproval = extractPresidentFinancialApproval(state, user.role);
      const auditorReview = extractAuditorReview(state, user.role);
      safeState = separateEggHarvestsFromFinancialState(safeState, user.role, user.name);
      if (presidentApproval) {
        safeState.financialTransactions = presidentApproval;
        safeState.presidentApprovalOnly = true;
      } else if (auditorReview) {
        safeState.financialTransactions = auditorReview;
        safeState.auditorReviewOnly = true;
      }
      const allowedFinancialWrite = Boolean(presidentApproval || auditorReview);
      const stripped = ["transactions", "financialTransactions", "funds", "organizationFunds", "hogRaising"].filter((key) => key in state && !(allowedFinancialWrite && key === "financialTransactions"));
      if (stripped.length > 0) {
        console.warn(`[Cloud DB Push] Ignoring financial fields from role "${user.role}": ${stripped.join(", ")}`);
        return sendResponse(res, 403, {
          success: false,
          message: `Only the Treasurer or Assistant Treasurer may update financial records (${stripped.join(", ")}).`
        });
      }
    }
    if (safeState.deletedIds && typeof safeState.deletedIds === "object") {
      const { users: _deletedUsers, ...safeDeletedIds } = safeState.deletedIds;
      safeState.deletedIds = safeDeletedIds;
    }
    await saveFullStateToPostgres(getPool(), safeState);
    return sendResponse(res, 200, { success: true, offlineMode: false, message: "State successfully synced." });
  } catch (error) {
    console.error("[Cloud DB Push Error]:", error?.message || error);
    const statusCode = error?.statusCode === 413 ? 413 : error?.code === "23505" ? 409 : 500;
    const isFundCodeConflict = error?.code === "23505" && /organization_funds/i.test(String(error?.constraint || error?.detail || ""));
    return sendResponse(res, statusCode, {
      success: false,
      message: error?.statusCode === 413 ? "Request body exceeds the allowed limit." : isFundCodeConflict ? "A fund source with that code already exists. Choose a different fund code." : error?.code === "23505" ? "That officer position is already assigned." : "Unable to sync state."
    });
  }
}
export {
  handler as default,
  extractAuditorReview,
  extractPresidentFinancialApproval,
  separateEggHarvestsFromFinancialState
};
