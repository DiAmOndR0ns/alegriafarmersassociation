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
function isDatabaseConfigured() {
  const dbUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, "");
  return Boolean(
    dbUrl && dbUrl !== "" && !dbUrl.includes("[YOUR-PASSWORD]") && !dbUrl.includes("<password>") && !dbUrl.includes("YOUR_PASSWORD") && !dbUrl.includes("your_supabase_connection_string") && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))
  );
}
function cleanDatabaseUrl(rawUrl) {
  let urlStr = rawUrl.trim().replace(/^["']|["']$/g, "");
  let hostInfo = "PostgreSQL";
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
  if (!rawDbUrl || !isDatabaseConfigured()) {
    throw new Error("DATABASE_URL environment variable is not configured");
  }
  const { connectionString } = cleanDatabaseUrl(rawDbUrl);
  const cached = poolCache.get(connectionString);
  if (cached) {
    scheduleIdleEviction(connectionString);
    poolInstance = cached;
    lastUsedConnectionString = connectionString;
    return cached;
  }
  const pool = new PgPool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    },
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
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_requested BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_step BIGINT;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users (lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN ('member', 'board_member');`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_status VARCHAR(50) DEFAULT 'Unaudited';`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audit_notes TEXT;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,
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
        fund_source TEXT,
        audited_status VARCHAR(50) DEFAULT 'Unaudited',
        audited_by TEXT,
        audited_date VARCHAR(50),
        audit_notes TEXT
      );
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
async function deleteEntityFromPostgres(pool, entity, ids) {
  const tableName = lookupEntityTable(entity);
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
    console.log(`[DB DELETE] Removed ${res.rowCount || 0} record(s) from "${tableName}" (IDs: ${idList.join(", ")})`);
    return { success: true, deletedCount: res.rowCount || 0, entity, table: tableName };
  } finally {
    client.release();
  }
}
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

// src/api/auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt2 from "bcryptjs";

// src/api/helper.ts
function sendResponse(res, statusCode, data) {
  try {
    if (res.headersSent) return;
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
function signingSecret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32 || new Set(value).size < 16 || /^(change.?me|secret|password)/i.test(value)) {
    const seed = process.env.DATABASE_URL || "afa-farmers-association-session-secret-seed-key-tuburan-cebu";
    return createHash("sha256").update(seed).digest();
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
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims || claims.kind !== "session") return null;
  if (!isDatabaseConfigured()) return null;
  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [claims.sub]);
    return result.rows[0] ? safeUser(result.rows[0]) : null;
  } catch {
    return null;
  }
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
async function requireAuthenticated(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) errorResponse(res, 401, "Authentication required.");
    return user;
  } catch {
    errorResponse(res, 401, "Authentication required.");
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
