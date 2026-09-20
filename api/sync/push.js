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
var OFFICIAL_OFFICERS = [
  {
    id: "user-pres",
    username: "president",
    passwordHash: DEFAULT_HASH,
    name: "Zenaida A. Elbi\xF1a",
    role: "President",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-vp",
    username: "vp",
    passwordHash: DEFAULT_HASH,
    name: "Anselna B Arnado",
    role: "Vice_President",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-sec",
    username: "secretary",
    passwordHash: DEFAULT_HASH,
    name: "Jennylyn S Lumactao",
    role: "Secretary",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-tres",
    username: "treasurer",
    passwordHash: DEFAULT_HASH,
    name: "Gracelyn P Asendiente",
    role: "Treasurer",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-aud",
    username: "auditor",
    passwordHash: DEFAULT_HASH,
    name: "Lorena B Pinote",
    role: "Auditor",
    isApproved: true,
    joinedDate: "2024-01-01"
  },
  {
    id: "user-pio",
    username: "pio",
    passwordHash: DEFAULT_HASH,
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
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_status VARCHAR(50) DEFAULT 'Unaudited';`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audit_notes TEXT;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,
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
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (e) {
      console.warn("[Schema Migration Warning]:", e?.message || e);
    }
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
        farm_size NUMERIC,
        primary_crops TEXT[],
        contact_number VARCHAR(50),
        status VARCHAR(50),
        avatar_url TEXT,
        member_id_number VARCHAR(100),
        rsbsa_number VARCHAR(100),
        is_rsbsa_registered BOOLEAN DEFAULT FALSE
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(100) PRIMARY KEY,
        name TEXT NOT NULL,
        farm_location TEXT,
        farm_size NUMERIC,
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
      CREATE TABLE IF NOT EXISTS hog_raising (
        id VARCHAR(100) PRIMARY KEY,
        capital_grant NUMERIC,
        produces TEXT[],
        expenses JSONB,
        sales JSONB,
        groups JSONB,
        chore_logs JSONB,
        closed_years INT[]
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
    const counts = await client.query(`SELECT count(*) as count FROM users`);
    const usersCount = Number(counts.rows[0]?.count || 0);
    console.log("[DB DEBUG] Current users count:", usersCount);
    if (usersCount === 0) {
      console.log("[DB DEBUG] No users found. Provisioning the 6 official officer accounts...");
      for (const u of OFFICIAL_OFFICERS) {
        await client.query(`
          INSERT INTO users (id, username, password, name, role, is_approved, joined_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING;
        `, [
          u.id,
          u.username,
          u.password || "password123",
          u.name,
          u.role,
          true,
          u.joinedDate || "2024-01-01",
          "Active"
        ]);
      }
      console.log("[DB DEBUG] Officer accounts provisioned");
    }
    try {
      await client.query(`
        DELETE FROM products 
        WHERE name ILIKE '%baboy%' 
           OR name ILIKE '%hog%' 
           OR name ILIKE '%tilapia%' 
           OR ceb_name ILIKE '%baboy%' 
           OR ceb_name ILIKE '%hog%'
           OR category = 'Livestock'
      `);
    } catch {
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
    const deletedActivityIds = /* @__PURE__ */ new Set();
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
      if (Array.isArray(d.activities) && d.activities.length > 0) {
        d.activities.forEach((id) => deletedActivityIds.add(id));
        await client.query("DELETE FROM activities WHERE id = ANY($1)", [d.activities]);
        console.log("[DB DELETE] Batch deleted activities:", d.activities);
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
        funds: "organization_funds"
      };
      const normEntity = state.deleteItem.entity.toLowerCase().replace(/[-_]/g, "");
      const tbl = tableMap[state.deleteItem.entity] || tableMap[state.deleteItem.entity.toLowerCase()] || tableMap[normEntity];
      if (tbl) {
        await client.query(`DELETE FROM ${tbl} WHERE id = $1`, [state.deleteItem.id]);
        if (tbl === "users") deletedUserIds.add(state.deleteItem.id);
        if (tbl === "members") deletedMemberIds.add(state.deleteItem.id);
        if (tbl === "meetings") deletedMeetingIds.add(state.deleteItem.id);
        if (tbl === "resolutions") deletedResolutionIds.add(state.deleteItem.id);
        if (tbl === "financial_transactions") deletedTxIds.add(state.deleteItem.id);
        if (tbl === "announcements") deletedAnnouncementIds.add(state.deleteItem.id);
        if (tbl === "products") deletedProductIds.add(state.deleteItem.id);
        if (tbl === "activities") deletedActivityIds.add(state.deleteItem.id);
        if (tbl === "organization_funds") deletedFundIds.add(state.deleteItem.id);
        console.log(`[DB DELETE] Single deleted ${tbl} ID: ${state.deleteItem.id}`);
      }
    }
    if (state.users && Array.isArray(state.users)) {
      const activeUsers = state.users.filter((u) => !deletedUserIds.has(u.id));
      console.log("[DB DEBUG] Saving", activeUsers.length, "users...");
      for (const u of activeUsers) {
        await client.query(`
          INSERT INTO users (id, username, password, name, role, is_approved, joined_date, farm_location, farm_size, primary_crops, contact_number, status, avatar_url, member_id_number, rsbsa_number, is_rsbsa_registered)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            password = EXCLUDED.password,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            is_approved = EXCLUDED.is_approved,
            joined_date = EXCLUDED.joined_date,
            farm_location = EXCLUDED.farm_location,
            farm_size = EXCLUDED.farm_size,
            primary_crops = EXCLUDED.primary_crops,
            contact_number = EXCLUDED.contact_number,
            status = EXCLUDED.status,
            avatar_url = EXCLUDED.avatar_url,
            member_id_number = EXCLUDED.member_id_number,
            rsbsa_number = EXCLUDED.rsbsa_number,
            is_rsbsa_registered = EXCLUDED.is_rsbsa_registered;
        `, [
          u.id,
          u.username,
          u.password || "password123",
          u.name,
          u.role,
          u.isApproved,
          u.joinedDate || null,
          u.farmLocation || null,
          u.farmSize || null,
          u.primaryCrops || [],
          u.contactNumber || null,
          u.status || "Active",
          u.avatarUrl || null,
          u.memberIdNumber || null,
          u.rsbsaNumber || null,
          Boolean(u.isRsbsaRegistered)
        ]);
      }
      console.log("[DB DEBUG] Users saved");
    }
    if (state.members && Array.isArray(state.members)) {
      const activeMembers = state.members.filter((m) => !deletedMemberIds.has(m.id));
      console.log("[DB DEBUG] Saving", activeMembers.length, "members...");
      for (const m of activeMembers) {
        await client.query(`
          INSERT INTO members (id, name, farm_location, farm_size, primary_crops, contact_number, status, joined_date, member_id_number, rsbsa_number, is_rsbsa_registered, avatar_url, gender, birth_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            farm_location = EXCLUDED.farm_location,
            farm_size = EXCLUDED.farm_size,
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
          m.name,
          m.farmLocation || null,
          m.farmSize || null,
          m.primaryCrops || [],
          m.contactNumber || null,
          m.status || "Active",
          m.joinedDate || null,
          m.memberIdNumber || null,
          m.rsbsaNumber || null,
          Boolean(m.isRsbsaRegistered),
          m.avatarUrl || null,
          m.gender || null,
          m.birthDate || null
        ]);
      }
      console.log("[DB DEBUG] Members saved");
    }
    const rawTxList = state.financialTransactions || state.transactions;
    if (rawTxList && Array.isArray(rawTxList)) {
      const txList = rawTxList.filter((tx) => !deletedTxIds.has(tx.id));
      console.log("[DB DEBUG] Saving", txList.length, "transactions...");
      for (const tx of txList) {
        await client.query(`
          INSERT INTO financial_transactions (id, type, category, amount, date, description, recorded_by, fund_source, audited_status, audited_by, audited_date, audit_notes)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type,
            category = EXCLUDED.category,
            amount = EXCLUDED.amount,
            date = EXCLUDED.date,
            description = EXCLUDED.description,
            recorded_by = EXCLUDED.recorded_by,
            fund_source = EXCLUDED.fund_source,
            audited_status = EXCLUDED.audited_status,
            audited_by = EXCLUDED.audited_by,
            audited_date = EXCLUDED.audited_date,
            audit_notes = EXCLUDED.audit_notes;
        `, [
          tx.id,
          tx.type,
          tx.category,
          tx.amount,
          tx.date,
          tx.description,
          tx.recordedBy,
          tx.fundSource || null,
          tx.auditedStatus || "Unaudited",
          tx.auditedBy || null,
          tx.auditedDate || null,
          tx.auditNotes || null
        ]);
      }
      console.log("[DB DEBUG] Transactions saved");
    }
    if (state.meetings && Array.isArray(state.meetings)) {
      const activeMeetings = state.meetings.filter((mt) => !deletedMeetingIds.has(mt.id));
      console.log("[DB DEBUG] Saving", activeMeetings.length, "meetings...");
      for (const mt of activeMeetings) {
        await client.query(`
          INSERT INTO meetings (id, title, date, location, attendance_count, agenda, minutes, officer_in_charge, attendance_record)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            date = EXCLUDED.date,
            location = EXCLUDED.location,
            attendance_count = EXCLUDED.attendance_count,
            agenda = EXCLUDED.agenda,
            minutes = EXCLUDED.minutes,
            officer_in_charge = EXCLUDED.officer_in_charge,
            attendance_record = EXCLUDED.attendance_record;
        `, [
          mt.id,
          mt.title,
          mt.date,
          mt.location,
          mt.attendanceCount || 0,
          mt.agenda || "",
          mt.minutes || "",
          mt.officerInCharge || "",
          JSON.stringify(mt.attendanceRecord || {})
        ]);
      }
      console.log("[DB DEBUG] Meetings saved");
    }
    if (state.hogRaising) {
      console.log("[DB DEBUG] Saving hog raising state...");
      const grantAmount = typeof state.hogRaising.capitalGrant === "number" ? state.hogRaising.capitalGrant : Number(state.hogRaising.capitalGrant) || 0;
      await client.query(`
        INSERT INTO hog_raising (id, capital_grant, produces, expenses, sales, groups, chore_logs, closed_years)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          capital_grant = EXCLUDED.capital_grant,
          produces = EXCLUDED.produces,
          expenses = EXCLUDED.expenses,
          sales = EXCLUDED.sales,
          groups = EXCLUDED.groups,
          chore_logs = EXCLUDED.chore_logs,
          closed_years = EXCLUDED.closed_years;
      `, [
        "main_state",
        grantAmount,
        state.hogRaising.produces || ["Hog Raising"],
        JSON.stringify(state.hogRaising.expenses || []),
        JSON.stringify(state.hogRaising.sales || []),
        JSON.stringify(state.hogRaising.groups || []),
        JSON.stringify(state.hogRaising.choreLogs || []),
        state.hogRaising.closedYears || []
      ]);
      await client.query("DELETE FROM hog_raising WHERE id != 'main_state'");
      console.log("[DB DEBUG] Hog raising state saved");
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
          lg.timestamp,
          lg.user || lg.userName || "Officer",
          lg.role,
          lg.action,
          lg.details,
          lg.syncStatus || "synced",
          lg.hash || null,
          lg.previousHash || null
        ]);
      }
      console.log("[DB DEBUG] System logs saved");
    }
    if (state.products && Array.isArray(state.products)) {
      const activeProducts = state.products.filter((p) => !deletedProductIds.has(p.id));
      console.log("[DB DEBUG] Saving", activeProducts.length, "products...");
      for (const p of activeProducts) {
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
          p.name,
          p.cebName || null,
          p.category,
          p.description,
          p.unit,
          p.price,
          p.quantityAvailable || null,
          p.stockStatus,
          p.farmerName || null,
          p.farmerSitio || null,
          p.farmerPhone || null,
          p.contactPerson || null,
          p.imageUrl || null,
          p.isPublished ?? true,
          p.updatedBy || null,
          p.managedBy || null,
          p.dateUpdated || null
        ]);
      }
      console.log("[DB DEBUG] Products saved");
    }
    if (state.resolutions && Array.isArray(state.resolutions)) {
      const activeResolutions = state.resolutions.filter((r) => !deletedResolutionIds.has(r.id));
      console.log("[DB DEBUG] Saving", activeResolutions.length, "resolutions...");
      for (const r of activeResolutions) {
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
          r.resolutionNumber,
          r.title,
          r.description,
          r.dateAgreed,
          r.movedBy,
          r.secondedBy,
          r.voteInFavor,
          r.voteAgainst,
          r.voteAbstain,
          r.status
        ]);
      }
      console.log("[DB DEBUG] Resolutions saved");
    }
    if (state.announcements && Array.isArray(state.announcements)) {
      const activeAnnouncements = state.announcements.filter((a) => !deletedAnnouncementIds.has(a.id));
      console.log("[DB DEBUG] Saving", activeAnnouncements.length, "announcements...");
      for (const a of activeAnnouncements) {
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
        `, [a.id, a.title, a.category, a.content, a.datePosted, a.priority, a.postedBy]);
      }
      console.log("[DB DEBUG] Announcements saved");
    }
    if (state.activities && Array.isArray(state.activities)) {
      const activeActivities = state.activities.filter((act) => !deletedActivityIds.has(act.id));
      console.log("[DB DEBUG] Saving", activeActivities.length, "activities...");
      for (const act of activeActivities) {
        await client.query(`
          INSERT INTO activities (id, title, ceb_title, category, scheduled_date, date_scheduled, scheduled_time, time_scheduled, location, description, organizer, status, documented_notes, attendees_count, target_audience, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            documented_notes = EXCLUDED.documented_notes,
            attendees_count = EXCLUDED.attendees_count,
            target_audience = EXCLUDED.target_audience,
            image_url = EXCLUDED.image_url;
        `, [
          act.id,
          act.title,
          act.cebTitle || null,
          act.category,
          act.scheduledDate || act.dateScheduled || null,
          act.dateScheduled || act.scheduledDate || null,
          act.scheduledTime || act.timeScheduled || null,
          act.timeScheduled || act.scheduledTime || null,
          act.location,
          act.description,
          act.organizer,
          act.status,
          act.documentedNotes || null,
          act.attendeesCount || 0,
          act.targetAudience || null,
          act.imageUrl || null
        ]);
      }
      console.log("[DB DEBUG] Activities saved");
    }
    const rawFundList = state.organizationFunds || state.funds;
    if (rawFundList && Array.isArray(rawFundList)) {
      const fundList = rawFundList.filter((f) => !deletedFundIds.has(f.id));
      console.log("[DB DEBUG] Saving", fundList.length, "organization funds...");
      for (const f of fundList) {
        await client.query(`
          INSERT INTO organization_funds (id, name, code, allocated_amount, current_balance, description, custodian, last_updated)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            code = EXCLUDED.code,
            allocated_amount = EXCLUDED.allocated_amount,
            current_balance = EXCLUDED.current_balance,
            description = EXCLUDED.description,
            custodian = EXCLUDED.custodian,
            last_updated = EXCLUDED.last_updated;
        `, [
          f.id,
          f.name,
          f.code,
          f.allocatedAmount || 0,
          f.currentBalance || 0,
          f.description || "",
          f.custodian || "",
          f.lastUpdated || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
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
          ar.reportPeriod,
          ar.reportType,
          ar.totalIncome || 0,
          ar.totalExpenses || 0,
          ar.netSurplus || 0,
          ar.findings || "",
          ar.recommendations || "",
          ar.preparedBy,
          ar.certifiedBy || null,
          ar.status || "Submitted",
          ar.dateSubmitted,
          ar.dateCertified || null
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
          dr.requestedBy,
          dr.reason,
          dr.requestedDate,
          dr.effectiveStart || null,
          dr.effectiveEnd || null,
          dr.status || "Pending",
          dr.reviewedBy || null,
          dr.reviewedDate || null,
          dr.remarks || null
        ]);
      }
      console.log("[DB DEBUG] Delegation requests saved");
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

// src/api/push.ts
async function handler(req, res) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      if (typeof res.status === "function") return res.status(200).end();
      res.statusCode = 200;
      return res.end();
    }
    if (!isDatabaseConfigured()) {
      return sendResponse(res, 200, {
        success: true,
        offlineMode: true,
        message: "Saved to local offline storage (DATABASE_URL not configured)."
      });
    }
    const pool = getPool();
    const body = await parseRequestBody(req);
    const savePromise = saveFullStateToPostgres(pool, body);
    const timeoutPromise = new Promise(
      (_, reject) => setTimeout(() => reject(new Error("Cloud DB push timed out after 30 seconds.")), 3e4)
    );
    const result = await Promise.race([savePromise, timeoutPromise]);
    console.log("[PUSH DEBUG] Save result:", result);
    return sendResponse(res, 200, {
      success: true,
      offlineMode: false,
      message: "State successfully synced to PostgreSQL Cloud DB!"
    });
  } catch (error) {
    console.error("[PUSH DEBUG] Full error:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      hint: error?.hint,
      where: error?.where,
      stack: error?.stack?.substring(0, 2e3)
    });
    return sendResponse(res, 200, {
      success: false,
      offlineMode: true,
      message: `Failed to sync: ${error?.message || "Database unavailable"}`,
      error: error?.message,
      detail: error?.detail,
      hint: error?.hint,
      where: error?.where
    });
  }
}
export {
  handler as default
};
