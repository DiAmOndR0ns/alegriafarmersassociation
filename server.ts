import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { 
  getPool, 
  isDatabaseConfigured, 
  ensureDatabaseSchema,
  getTableStats
} from "./src/api/db";
import pullHandler from "./src/api/pull";
import pushHandler from "./src/api/push";
import deleteHandler from "./src/api/delete";
import {
  bootstrapHandler,
  loginHandler,
  logoutHandler,
  mfaConfirmHandler,
  passwordChangeHandler,
  passwordResetHandler,
  requireAuthenticated,
  sessionHandler,
} from "./src/api/auth";

dotenv.config();

export async function createApp() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));

  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/mfa/confirm", mfaConfirmHandler);
  app.get("/api/auth/session", sessionHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.post("/api/auth/bootstrap", bootstrapHandler);
  app.post("/api/auth/password/change", passwordChangeHandler);
  app.post("/api/auth/password/reset", passwordResetHandler);

  // API to Check Live Cloud Database (Supabase / PostgreSQL) Status
  app.get("/api/db/status", async (req, res) => {
    const user = await requireAuthenticated(req, res);
    if (!user) return;
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
        message: `Connected to ${provider} (${result.rows[0]?.db_name || 'postgres'}) — ${stats.totalRecords} records across ${Object.keys(stats.tableCounts).length} tables`,
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

  app.get("/api/sync/pull", pullHandler);
  app.post("/api/sync/push", pushHandler);
  app.post(["/api/db/delete", "/api/sync/delete"], deleteHandler);
  app.delete("/api/db/:entity/:id", deleteHandler);


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

  return app;
}

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const app = await createApp();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BAFA Express server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start BAFA server:", err);
});
