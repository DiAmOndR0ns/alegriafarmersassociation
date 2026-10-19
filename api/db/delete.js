// src/api/db.ts
import pg from "pg";

// src/utils/passwordPolicy.ts
import bcrypt from "bcryptjs";
var BCRYPT_COST = 12;
function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_COST);
}
var LOCKOUT_DURATION_MS = 15 * 60 * 1e3;

// src/initialData.ts
var OFFICIAL_OFFICERS = [
  {
    id: "user-pres",
    username: "president",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Zenaida A. Elbi\xF1a",
    role: "President",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-vp",
    username: "vp",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Anselna B Arnado",
    role: "Vice_President",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-sec",
    username: "secretary",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Jennylyn S Lumactao",
    role: "Secretary",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-tres",
    username: "treasurer",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Gracelyn P Asendiente",
    role: "Treasurer",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-aud",
    username: "auditor",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Lorena B Pinote",
    role: "Auditor",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-pio",
    username: "pio",
    passwordHash: hashPassword("password123"),
    mustChangePassword: true,
    passwordChangedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    name: "Ida S Manera",
    role: "PIO",
    isApproved: true,
    joinedDate: "2024-01-01"
  }
];

// src/api/db.ts
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
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

// src/api/delete.ts
async function handler(req, res) {
  try {
    if (!isDatabaseConfigured()) {
      return sendResponse(res, 200, {
        success: false,
        offlineMode: true,
        message: "DATABASE_URL is not configured. Stored in local offline deletion queue."
      });
    }
    const pool = getPool();
    const body = await parseRequestBody(req);
    if (body.deletedIds && typeof body.deletedIds === "object") {
      let totalDeleted = 0;
      for (const [entityKey, ids2] of Object.entries(body.deletedIds)) {
        if (Array.isArray(ids2) && ids2.length > 0) {
          try {
            const result2 = await deleteEntityFromPostgres(pool, entityKey, ids2);
            totalDeleted += result2.deletedCount;
          } catch (delErr) {
            console.warn(`[Delete Batch Warning for ${entityKey}]:`, delErr?.message);
          }
        }
      }
      return sendResponse(res, 200, {
        success: true,
        deletedCount: totalDeleted,
        message: `Successfully deleted ${totalDeleted} record(s) from database.`
      });
    }
    let queryEntity = null;
    let queryId = null;
    try {
      const urlObj = new URL(req.url || "", "http://localhost");
      queryEntity = urlObj.searchParams.get("entity");
      queryId = urlObj.searchParams.get("id");
    } catch {
    }
    const entity = body.entity || queryEntity;
    const ids = body.ids || (body.id ? [body.id] : queryId ? [queryId] : []);
    if (!entity || !ids || ids.length === 0) {
      return sendResponse(res, 400, {
        success: false,
        message: "Missing 'entity' or 'id'/'ids' parameter in request."
      });
    }
    const result = await deleteEntityFromPostgres(pool, entity, ids);
    return sendResponse(res, 200, {
      success: true,
      deletedCount: result.deletedCount,
      table: result.table,
      message: `Successfully deleted ${result.deletedCount} record(s) from database table "${result.table}".`
    });
  } catch (error) {
    console.error("[Cloud DB Delete API Error]:", error?.message || error);
    return sendResponse(res, 500, {
      success: false,
      message: `Failed to delete from database: ${error?.message || "Internal server error"}`
    });
  }
}
export {
  handler as default
};
