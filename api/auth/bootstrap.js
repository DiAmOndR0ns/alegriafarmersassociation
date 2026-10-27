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
    `UPDATE users SET mfa_enabled = TRUE WHERE lower(replace(role, ' ', '_')) = 'president' AND mfa_enabled = FALSE;`,
    
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

// src/utils/audit.ts
function sha256(ascii) {
  function rightRotate(value, amount) {
    return value >>> amount | value << 32 - amount;
  }
  let i, j;
  const bytes = new TextEncoder().encode(ascii);
  const words = [];
  const byteLength = bytes.length;
  const hash = [
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ];
  const k = [
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ];
  const wordsLength = (byteLength + 8 >> 6) + 1 << 4;
  for (i = 0; i < wordsLength; i++) {
    words[i] = 0;
  }
  for (i = 0; i < byteLength; i++) {
    words[i >> 2] |= bytes[i] << 24 - i % 4 * 8;
  }
  words[byteLength >> 2] |= 128 << 24 - byteLength % 4 * 8;
  words[wordsLength - 2] = Math.floor(byteLength / 536870912);
  words[wordsLength - 1] = byteLength << 3 >>> 0;
  for (j = 0; j < wordsLength; j += 16) {
    const w = [];
    for (i = 0; i < 16; i++) {
      w[i] = words[j + i];
    }
    for (i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = e & f ^ ~e & g;
      const temp1 = h + S1 + ch + k[i] + w[i] | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const temp2 = S0 + maj | 0;
      h = g;
      g = f;
      f = e;
      e = d + temp1 | 0;
      d = c;
      c = b;
      b = a;
      a = temp1 + temp2 | 0;
    }
    hash[0] = hash[0] + a | 0;
    hash[1] = hash[1] + b | 0;
    hash[2] = hash[2] + c | 0;
    hash[3] = hash[3] + d | 0;
    hash[4] = hash[4] + e | 0;
    hash[5] = hash[5] + f | 0;
    hash[6] = hash[6] + g | 0;
    hash[7] = hash[7] + h | 0;
  }
  let hex = "";
  for (i = 0; i < 8; i++) {
    const word = hash[i];
    for (j = 0; j < 4; j++) {
      const byte = word >>> 24 - j * 8 & 255;
      hex += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }
  return hex;
}

// src/utils/passwordPolicy.ts
function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
var BCRYPT_COST = 12;
var PASSWORD_MIN_LENGTH = 12;
var PASSWORD_HISTORY_LIMIT = 5;
function validatePasswordPolicy(password, username, role, history = []) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "Password must be at least 12 characters long.";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Use uppercase and lowercase letters, a number, and a special character.";
  }
  const lowered = password.toLowerCase();
  const prohibited = [username, role, "password"].filter((part) => part.trim().length > 0);
  if (prohibited.some((part) => lowered.includes(part.toLowerCase()))) {
    return 'Password cannot contain your username, role, or the word "password".';
  }
  if (/(?:01234|12345|23456|34567|45678|56789|67890|09876|98765|87654|76543|65432|54321|43210|qwerty|asdfgh|zxcvbn)/i.test(
    password
  )) {
    return "Password cannot contain common sequential or keyboard patterns.";
  }
  const recent = (Array.isArray(history) ? history : []).slice(-PASSWORD_HISTORY_LIMIT);
  if (recent.some(
    (entry) => entry.hash?.startsWith("$2") ? bcrypt.compareSync(password, entry.hash) : entry.hash?.startsWith("sha256$") ? constantTimeEquals(createLegacySha256(password), entry.hash) : entry.hash === password
  )) {
    return "You cannot reuse any of your last 5 passwords.";
  }
  return null;
}
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;
function createLegacySha256(password) {
  return `sha256$${sha256(`bafa_secure_salt_v1:${password.trim()}`)}`;
}

// src/api/auth.ts
var SESSION_SECONDS = 8 * 60 * 60;
var CHALLENGE_SECONDS = 15 * 60;
function signingSecret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32 || new Set(value).size < 16 || /^(change.?me|secret|password)/i.test(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
    }
    const seed = "afa-farmers-association-development-secret-key-tuburan-cebu";
    return createHash("sha256").update(seed).digest();
  }
  return Buffer.from(value, "utf8");
}
function signToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
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
function newChallenge(kind, userId) {
  return signToken({
    kind,
    sub: userId,
    exp: Math.floor(Date.now() / 1e3) + CHALLENGE_SECONDS,
    nonce: randomBytes(12).toString("base64url")
  });
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
function enrollmentPayload(user, secret, challengeToken) {
  const issuer = "FAMS";
  const label = encodeURIComponent(`${issuer}:${user.username}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { success: true, mfaSetupRequired: true, challengeToken, secret, otpauthUrl };
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
async function bootstrapHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  const bootstrapSecret = process.env.FAMS_BOOTSTRAP_SECRET || process.env.BOOTSTRAP_SECRET || "";
  if (!bootstrapSecret || bootstrapSecret.length < 32) return errorResponse(res, 503, "Bootstrap is not configured.");
  let pool;
  try {
    signingSecret();
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, "Authentication service is unavailable.");
  }
  const body = await readBody(req);
  if (!body || typeof body.bootstrapSecret !== "string" || typeof body.name !== "string" || typeof body.username !== "string" || typeof body.password !== "string") {
    return errorResponse(res, 400, "Bootstrap details are required.");
  }
  const supplied = Buffer.from(body.bootstrapSecret);
  const expected = Buffer.from(bootstrapSecret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return errorResponse(res, 401, "Invalid bootstrap credentials.");
  }
  const username = body.username.trim().toLowerCase();
  const policyError = validatePasswordPolicy(body.password, username, "President", []);
  if (!body.name.trim() || !/^[a-z0-9._-]{3,100}$/.test(username) || policyError) {
    return errorResponse(res, 400, policyError || "Name or username is invalid.");
  }
  const hash = await bcrypt2.hash(body.password, BCRYPT_COST);
  const secret = encodeBase32(randomBytes(20));
  const client = await pool.connect();
  let row;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('fams:first-president-bootstrap'))");
    const existing = await client.query(`SELECT id FROM users
      WHERE lower(replace(role, ' ', '_')) = 'president' OR lower(username) = lower($1) LIMIT 1 FOR UPDATE`, [username]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return errorResponse(res, 409, "The first President account has already been initialized.");
    }
    const inserted = await client.query(`INSERT INTO users
      (id, username, password, name, role, is_approved, password_history, password_changed_at, must_change_password,
       failed_login_attempts, locked_until, reset_requested, pending_totp_secret, mfa_enabled, joined_date)
      VALUES ($1, $2, $3, $4, 'President', TRUE, '[]'::jsonb, NOW(), FALSE, 0, NULL, FALSE, $5, FALSE, NOW()::text)
      RETURNING *`, [randomBytes(16).toString("hex"), username, hash, body.name.trim(), secret]);
    row = inserted.rows[0];
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    if (error?.code === "23505") return errorResponse(res, 409, "A unique President seat or username is already present.");
    console.error("[Auth bootstrap failure]", error);
    return errorResponse(res, 500, "Unable to initialize the first President account.");
  } finally {
    client.release();
  }
  const challengeToken = newChallenge("mfa-setup", row.id);
  return sendResponse(res, 200, enrollmentPayload(row, secret, challengeToken));
}
export {
  bootstrapHandler as default
};
