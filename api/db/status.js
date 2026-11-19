// src/api/status.ts
import pg2 from "pg";

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

// src/api/db.ts
import pg from "pg";
var PgPool = pg?.Pool || pg?.default?.Pool || pg?.default || pg;
function isLoopbackDatabaseUrl(rawUrl) {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, "");
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return /^[a-z]+:\/\/.*@(localhost|127\.0\.0\.1|\[::1\])([:/?]|$)/i.test(urlStr);
  }
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

// src/api/status.ts
var PgPool2 = pg2?.Pool || pg2?.default?.Pool || pg2?.default || pg2;
var poolInstance = null;
var lastUsedConnectionString = null;
function getStatusPool() {
  const rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl) throw new Error("DATABASE_URL is not set for the hosted Supabase project");
  if (isLoopbackDatabaseUrl(rawDbUrl)) {
    throw new Error("DATABASE_URL points at a local database; the hosted Supabase connection string is required");
  }
  const { connectionString } = cleanDatabaseUrl(rawDbUrl);
  if (!poolInstance || lastUsedConnectionString !== connectionString) {
    if (poolInstance) {
      poolInstance.end().catch(() => {
      });
    }
    poolInstance = new PgPool2({
      connectionString,
      ssl: getDatabaseSslOptions(),
      connectionTimeoutMillis: 5e3,
      max: 5
    });
    lastUsedConnectionString = connectionString;
  }
  if (!poolInstance) {
    throw new Error("Failed to initialize PostgreSQL pool");
  }
  return poolInstance;
}
var APP_TABLES = [
  "users",
  "members",
  "meetings",
  "resolutions",
  "financial_transactions",
  "announcements",
  "system_logs",
  "afa_igp",
  "afa_igp_livestock",
  "afa_igp_expenses",
  "afa_igp_harvests",
  "afa_igp_sales",
  "products",
  "inventory",
  "activities",
  "achievements",
  "organization_funds",
  "auditor_reports",
  "delegation_requests",
  "membership_payments",
  "membership_year_snapshots"
];
async function getLiveTableStats(pool) {
  const client = await pool.connect();
  const tableCounts = {};
  let totalRecords = 0;
  try {
    for (const table of APP_TABLES) {
      try {
        const res = await client.query(`SELECT count(*) as count FROM ${table}`);
        const count = Number(res.rows[0]?.count || 0);
        tableCounts[table] = count;
        totalRecords += count;
      } catch {
        tableCounts[table] = 0;
      }
    }
    return { tableCounts, totalRecords };
  } finally {
    client.release();
  }
}
async function handler(req, res) {
  try {
    if (req.method !== "GET") return sendResponse(res, 405, { error: "Method not allowed" });
    const rawUrl = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
    if (!rawUrl) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: "local",
        provider: "Local",
        message: "DATABASE_URL is not set. Running on local device storage; add the Supabase connection string to sync."
      });
    }
    if (isLoopbackDatabaseUrl(rawUrl)) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: "local",
        provider: "Local",
        message: "DATABASE_URL points at a local database (localhost). Remove it and use the hosted Supabase connection string (Project Settings > Database) to enable cloud sync."
      });
    }
    if (rawUrl.includes("[YOUR-PASSWORD]") || rawUrl.includes("<password>") || rawUrl.includes("YOUR_PASSWORD")) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: "local",
        provider: "Local",
        message: 'DATABASE_URL still contains the placeholder "[YOUR-PASSWORD]". Replace it with your actual Supabase database password in Vercel Settings and redeploy.'
      });
    }
    if (/:\[[^\]]+\]@/.test(rawUrl)) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: "local",
        provider: "Local",
        message: "DATABASE_URL has square brackets around your password like :[password]@. Remove the brackets [ and ] from the password."
      });
    }
    if (!rawUrl.startsWith("postgres://") && !rawUrl.startsWith("postgresql://")) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: "local",
        provider: "Local",
        message: 'DATABASE_URL must start with "postgresql://" or "postgres://". Please copy the URI from Supabase Project Settings > Database.'
      });
    }
    const isDirectPort = rawUrl.includes(":5432") && rawUrl.includes("db.");
    const provider = "Supabase";
    const pool = getStatusPool();
    const queryPromise = pool.query("SELECT NOW() as current_time, current_database() as db_name");
    const statsPromise = getLiveTableStats(pool);
    const presPromise = pool.query("SELECT 1 FROM users WHERE lower(replace(role, ' ', '_')) = 'president' LIMIT 1").catch(() => ({ rowCount: 0 }));
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => {
        reject(new Error(
          isDirectPort ? "Connection timed out after 4 seconds. You are using the Direct URI (db.xxxx.supabase.co:5432) which requires IPv6. Vercel serverless functions require the Connection Pooler URI (aws-0-*.pooler.supabase.com:6543) over IPv4." : "Connection timed out after 4 seconds. Check if your Supabase project is active (not paused) or if your database password is correct."
        ));
      }, 4e3)
    );
    const [result, stats, presRes] = await Promise.all([
      Promise.race([queryPromise, timeoutPromise]),
      statsPromise,
      presPromise
    ]);
    return sendResponse(res, 200, {
      connected: true,
      configured: true,
      storageMode: "supabase",
      provider,
      database: result.rows[0]?.db_name || "postgres",
      timestamp: result.rows[0]?.current_time,
      tableCounts: stats.tableCounts,
      totalRecords: stats.totalRecords,
      hasPresident: Boolean(presRes?.rowCount && presRes.rowCount > 0),
      message: `Connected to ${provider} (${result.rows[0]?.db_name || "postgres"}) \u2014 ${stats.totalRecords} records across ${Object.keys(stats.tableCounts).length} tables`
    });
  } catch (err) {
    const errMsg = String(err?.message || "");
    console.error("[DB Status] Connection failure:", errMsg);
    let reason = "the server could not open a connection";
    let helpfulTip = "";
    if (errMsg.includes("password authentication failed")) {
      reason = "the database rejected the stored credentials";
      helpfulTip = " Password incorrect. Reset your database password in Supabase > Project Settings > Database, update DATABASE_URL in Vercel, and Redeploy.";
    } else if (errMsg.includes("timed out") || errMsg.includes("ETIMEDOUT")) {
      reason = "the connection timed out";
      helpfulTip = ' If your Supabase project was paused due to inactivity, open your Supabase dashboard and click "Restore project". Also ensure you use the Transaction Pooler (port 6543).';
    }
    return sendResponse(res, 200, {
      connected: false,
      configured: false,
      storageMode: "local",
      provider: "Local",
      message: `Failed to reach Supabase because ${reason}, so the app is running on local device storage until the connection is restored.${helpfulTip}`
    });
  }
}
export {
  handler as default
};
