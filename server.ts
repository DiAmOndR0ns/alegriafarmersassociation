import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { 
  getPool, 
  isDatabaseConfigured, 
  isLoopbackDatabaseUrl,
  ensureDatabaseSchema,
  getTableStats
} from "./src/api/db";
import pullHandler from "./src/api/pull";
import pushHandler from "./src/api/push";
import achievementsHandler from "./src/api/achievements";
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

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
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

  // API to Check Live Cloud Database (Supabase) Status (Public Health Check)
  // `provider` tells the UI which storage mode is active: 'Supabase' (cloud sync)
  // or 'Local' (device-only offline-first mode, used whenever Supabase is unreachable).
  app.get("/api/db/status", async (req, res) => {
    const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const provider = 'Supabase';
    const localStorageStatus = (message: string) => ({
      connected: false,
      configured: false,
      storageMode: 'local' as const,
      provider: 'Local',
      message,
    });

    if (!rawUrl) {
      return res.json(localStorageStatus(
        'DATABASE_URL is missing from environment. Running on local device storage; add the Supabase connection string and restart/redeploy to enable cloud sync.'
      ));
    }

    if (isLoopbackDatabaseUrl(rawUrl)) {
      return res.json(localStorageStatus(
        'DATABASE_URL points at a local database. Remove it and use the hosted Supabase connection string (Project Settings > Database) to enable cloud sync.'
      ));
    }

    if (rawUrl.includes('[YOUR-PASSWORD]') || rawUrl.includes('<password>') || rawUrl.includes('YOUR_PASSWORD')) {
      return res.json(localStorageStatus(
        'DATABASE_URL still contains placeholder "[YOUR-PASSWORD]". Replace it with your real Supabase password.'
      ));
    }

    if (/:\[[^\]]+\]@/.test(rawUrl)) {
      return res.json(localStorageStatus(
        'DATABASE_URL has square brackets around the password like :[password]@. Remove the square brackets [ and ].'
      ));
    }

    if (!rawUrl.startsWith('postgres://') && !rawUrl.startsWith('postgresql://')) {
      return res.json(localStorageStatus(
        'DATABASE_URL must start with "postgresql://" or "postgres://".'
      ));
    }

    const isDirectPort = rawUrl.includes(':5432') && rawUrl.includes('db.');

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
        storageMode: 'supabase',
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
        storageMode: 'local',
        provider: 'Local',
        error: errMsg,
        message: `Failed to reach Supabase, so the app is running on local device storage until the connection is restored: ${errMsg}.${helpfulTip}`,
      });
    }
  });

  app.get("/api/sync/pull", pullHandler);
  app.get("/api/achievements", achievementsHandler);
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
