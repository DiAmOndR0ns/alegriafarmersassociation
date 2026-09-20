process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { 
  getPool, 
  isDatabaseConfigured, 
  fetchAllDataFromPostgres, 
  saveFullStateToPostgres,
  deleteEntityFromPostgres,
  ensureDatabaseSchema,
  purgeAllDummyData,
  getTableStats,
  updateDatabaseCapitalGrant
} from "./src/api/db";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '15mb' }));

  // API to Check Live Cloud Database (Supabase / PostgreSQL) Status
  app.get("/api/db/status", async (req, res) => {
    const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');

    if (!rawUrl) {
      return res.json({
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'DATABASE_URL is missing from environment. Please check your environment variables and restart/redeploy.',
      });
    }

    if (rawUrl.includes('[YOUR-PASSWORD]') || rawUrl.includes('<password>') || rawUrl.includes('YOUR_PASSWORD')) {
      return res.json({
        connected: false,
        configured: false,
        provider: 'Supabase',
        message: 'DATABASE_URL still contains placeholder "[YOUR-PASSWORD]". Replace it with your real password.',
      });
    }

    if (/:\[[^\]]+\]@/.test(rawUrl)) {
      return res.json({
        connected: false,
        configured: false,
        provider: 'Supabase',
        message: 'DATABASE_URL has square brackets around the password like :[password]@. Remove the square brackets [ and ].',
      });
    }

    if (!rawUrl.startsWith('postgres://') && !rawUrl.startsWith('postgresql://')) {
      return res.json({
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'DATABASE_URL must start with "postgresql://" or "postgres://".',
      });
    }

    const isSupabase = rawUrl.toLowerCase().includes('supabase');
    const isDirectPort = rawUrl.includes(':5432') && rawUrl.includes('db.');
    const provider = isSupabase ? 'Supabase' : 'PostgreSQL';

    try {
      const pool = getPool();
      await ensureDatabaseSchema(pool);
      const queryPromise = pool.query('SELECT NOW() as current_time, current_database() as db_name');
      const statsPromise = getTableStats(pool);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error(
            isDirectPort
              ? 'Connection timed out after 4 seconds. You are using the Direct URI (db.xxxx.supabase.co:5432) which requires IPv6. Vercel serverless functions require the Connection Pooler URI (aws-0-*.pooler.supabase.com:6543) over IPv4.'
              : 'Connection timed out after 4 seconds. Check if your Supabase project is active (not paused) or if your database password is correct.'
          ));
        }, 4000)
      );

      const [result, stats] = await Promise.all([
        Promise.race([queryPromise, timeoutPromise]) as any,
        statsPromise
      ]);

      return res.json({
        connected: true,
        configured: true,
        provider,
        database: result.rows[0]?.db_name || 'postgres',
        timestamp: result.rows[0]?.current_time,
        tableCounts: stats.tableCounts,
        totalRecords: stats.totalRecords,
        message: `Connected to ${provider} (${result.rows[0]?.db_name || 'postgres'}) — ${stats.totalRecords} records across 11 tables`,
      });
    } catch (err: any) {
      const errMsg = err?.message || 'Connection failed';
      let helpfulTip = '';
      if (errMsg.includes('password authentication failed')) {
        helpfulTip = ' Password incorrect. Reset your database password in Supabase > Project Settings > Database, update DATABASE_URL in Vercel, and Redeploy.';
      } else if (errMsg.includes('timed out') || errMsg.includes('ETIMEDOUT')) {
        helpfulTip = ' If your Supabase project was paused due to inactivity, open your Supabase dashboard and click "Restore project". Also ensure you use the Transaction Pooler (port 6543).';
      }

      return res.json({
        connected: false,
        configured: true,
        provider,
        error: errMsg,
        message: `Failed to connect to ${provider}: ${errMsg}.${helpfulTip}`,
      });
    }
  });

  // Dedicated API to Purge All Seed and Dummy Data from Supabase
  app.post("/api/db/purge", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(400).json({
        success: false,
        message: "DATABASE_URL is not configured.",
      });
    }

    try {
      const pool = getPool();
      const purgeRes = await purgeAllDummyData(pool);
      const stats = await getTableStats(pool);
      return res.json({
        success: true,
        message: purgeRes.message,
        tableCounts: stats.tableCounts,
        totalRecords: stats.totalRecords,
      });
    } catch (err: any) {
      console.error("[Cloud DB Purge Error]:", err);
      return res.status(500).json({
        success: false,
        message: `Failed to purge dummy data: ${err?.message || err}`,
      });
    }
  });

  // Dedicated API to Get and Update Capital Grant directly in Cloud DB
  app.get("/api/db/capital-grant", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({ success: false, offlineMode: true, capitalGrant: 0 });
    }
    try {
      const pool = getPool();
      const queryRes = await pool.query("SELECT capital_grant FROM hog_raising WHERE id IN ('main_state', 'hog_raising_main') ORDER BY (id = 'main_state') DESC LIMIT 1");
      const capitalGrant = Number(queryRes.rows[0]?.capital_grant || 0);
      return res.json({ success: true, capitalGrant });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || err });
    }
  });

  app.post("/api/db/capital-grant", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({ success: false, offlineMode: true, message: "Database not configured" });
    }
    try {
      const { amount } = req.body;
      const numAmount = typeof amount === 'number' ? amount : (parseFloat(amount) || 0);
      const pool = getPool();
      const updatedAmount = await updateDatabaseCapitalGrant(pool, numAmount);
      return res.json({ success: true, capitalGrant: updatedAmount });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || err });
    }
  });

  // API to Pull Full Data from Cloud Database (PostgreSQL / Supabase)
  app.get("/api/sync/pull", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        success: false,
        offlineMode: true,
        message: "DATABASE_URL is not configured. Running in offline/local storage mode.",
      });
    }

    try {
      const pool = getPool();
      const pullPromise = fetchAllDataFromPostgres(pool);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cloud DB query timed out after 12 seconds.')), 12000)
      );
      const data = await Promise.race([pullPromise, timeoutPromise]);
      return res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.warn("[Cloud DB Pull Warning]:", error?.message || error);
      return res.status(200).json({
        success: false,
        offlineMode: true,
        message: `Offline fallback: ${error.message}`,
      });
    }
  });

  // API to Push Full State / Sync Updates to Cloud Database (PostgreSQL / Supabase)
  app.post("/api/sync/push", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        success: false,
        offlineMode: true,
        message: "DATABASE_URL is not configured. Saved in local offline browser storage.",
      });
    }

    try {
      const pool = getPool();
      const savePromise = saveFullStateToPostgres(pool, req.body);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Cloud DB push timed out after 30 seconds.')), 30000)
      );
      await Promise.race([savePromise, timeoutPromise]);
      return res.json({
        success: true,
        offlineMode: false,
        message: "State successfully synced to PostgreSQL Cloud DB!",
      });
    } catch (error: any) {
      console.warn("[Cloud DB Push Warning]:", error?.message || error);
      return res.status(200).json({
        success: false,
        offlineMode: true,
        message: `Saved locally. Cloud sync pending reconnection: ${error?.message || 'Database unavailable'}`,
      });
    }
  });

  // API to Directly Delete One or Multiple Items from PostgreSQL Cloud DB
  app.post(["/api/db/delete", "/api/sync/delete"], async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        success: false,
        offlineMode: true,
        message: "DATABASE_URL is not configured. Stored in local offline deletion queue.",
      });
    }

    try {
      const pool = getPool();
      const body = req.body || {};
      let totalDeleted = 0;

      // Handle batch deletedIds object e.g. { deletedIds: { members: ['id1'], products: ['id2'] } }
      if (body.deletedIds && typeof body.deletedIds === 'object') {
        for (const [entityKey, ids] of Object.entries(body.deletedIds)) {
          if (Array.isArray(ids) && ids.length > 0) {
            try {
              const result = await deleteEntityFromPostgres(pool, entityKey, ids);
              totalDeleted += result.deletedCount;
            } catch (delErr: any) {
              console.warn(`[Delete Batch Warning for ${entityKey}]:`, delErr?.message);
            }
          }
        }
        return res.json({
          success: true,
          deletedCount: totalDeleted,
          message: `Successfully deleted ${totalDeleted} record(s) from database.`,
        });
      }

      // Handle single or multiple entity deletion e.g. { entity: 'member', id: 'm-1' } or { entity: 'product', ids: ['p-1', 'p-2'] }
      const entity = body.entity;
      const ids = body.ids || (body.id ? [body.id] : []);

      if (!entity || !ids || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Missing 'entity' or 'id'/'ids' parameter in request body.",
        });
      }

      const result = await deleteEntityFromPostgres(pool, entity, ids);
      return res.json({
        success: true,
        deletedCount: result.deletedCount,
        table: result.table,
        message: `Successfully deleted ${result.deletedCount} record(s) from database table "${result.table}".`,
      });
    } catch (error: any) {
      console.error("[Cloud DB Delete Error]:", error?.message || error);
      return res.status(500).json({
        success: false,
        message: `Failed to delete from database: ${error?.message || 'Internal server error'}`,
      });
    }
  });

  // RESTful DELETE API endpoint: /api/db/:entity/:id
  app.delete("/api/db/:entity/:id", async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        success: false,
        offlineMode: true,
        message: "DATABASE_URL is not configured. Queued locally.",
      });
    }

    try {
      const pool = getPool();
      const { entity, id } = req.params;
      const result = await deleteEntityFromPostgres(pool, entity, id);
      return res.json({
        success: true,
        deletedCount: result.deletedCount,
        table: result.table,
        message: `Successfully deleted ${result.deletedCount} record(s) from database table "${result.table}".`,
      });
    } catch (error: any) {
      console.error(`[Cloud DB DELETE ${req.params.entity}/${req.params.id} Error]:`, error?.message || error);
      return res.status(500).json({
        success: false,
        message: error?.message || "Failed to delete item from database.",
      });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BAFA Express server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start BAFA server:", err);
});
