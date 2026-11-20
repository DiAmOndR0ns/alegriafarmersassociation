// src/api/auth.ts
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt2 from "bcryptjs";

// src/utils/totp.ts
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
var STEP_SECONDS = 30;
function decodeBase32(str) {
  if (typeof str !== "string") return new Uint8Array(0);
  const clean = str.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = value << 5 | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  return new Uint8Array(bytes);
}
function sha1Fallback(bytes) {
  let h0 = 1732584193, h1 = 4023233417, h2 = 2562383102, h3 = 271733878, h4 = 3285377520;
  const bitLen = bytes.length * 8;
  const newLen = (bytes.length + 8 >> 6 << 6) + 64;
  const buf = new Uint8Array(newLen);
  buf.set(bytes);
  buf[bytes.length] = 128;
  const view = new DataView(buf.buffer);
  view.setBigUint64(newLen - 8, BigInt(bitLen), false);
  const w = new Uint32Array(80);
  for (let i = 0; i < newLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false);
    }
    for (let j = 16; j < 80; j++) {
      const v = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
      w[j] = v << 1 | v >>> 31;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) {
        f = b & c | ~b & d;
        k = 1518500249;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 1859775393;
      } else if (j < 60) {
        f = b & c | b & d | c & d;
        k = 2400959708;
      } else {
        f = b ^ c ^ d;
        k = 3395469782;
      }
      const temp = (a << 5 | a >>> 27) + f + e + k + w[j] >>> 0;
      e = d;
      d = c;
      c = (b << 30 | b >>> 2) >>> 0;
      b = a;
      a = temp;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}
function hmacSha1Fallback(key, message) {
  let k = key;
  if (k.length > 64) k = sha1Fallback(k);
  const kPad = new Uint8Array(64);
  kPad.set(k);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = kPad[i] ^ 54;
    opad[i] = kPad[i] ^ 92;
  }
  const innerMsg = new Uint8Array(64 + message.length);
  innerMsg.set(ipad);
  innerMsg.set(message, 64);
  const innerHash = sha1Fallback(innerMsg);
  const outerMsg = new Uint8Array(64 + 20);
  outerMsg.set(opad);
  outerMsg.set(innerHash, 64);
  return sha1Fallback(outerMsg);
}
async function hmacSha1(keyBytes, message) {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : void 0;
  if (cryptoObj?.subtle) {
    try {
      const key = await cryptoObj.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-1" },
        false,
        ["sign"]
      );
      const signature = await cryptoObj.subtle.sign("HMAC", key, message);
      return new Uint8Array(signature);
    } catch {
      return hmacSha1Fallback(keyBytes, message);
    }
  }
  return hmacSha1Fallback(keyBytes, message);
}
async function generateTotpCode(secret, timestampMs = Date.now()) {
  if (typeof secret !== "string" || !secret.trim()) {
    throw new Error("Secret must be a non-empty string.");
  }
  const step = Math.floor(timestampMs / 1e3 / STEP_SECONDS);
  if (step < 0) {
    throw new Error("Timestamp must be non-negative.");
  }
  const counterBuffer = new Uint8Array(8);
  let tempStep = BigInt(step);
  for (let i = 7; i >= 0; i--) {
    counterBuffer[i] = Number(tempStep & 0xffn);
    tempStep >>= 8n;
  }
  const keyBytes = decodeBase32(secret);
  if (keyBytes.length === 0) {
    throw new Error("Invalid Base32 secret.");
  }
  const digest = await hmacSha1(keyBytes, counterBuffer);
  const offset = digest[digest.length - 1] & 15;
  const binary = (digest[offset] & 127) << 24 | (digest[offset + 1] & 255) << 16 | (digest[offset + 2] & 255) << 8 | digest[offset + 3] & 255;
  const code = (binary % 1e6).toString().padStart(6, "0");
  return code;
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyTotpCode(secret, code, timestampMs = Date.now()) {
  if (typeof secret !== "string" || !secret.trim() || typeof code !== "string") return false;
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;
  for (const delta of [0, -STEP_SECONDS * 1e3, STEP_SECONDS * 1e3]) {
    try {
      const expected = await generateTotpCode(secret, timestampMs + delta);
      if (safeEqual(expected, cleanCode)) return true;
    } catch {
      return false;
    }
  }
  return false;
}

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
            ON CONFLICT(id) DO UPDATE SET
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
      END $$; `,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_activity_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_catalog_product_id_fkey; `,
    `CREATE INDEX IF NOT EXISTS financial_transactions_activity_id_idx ON financial_transactions(activity_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_catalog_product_id_idx ON inventory(catalog_product_id); `,
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
    // Formal Auditor Reports (Proposal Requirement)
    `CREATE TABLE IF NOT EXISTS auditor_reports(
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
  ); `,
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
    ADD COLUMN IF NOT EXISTS catalog_product_id VARCHAR(100);
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS auditor_reports(
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
  const prohibited = [username, role, "password", "farmers", "association", "alegria", "bafa"].filter(
    (part) => part.trim().length > 0
  );
  if (prohibited.some((part) => lowered.includes(part.toLowerCase()))) {
    return 'Password cannot contain your username, role, association name, or the word "password".';
  }
  if (/(?:january|february|march|april|may|june|july|august|september|october|november|december|christmas|welcome|admin|letmein|iloveyou|fams)/i.test(password)) {
    return "Password cannot contain a common word, season, or month name.";
  }
  if (/(.)\1{5,}/.test(password) || /^(.{1,6})\1+$/.test(password)) {
    return "Password cannot be a repeated or padded pattern.";
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
var SESSION_COOKIE = "fams_session";
var SESSION_SECONDS = 8 * 60 * 60;
var CHALLENGE_SECONDS = 15 * 60;
var TOTP_STEP_SECONDS = 30;
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
function signToken(claims) {
  const payload = Buffer.from(JSON.stringify({ ...claims, aud: TOKEN_AUDIENCE })).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
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
function setSessionCookie(req, res, token) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = process.env.NODE_ENV === "production" || forwardedProto === "https";
  const value = token ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}` : `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", value);
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
async function hasPresidentAccount() {
  if (!isDatabaseConfigured()) return null;
  try {
    const pool = getPool();
    await ensureDatabaseSchema(pool);
    const result = await pool.query(
      "SELECT 1 FROM users WHERE lower(replace(role, ' ', '_')) = 'president' LIMIT 1"
    );
    return result.rows.length > 0;
  } catch {
    return null;
  }
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
var MFA_ENFORCED_ROLES = [
  "president",
  "vice_president",
  "treasurer",
  "assistant_treasurer",
  "secretary",
  "auditor"
];
function isPresidentRole(role) {
  return role.trim().toLowerCase().replace(/\s+/g, "_") === "president";
}
function isSecretaryRole(role) {
  const normalized = role.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized === "secretary" || normalized === "assistant_secretary";
}
function isMemberRole(role) {
  return String(role ?? "").trim().toLowerCase().replace(/\s+/g, "_") === "member";
}
var PROVISIONABLE_OFFICER_ROLES = [
  "Vice_President",
  "Secretary",
  "Assistant_Secretary",
  "Board_Member",
  "Treasurer",
  "Assistant_Treasurer",
  "Auditor",
  "PIO"
];
function canProvisionAccountRole(actorRole, targetRole) {
  if (isPresidentRole(actorRole)) {
    return isMemberRole(targetRole) || PROVISIONABLE_OFFICER_ROLES.some(
      (role) => role.toLowerCase() === targetRole.trim().toLowerCase().replace(/\s+/g, "_")
    );
  }
  return isSecretaryRole(actorRole) && isMemberRole(targetRole);
}
function newChallenge(kind, userId, options = {}) {
  return signToken({
    kind,
    sub: userId,
    exp: Math.floor(Date.now() / 1e3) + CHALLENGE_SECONDS,
    nonce: randomBytes(12).toString("base64url"),
    ...options.passwordVerified ? { passwordVerified: true } : {},
    ...options.bootstrap ? { bootstrap: true } : {}
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
function decodeBase322(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const output = [];
  for (const char of value.toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret.");
    accumulator = accumulator << 5 | index;
    bits += 5;
    if (bits >= 8) {
      output.push(accumulator >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}
function totpForStep(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase322(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = (digest[offset] & 127) << 24 | (digest[offset + 1] & 255) << 16 | (digest[offset + 2] & 255) << 8 | digest[offset + 3] & 255;
  return String(binary % 1e6).padStart(6, "0");
}
function verifyTotp(secret, supplied, nowMs = Date.now(), lastStep) {
  if (!/^\d{6}$/.test(supplied)) return null;
  const currentStep = Math.floor(nowMs / 1e3 / TOTP_STEP_SECONDS);
  for (let step = currentStep - 2; step <= currentStep + 2; step++) {
    if (step < 0) continue;
    const expected = totpForStep(secret, step);
    const a = Buffer.from(expected);
    const b = Buffer.from(supplied);
    if (a.length === b.length && timingSafeEqual(a, b) && (lastStep === null || lastStep === void 0 || step > Number(lastStep))) {
      return step;
    }
  }
  return null;
}
function enrollmentPayload(user, secret, challengeToken) {
  const issuer = "FAMS";
  const label = encodeURIComponent(`${issuer}:${user.username}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { success: true, mfaSetupRequired: true, challengeToken, secret, otpauthUrl };
}
async function clearEnrollment(pool, userId) {
  const secret = encodeBase32(randomBytes(20));
  await pool.query(
    `UPDATE users SET totp_secret = NULL, pending_totp_secret = $2, mfa_enabled = FALSE,
       totp_last_used_step = NULL, failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [userId, secret]
  );
  return secret;
}
function passwordPolicyError(password, username, role, oldHash, history) {
  const error = validatePasswordPolicy(password, username, role, Array.isArray(history) ? history : []);
  if (error) return error;
  if (oldHash && bcrypt2.compareSync(password, oldHash)) return "New password must differ from the current password.";
  return null;
}
async function recordMfaFailure(pool, userId) {
  await pool.query(`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
    total_failed_logins = COALESCE(total_failed_logins, 0) + 1,
    locked_until = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = $1`, [userId]);
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
async function loginHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  let pool;
  try {
    signingSecret();
    pool = getPool();
    await initialize(pool);
  } catch (error) {
    console.error("[Auth login setup failure]", error?.message || error);
    return errorResponse(res, 503, "Authentication service is unavailable.");
  }
  const body = await readBody(req);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return errorResponse(res, 400, "Username and password are required.");
  }
  if (body.username.length > 100 || body.password.length > 200) {
    return errorResponse(res, 401, "Invalid username or password.");
  }
  try {
    const result = await pool.query("SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1", [body.username.trim()]);
    const user = result.rows[0];
    if (!user) return errorResponse(res, 401, "Invalid username or password.");
    if (!user.is_approved) return errorResponse(res, 401, "Invalid username or password.");
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return errorResponse(res, 423, "Account temporarily locked. Try again later.");
    }
    const lockExpired = Boolean(user.locked_until);
    if (lockExpired) {
      await pool.query(`UPDATE users SET failed_login_attempts = 0 WHERE id = $1 AND locked_until IS NOT NULL`, [user.id]);
    }
    const valid = typeof user.password === "string" && user.password.startsWith("$2") ? await bcrypt2.compare(body.password, user.password).catch(() => false) : false;
    if (!valid) {
      await pool.query(`UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        total_failed_logins = COALESCE(total_failed_logins, 0) + 1,
        locked_until = CASE WHEN COALESCE(failed_login_attempts, 0) + 1 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
        WHERE id = $1`, [user.id]);
      return errorResponse(res, 401, "Invalid username or password.");
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return errorResponse(res, 423, "Account temporarily locked. Try again later.");
    }
    await pool.query("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
    const isMfaEnforced = MFA_ENFORCED_ROLES.includes(user.role.trim().toLowerCase().replace(/\s+/g, "_")) || Boolean(user.mfa_enabled);
    if (isMfaEnforced) {
      const activeSecret = user.totp_secret || user.pending_totp_secret || encodeBase32(randomBytes(20));
      if (!user.totp_secret) {
        if (user.pending_totp_secret !== activeSecret) {
          await pool.query("UPDATE users SET pending_totp_secret = $1 WHERE id = $2", [activeSecret, user.id]);
          user.pending_totp_secret = activeSecret;
        }
        return sendResponse(res, 200, {
          success: true,
          mfaSetupRequired: true,
          challengeToken: newChallenge("mfa-setup", user.id, { passwordVerified: true })
        });
      }
      if (typeof body.totpCode !== "string") {
        return sendResponse(res, 200, {
          success: true,
          mfaRequired: true,
          challengeToken: newChallenge("mfa-login", user.id, { passwordVerified: true })
        });
      }
      const step = verifyTotp(activeSecret, body.totpCode, Date.now(), user.totp_last_used_step);
      if (step === null) {
        await recordMfaFailure(pool, user.id);
        return errorResponse(res, 401, "Invalid authentication code.");
      }
      const consumed = await pool.query(`UPDATE users SET totp_last_used_step = $1, mfa_enabled = TRUE
        WHERE id = $2 AND (totp_last_used_step IS NULL OR totp_last_used_step < $1) RETURNING id`, [step, user.id]);
      if (!consumed.rowCount) return errorResponse(res, 401, "Authentication code already used.");
    }
    const token = signToken({ kind: "session", sub: user.id, exp: Math.floor(Date.now() / 1e3) + SESSION_SECONDS });
    setSessionCookie(req, res, token);
    return sendResponse(res, 200, { success: true, user: safeUser(user) });
  } catch (error) {
    console.error("[Auth login failure]", error);
    return errorResponse(res, 500, "Unable to complete login.");
  }
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
async function mfaResetHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  let actor;
  let pool;
  try {
    actor = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, "Authentication is not configured or unavailable.");
  }
  if (!actor) return errorResponse(res, 401, "Authentication required.");
  const body = await readBody(req);
  if (!body || typeof body.targetUserId !== "string" || typeof body.currentPassword !== "string") {
    return errorResponse(res, 400, "Target account and your current password are required.");
  }
  const managesOfficers = isPresidentRole(actor.role);
  const managesMembers = isSecretaryRole(actor.role);
  const canEnrolSelf = MFA_ENFORCED_ROLES.includes(
    actor.role.trim().toLowerCase().replace(/\s+/g, "_")
  );
  const isSelf = body.targetUserId === actor.id && canEnrolSelf;
  if (!managesOfficers && !managesMembers && !isSelf) {
    return errorResponse(res, 403, "President or Secretary access is required.");
  }
  try {
    const actorRow = (await pool.query("SELECT * FROM users WHERE id = $1", [actor.id])).rows[0];
    if (!actorRow || !await bcrypt2.compare(body.currentPassword, actorRow.password)) {
      return errorResponse(res, 401, "Current password is incorrect.");
    }
    const target = (await pool.query("SELECT * FROM users WHERE id = $1", [body.targetUserId])).rows[0];
    if (!target) return errorResponse(res, 404, "Target account was not found.");
    if (isPresidentRole(target.role) && !isSelf) {
      return errorResponse(res, 403, "The President resets their own two-factor authentication.");
    }
    if (!isSelf && managesMembers) {
      if (!managesOfficers && !isMemberRole(target.role)) {
        return errorResponse(res, 403, "Secretary access can reset Member accounts only.");
      }
    }
    const secret = await clearEnrollment(pool, target.id);
    return sendResponse(res, 200, {
      success: true,
      message: "Two-factor authentication was reset. The account must enrol an authenticator at its next sign-in.",
      // Only the account's own console sees the fresh key; an officer resetting a
      // colleague never learns their secret.
      ...isSelf ? { secret } : {}
    });
  } catch (error) {
    console.error("[Auth MFA reset failure]", error);
    return errorResponse(res, 500, "Unable to reset two-factor authentication.");
  }
}
async function mfaConfirmHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  try {
    signingSecret();
    const body = await readBody(req);
    const claims = body?.challengeToken ? verifyToken(String(body.challengeToken)) : null;
    if (!claims || !["mfa-login", "mfa-setup"].includes(claims.kind) || typeof body.totpCode !== "string") {
      return errorResponse(res, 401, "Invalid or expired MFA challenge.");
    }
    const pool = getPool();
    await initialize(pool);
    const client = await pool.connect();
    let user;
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [claims.sub]);
      user = result.rows[0];
      if (!user) {
        await client.query("ROLLBACK");
        return errorResponse(res, 401, "Invalid or expired MFA challenge.");
      }
      if (claims.kind === "mfa-setup") {
        if (!claims.bootstrap && !claims.passwordVerified) {
          await client.query("ROLLBACK");
          return errorResponse(res, 401, "Invalid or expired MFA challenge.");
        }
        const secret = user.pending_totp_secret || user.totp_secret;
        const step = secret ? verifyTotp(secret, body.totpCode) : null;
        if (step === null) {
          await recordMfaFailure(client, user.id);
          await client.query("COMMIT");
          return errorResponse(res, 401, "Invalid authentication code.");
        }
        if (secret && !await verifyTotpCode(secret, body.totpCode)) {
          await recordMfaFailure(client, user.id);
          await client.query("COMMIT");
          return errorResponse(res, 401, "Invalid authentication code.");
        }
        await client.query(`UPDATE users SET totp_secret = $1, pending_totp_secret = NULL,
          mfa_enabled = TRUE, totp_last_used_step = $2, failed_login_attempts = 0,
          locked_until = NULL WHERE id = $3`, [secret, step, user.id]);
        user.totp_secret = secret;
        user.pending_totp_secret = null;
        user.mfa_enabled = true;
      } else {
        const secret = user.totp_secret || user.pending_totp_secret;
        if (!secret) {
          await client.query("ROLLBACK");
          return errorResponse(res, 401, "Invalid or expired MFA challenge.");
        }
        const step = verifyTotp(secret, body.totpCode, Date.now(), user.totp_last_used_step);
        if (step === null) {
          await recordMfaFailure(client, user.id);
          await client.query("COMMIT");
          return errorResponse(res, 401, "Invalid authentication code.");
        }
        await client.query(`UPDATE users SET totp_last_used_step = $1, totp_secret = COALESCE(totp_secret, $2), mfa_enabled = TRUE
          WHERE id = $3 AND (totp_last_used_step IS NULL OR totp_last_used_step < $1)`, [step, secret, user.id]);
        user.mfa_enabled = true;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
      });
      throw error;
    } finally {
      client.release();
    }
    const token = signToken({ kind: "session", sub: user.id, exp: Math.floor(Date.now() / 1e3) + SESSION_SECONDS });
    setSessionCookie(req, res, token);
    return sendResponse(res, 200, { success: true, user: safeUser(user) });
  } catch (error) {
    console.error("[Auth MFA confirm failure]", error);
    return errorResponse(res, 500, "Unable to complete MFA verification.");
  }
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
  } catch (error) {
    console.error("[Auth bootstrap setup failure]", error?.message || error);
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
  const challengeToken = newChallenge("mfa-setup", row.id, { bootstrap: true });
  return sendResponse(res, 200, enrollmentPayload(row, secret, challengeToken));
}
async function sessionHandler(req, res) {
  try {
    const user = await getAuthenticatedUser(req);
    if (user) {
      const token = signToken({
        kind: "session",
        sub: user.id,
        exp: Math.floor(Date.now() / 1e3) + SESSION_SECONDS
      });
      setSessionCookie(req, res, token);
    }
    return sendResponse(res, 200, {
      authenticated: Boolean(user),
      user: user || null,
      configured: isDatabaseConfigured(),
      // Paired with `configured` so the login screen only offers the one-time
      // President/Admin setup when the database really has no President yet.
      // Null (not false) when it cannot be determined.
      hasPresident: await hasPresidentAccount()
    });
  } catch {
    return errorResponse(res, 503, "Authentication is not configured or unavailable.");
  }
}
async function logoutHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  try {
    signingSecret();
  } catch {
    return errorResponse(res, 503, "Authentication is not configured.");
  }
  setSessionCookie(req, res);
  return sendResponse(res, 200, { success: true });
}
async function passwordChangeHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  let user;
  let pool;
  try {
    user = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, "Authentication is not configured or unavailable.");
  }
  if (!user) return errorResponse(res, 401, "Authentication required.");
  const body = await readBody(req);
  if (!body || typeof body.newPassword !== "string") return errorResponse(res, 400, "New password is required.");
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [user.id]);
    const row = result.rows[0];
    if (!row) return errorResponse(res, 401, "Authentication required.");
    if (!(row.must_change_password && body.currentPassword === void 0)) {
      if (typeof body.currentPassword !== "string" || !await bcrypt2.compare(body.currentPassword, row.password)) {
        return errorResponse(res, 401, "Current password is incorrect.");
      }
    }
    const history = Array.isArray(row.password_history) ? row.password_history : [];
    const policyError = passwordPolicyError(body.newPassword, row.username, row.role, row.password, history);
    if (policyError) return errorResponse(res, 400, policyError);
    const newHash = await bcrypt2.hash(body.newPassword, BCRYPT_COST);
    const nextHistory = [...history, { hash: row.password, changedAt: (/* @__PURE__ */ new Date()).toISOString() }].slice(-PASSWORD_HISTORY_LIMIT);
    const updated = await pool.query(`UPDATE users SET password = $1, password_history = $2::jsonb,
      password_changed_at = NOW(), must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL
      WHERE id = $3 RETURNING *`, [newHash, JSON.stringify(nextHistory), row.id]);
    return sendResponse(res, 200, { success: true, user: safeUser(updated.rows[0]) });
  } catch (error) {
    console.error("[Auth password change failure]", error);
    return errorResponse(res, 500, "Unable to change password.");
  }
}
async function passwordResetHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  let actor;
  let pool;
  try {
    actor = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, "Authentication is not configured or unavailable.");
  }
  if (!actor) return errorResponse(res, 401, "Authentication required.");
  if (!isPresidentRole(actor.role) && !isSecretaryRole(actor.role)) return errorResponse(res, 403, "President or Secretary access is required.");
  const body = await readBody(req);
  if (!body || typeof body.targetUserId !== "string" || typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return errorResponse(res, 400, "Current password, target user, and new password are required.");
  }
  try {
    const client = await pool.connect();
    let target;
    try {
      await client.query("BEGIN");
      const actorResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [actor.id]);
      const actorRow = actorResult.rows[0];
      if (!actorRow || !await bcrypt2.compare(body.currentPassword, actorRow.password)) {
        await client.query("ROLLBACK");
        return errorResponse(res, 401, "Current password is incorrect.");
      }
      const targetResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [body.targetUserId]);
      target = targetResult.rows[0];
      if (!target) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Target account was not found.");
      }
      if (isPresidentRole(target.role)) {
        await client.query("ROLLBACK");
        return errorResponse(res, 403, "President accounts cannot be reset through this endpoint.");
      }
      if (isSecretaryRole(actorRow.role) && !isMemberRole(target.role)) {
        await client.query("ROLLBACK");
        return errorResponse(res, 403, "Secretary access can reset Member accounts only.");
      }
      const history = Array.isArray(target.password_history) ? target.password_history : [];
      const policyError = passwordPolicyError(body.newPassword, target.username, target.role, target.password, history);
      if (policyError) {
        await client.query("ROLLBACK");
        return errorResponse(res, 400, policyError);
      }
      const newHash = await bcrypt2.hash(body.newPassword, BCRYPT_COST);
      const nextHistory = typeof target.password === "string" && target.password.startsWith("$2") ? [...history, { hash: target.password, changedAt: (/* @__PURE__ */ new Date()).toISOString() }].slice(-PASSWORD_HISTORY_LIMIT) : history.slice(-PASSWORD_HISTORY_LIMIT);
      const updated = await client.query(
        `UPDATE users SET password = $1, password_history = $2::jsonb,
        password_changed_at = NOW(), must_change_password = TRUE, failed_login_attempts = 0,
        locked_until = NULL, reset_requested = FALSE,
        is_approved = CASE WHEN password IS NULL OR password = '' OR password NOT LIKE '$2%' THEN TRUE ELSE is_approved END
        WHERE id = $3 RETURNING *`,
        [newHash, JSON.stringify(nextHistory), target.id]
      );
      target = updated.rows[0];
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {
      });
      throw error;
    } finally {
      client.release();
    }
    return sendResponse(res, 200, { success: true, user: safeUser(target) });
  } catch (error) {
    console.error("[Auth password reset failure]", error);
    return errorResponse(res, 500, "Unable to reset password.");
  }
}
async function accountProvisionHandler(req, res) {
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  let actor;
  let pool;
  try {
    actor = await getAuthenticatedUser(req);
    pool = getPool();
    await initialize(pool);
  } catch {
    return errorResponse(res, 503, "Authentication is not configured or unavailable.");
  }
  if (!actor) return errorResponse(res, 401, "Authentication required.");
  if (!isPresidentRole(actor.role) && !isSecretaryRole(actor.role)) {
    return errorResponse(res, 403, "President or Secretary access is required.");
  }
  const body = await readBody(req);
  if (!body || typeof body.id !== "string" || typeof body.username !== "string" || typeof body.password !== "string" || typeof body.name !== "string" || typeof body.role !== "string") {
    return errorResponse(res, 400, "Account ID, name, username, role, and password are required.");
  }
  const id = body.id.trim();
  const username = body.username.trim().toLowerCase();
  const name = body.name.trim();
  const requestedRole = body.role.trim();
  const normalizedRole = requestedRole.toLowerCase().replace(/\s+/g, "_");
  const role = isMemberRole(requestedRole) ? "Member" : PROVISIONABLE_OFFICER_ROLES.find((candidate) => candidate.toLowerCase() === normalizedRole);
  if (!/^[a-zA-Z0-9._:-]{1,100}$/.test(id) || !/^[a-z0-9._-]{3,100}$/.test(username) || !name || name.length > 200 || body.password.length > 200) {
    return errorResponse(res, 400, "Account details are invalid.");
  }
  if (!role) return errorResponse(res, 403, "You are not allowed to create this account role.");
  if (!canProvisionAccountRole(actor.role, role)) {
    return errorResponse(res, 403, "You are not allowed to create this account role.");
  }
  const client = await pool.connect();
  let row;
  try {
    await client.query("BEGIN");
    const targetResult = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [id]);
    const target = targetResult.rows[0];
    if (target) {
      if (isPresidentRole(target.role) || !canProvisionAccountRole(actor.role, target.role)) {
        await client.query("ROLLBACK");
        return errorResponse(res, 403, "You are not allowed to manage this account.");
      }
      if (target.role.trim().toLowerCase().replace(/\s+/g, "_") !== role.toLowerCase().replace(/\s+/g, "_")) {
        await client.query("ROLLBACK");
        return errorResponse(res, 403, "Account roles cannot be changed through credential setup.");
      }
      const usernameInUse = await client.query(
        "SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1",
        [username, id]
      );
      if (usernameInUse.rows.length) {
        await client.query("ROLLBACK");
        return errorResponse(res, 409, "That username is already in use.");
      }
      const history = Array.isArray(target.password_history) ? target.password_history : [];
      const policyError = passwordPolicyError(body.password, username, target.role, target.password, history);
      if (policyError) {
        await client.query("ROLLBACK");
        return errorResponse(res, 400, policyError);
      }
      const passwordHash = await bcrypt2.hash(body.password, BCRYPT_COST);
      const nextHistory = typeof target.password === "string" && target.password.startsWith("$2") ? [...history, { hash: target.password, changedAt: (/* @__PURE__ */ new Date()).toISOString() }].slice(-PASSWORD_HISTORY_LIMIT) : history.slice(-PASSWORD_HISTORY_LIMIT);
      const updated = await client.query(
        `UPDATE users SET username = $1, password = $2, name = $3,
        password_history = $4::jsonb, password_changed_at = NOW(), must_change_password = FALSE,
        failed_login_attempts = 0, locked_until = NULL, reset_requested = FALSE,
        is_approved = CASE WHEN password IS NULL OR password = '' OR password NOT LIKE '$2%' THEN TRUE ELSE is_approved END
        WHERE id = $5 RETURNING *`,
        [username, passwordHash, name, JSON.stringify(nextHistory), id]
      );
      row = updated.rows[0];
    } else {
      const usernameInUse = await client.query(
        "SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1",
        [username]
      );
      if (usernameInUse.rows.length) {
        await client.query("ROLLBACK");
        return errorResponse(res, 409, "That username is already in use.");
      }
      const policyError = validatePasswordPolicy(body.password, username, role, []);
      if (policyError) {
        await client.query("ROLLBACK");
        return errorResponse(res, 400, policyError);
      }
      const passwordHash = await bcrypt2.hash(body.password, BCRYPT_COST);
      const inserted = await client.query(
        `INSERT INTO users
        (id, username, password, name, role, is_approved, joined_date, password_history,
         password_changed_at, must_change_password, failed_login_attempts, locked_until, reset_requested)
        VALUES ($1, $2, $3, $4, $5, TRUE, NOW()::text, '[]'::jsonb, NOW(), FALSE, 0, NULL, FALSE)
        RETURNING *`,
        [id, username, passwordHash, name, role]
      );
      row = inserted.rows[0];
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    if (error?.code === "23505") return errorResponse(res, 409, "That account ID, username, or role is already in use.");
    console.error("[Auth account provisioning failure]", error);
    return errorResponse(res, 500, "Unable to create or update the account.");
  } finally {
    client.release();
  }
  return sendResponse(res, 200, { success: true, user: safeUser(row) });
}
async function passwordResetRequestHandler(req, res) {
  if (req.method && req.method !== "POST") return errorResponse(res, 405, "Method not allowed.");
  if (rejectCrossOriginMutation(req)) return errorResponse(res, 403, "Cross-origin requests are not allowed.");
  const body = await parseRequestBody(req).catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const sitio = typeof body?.sitio === "string" ? body.sitio.trim() : "";
  const validSitios = /* @__PURE__ */ new Set(["Sitio Tapon", "Sitio Pundok 1", "Sitio Pundok 2", "Sitio Lamak"]);
  if (!username || username.length > 120 || !validSitios.has(sitio)) {
    return errorResponse(res, 400, "Please enter your username and select your assigned Sitio.");
  }
  const uniformMessage = "If an account matches those details, a password reset request has been sent to the AFA officers.";
  if (!isDatabaseConfigured()) {
    return sendResponse(res, 200, { success: true, offlineMode: true, message: uniformMessage });
  }
  try {
    await ensureDatabaseSchema(getPool());
    await getPool().query(
      `UPDATE users
       SET reset_requested = TRUE
       WHERE lower(username) = lower($1) AND is_approved IS NOT FALSE`,
      [username]
    );
  } catch (error) {
    console.error("[Auth password reset request failure]", error);
    return errorResponse(res, 503, "Unable to record your password reset request right now.");
  }
  return sendResponse(res, 200, { success: true, message: uniformMessage });
}
var AUTH_ROUTES = [
  ["POST", "/api/auth/login", loginHandler],
  ["POST", "/api/auth/logout", logoutHandler],
  ["GET", "/api/auth/session", sessionHandler],
  ["POST", "/api/auth/bootstrap", bootstrapHandler],
  ["POST", "/api/auth/mfa/enroll", mfaEnrollHandler],
  ["POST", "/api/auth/mfa/confirm", mfaConfirmHandler],
  ["POST", "/api/auth/mfa/reset", mfaResetHandler],
  ["POST", "/api/auth/password/change", passwordChangeHandler],
  ["POST", "/api/auth/password/reset", passwordResetHandler],
  ["POST", "/api/auth/password/request", passwordResetRequestHandler],
  ["POST", "/api/auth/accounts/provision", accountProvisionHandler]
];
function resolveAuthPath(req) {
  const candidates = [req?.headers?.["x-vercel-rewrite"], req?.headers?.["x-original-url"], req?.url];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    let parsed;
    try {
      parsed = new URL(candidate, "http://localhost");
    } catch {
      continue;
    }
    const pathname = parsed.pathname.length > 1 ? parsed.pathname.replace(/\/+$/, "") : parsed.pathname;
    if (!pathname.startsWith("/api/auth")) continue;
    if (pathname === "/api/auth" || pathname === "/api/auth/") {
      const params = parsed.searchParams;
      const positional = [...params.entries()].filter(([key]) => /^\d+$/.test(key)).sort((a, b) => Number(a[0]) - Number(b[0])).map(([, value]) => value);
      if (positional.length > 0) {
        return `/api/auth/${positional.join("/")}`.replace(/\/+$/, "");
      }
      const segments = params.get("path") ?? params.get("path*");
      if (segments) {
        const rebuilt = `/api/auth/${String(segments).split("/").filter(Boolean).join("/")}`;
        return rebuilt.replace(/\/+$/, "");
      }
    }
    return pathname;
  }
  return null;
}
async function authHandler(req, res) {
  const pathname = resolveAuthPath(req);
  const route = AUTH_ROUTES.find(([, routePath]) => routePath === pathname);
  if (!route) {
    return errorResponse(res, 404, "Not found.");
  }
  const method = typeof req?.method === "string" ? req.method.trim().toUpperCase() : "";
  if (method && method !== route[0]) {
    if (typeof res?.setHeader === "function") res.setHeader("Allow", route[0]);
    return errorResponse(res, 405, "Method not allowed.");
  }
  try {
    return await route[2](req, res);
  } catch (error) {
    console.error("[Auth route failure]", error);
    return errorResponse(res, 500, "The request could not be completed.");
  }
}
export {
  authHandler as default,
  resolveAuthPath
};
