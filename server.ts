import express from "express";
import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
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
import publicSummaryHandler from "./src/api/publicSummary";
import deleteHandler from "./src/api/delete";
import {
  bootstrapHandler,
  getAuthenticatedUser,
  isMemberRole,
  loginHandler,
  logoutHandler,
  mfaConfirmHandler,
  mfaEnrollHandler,
  mfaResetHandler,
  passwordChangeHandler,
  passwordResetHandler,
  passwordResetRequestHandler,
  requireAuthenticated,
  sessionHandler,
} from "./src/api/auth";

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

export async function createApp() {
  const app = express();

  app.disable('x-powered-by');

  // Baseline response headers. The SPA has no inline scripts of its own, and the
  // Guest portal loads images from arbitrary URLs, so img-src stays open while
  // scripts and frames remain self-only.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    const isProd = process.env.NODE_ENV === 'production';
    const scriptSrc = isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const connectSrc = isProd ? "connect-src 'self'" : "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
        `img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; ${connectSrc}; ` +
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/mfa/enroll", mfaEnrollHandler);
  app.post("/api/auth/mfa/confirm", mfaConfirmHandler);
  app.post("/api/auth/mfa/reset", mfaResetHandler);
  app.get("/api/auth/session", sessionHandler);
  app.post("/api/auth/logout", logoutHandler);
  app.post("/api/auth/bootstrap", bootstrapHandler);
  app.post("/api/auth/password/change", passwordChangeHandler);
  app.post("/api/auth/password/reset", passwordResetHandler);
  app.post("/api/auth/password/request", passwordResetRequestHandler);

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
      const actor = await getAuthenticatedUser(req).catch(() => null);
      const showDetailedStats = Boolean(actor && !isMemberRole(actor.role));
      const queryPromise = pool.query('SELECT NOW() as current_time, current_database() as db_name');
      const statsPromise = showDetailedStats ? getTableStats(pool) : Promise.resolve(null);
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
        timestamp: result.rows[0]?.current_time,
        ...(showDetailedStats && stats ? {
          database: result.rows[0]?.db_name || 'postgres',
          tableCounts: stats.tableCounts,
          totalRecords: stats.totalRecords,
          message: `Connected to ${provider} (${result.rows[0]?.db_name || 'postgres'}) — ${stats.totalRecords} records across ${Object.keys(stats.tableCounts).length} tables`,
        } : {
          message: `Connected to ${provider}`,
        }),
      });
    } catch (err: any) {
      // Public health check: log the driver error, never return it to the caller.
      const errMsg = String(err?.message || '');
      console.error('[DB Status] Connection failure:', errMsg);
      let reason = 'the server could not open a connection';
      let helpfulTip = '';
      if (errMsg.includes('password authentication failed')) {
        reason = 'the database rejected the stored credentials';
        helpfulTip = ' Password incorrect. Reset your database password in Supabase > Project Settings > Database, update DATABASE_URL in Vercel, and Redeploy.';
      } else if (errMsg.includes('timed out') || errMsg.includes('ETIMEDOUT')) {
        reason = 'the connection timed out';
        helpfulTip = ' If your Supabase project was paused due to inactivity, open your Supabase dashboard and click "Restore project". Also ensure you use the Transaction Pooler (port 6543).';
      }

      return res.json({
        connected: false,
        configured: true,
        storageMode: 'local',
        provider: 'Local',
        message: `Failed to reach Supabase because ${reason}, so the app is running on local device storage until the connection is restored.${helpfulTip}`,
      });
    }
  });

  app.get("/api/sync/pull", pullHandler);
  app.get("/api/achievements", achievementsHandler);
  // Public aggregate/officer summary for the guest portal (no authentication).
  app.get("/api/public/summary", publicSummaryHandler);
  app.post("/api/sync/push", pushHandler);
  app.post(["/api/db/delete", "/api/sync/delete"], deleteHandler);
  app.delete("/api/db/:entity/:id", deleteHandler);

  // Any error express/middleware passes to next() must not leak a stack trace.
  app.use((err: any, req: any, res: any, next: any) => {
    if (res.headersSent) return next(err);
    const status = Number(err?.status || err?.statusCode) || 500;
    if (status >= 500) console.error('[Unhandled request error]', err?.message || err);
    res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      message: status === 413 ? 'Request body exceeds the allowed limit.' : 'The request could not be completed.'
    });
  });


  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    let cachedLocalOfficers: any[] | null = null;
    app.get("/api/dev/local-officers", async (_req, res) => {
      if (isDatabaseConfigured()) {
        return res.json({ success: false, officers: [] });
      }
      if (!cachedLocalOfficers) {
        const specs = [
          { key: 'PRESIDENT', role: 'President' },
          { key: 'VICE_PRESIDENT', role: 'Vice_President' },
          { key: 'SECRETARY', role: 'Secretary' },
          { key: 'ASSISTANT_SECRETARY', role: 'Assistant_Secretary' },
          { key: 'TREASURER', role: 'Treasurer' },
          { key: 'ASSISTANT_TREASURER', role: 'Assistant_Treasurer' },
          { key: 'AUDITOR', role: 'Auditor' },
          { key: 'PIO', role: 'PIO' },
          { key: 'BOARD_MEMBER', role: 'Board_Member' }
        ] as const;

        const nowIso = new Date().toISOString();
        const seeded: any[] = [];
        for (const spec of specs) {
          const username = (process.env[`LOCAL_OFFICER_${spec.key}_USER`] || '').trim().toLowerCase();
          const name = (process.env[`LOCAL_OFFICER_${spec.key}_NAME`] || '').trim();
          const password = (process.env[`LOCAL_OFFICER_${spec.key}_PASS`] || '').trim();
          const totpSecret = (process.env[`LOCAL_OFFICER_${spec.key}_TOTP`] || '').trim();
          if (!username || !password) continue;
          const passwordHash = await bcrypt.hash(password, 10);
          seeded.push({
            id: `local-officer-${spec.key.toLowerCase()}`,
            username,
            name: name || `AFA ${spec.role.replace('_', ' ')}`,
            role: spec.role,
            isApproved: true,
            passwordHash,
            passwordChangedAt: nowIso,
            passwordHistory: [],
            mustChangePassword: false,
            joinedDate: '2026-01-01',
            farmLocation: 'Sitio Tapon',
            ...(spec.role === 'President' && totpSecret ? { mfaEnabled: true, totpSecret } : { mfaEnabled: false })
          });
        }
        cachedLocalOfficers = seeded;
      }
      return res.json({ success: true, officers: cachedLocalOfficers });
    });

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
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      console.warn('[Security] SESSION_SECRET is missing or shorter than 32 characters; set a strong value in .env.local.');
    }
    if (process.env.NODE_ENV !== 'production' && !process.env.APP_ORIGIN) {
      console.warn('[Security] APP_ORIGIN is not set; cross-origin checks fall back to the Host header.');
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start BAFA server:", err);
});
