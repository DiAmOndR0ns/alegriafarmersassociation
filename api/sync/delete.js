// src/api/db.ts
import pg from "pg";

// src/utils/audit.ts
function sha256(ascii) {
  function rightRotate(value, amount) {
    return value >>> amount | value << 32 - amount;
  }
  const lengthProperty = "length";
  let i, j;
  const words = [];
  const asciiLength = ascii[lengthProperty];
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
  const wordsLength = (asciiLength + 8 >> 6) + 1 << 4;
  for (i = 0; i < wordsLength; i++) {
    words[i] = 0;
  }
  for (i = 0; i < asciiLength; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << 24 - i % 4 * 8;
  }
  words[asciiLength >> 2] |= 128 << 24 - asciiLength % 4 * 8;
  words[wordsLength - 1] = asciiLength * 8;
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
function hashPassword(password) {
  return sha256(`bafa_secure_salt_v1:${password.trim()}`);
}

// src/initialData.ts
var DEFAULT_HASH = hashPassword("password123");

// src/api/db.ts
var PgPool = pg?.Pool || pg?.default?.Pool || pg?.default || pg;
var poolInstance = null;
var lastUsedConnectionString = null;
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
  if (!poolInstance || lastUsedConnectionString !== connectionString) {
    if (poolInstance) {
      poolInstance.end().catch(() => {
      });
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    poolInstance = new PgPool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 7e3,
      idleTimeoutMillis: 1e4,
      max: 6
    });
    poolInstance.on("error", (err) => {
      console.warn("[PostgreSQL Pool Client Error]:", err?.message || err);
    });
    lastUsedConnectionString = connectionString;
  }
  return poolInstance;
}
async function deleteEntityFromPostgres(pool, entity, ids) {
  const tableMap = {
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
  const normalized = (entity || "").toLowerCase().replace(/[-_]/g, "");
  const tableName = tableMap[entity] || tableMap[(entity || "").toLowerCase()] || tableMap[normalized];
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
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

// src/api/delete.ts
async function handler(req, res) {
  try {
    if (typeof res.setHeader === "function") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      if (typeof res.status === "function") return res.status(200).end();
      res.statusCode = 200;
      return res.end();
    }
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
