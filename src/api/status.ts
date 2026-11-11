import pg from 'pg';
import { sendResponse } from './helper';
import { cleanDatabaseUrl, isLoopbackDatabaseUrl } from './db';
// Public health check endpoint

// Bulletproof Pool resolution across CJS, ESM, and bundled Vercel serverless environments
const PgPool = (pg as any)?.Pool || (pg as any)?.default?.Pool || (pg as any)?.default || pg;

let poolInstance: any = null;
let lastUsedConnectionString: string | null = null;

function getStatusPool(): pg.Pool {
  const rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl) throw new Error('DATABASE_URL is not set for the hosted Supabase project');
  if (isLoopbackDatabaseUrl(rawDbUrl)) {
    throw new Error('DATABASE_URL points at a local database; the hosted Supabase connection string is required');
  }
  const { connectionString } = cleanDatabaseUrl(rawDbUrl);
  if (!poolInstance || lastUsedConnectionString !== connectionString) {
    if (poolInstance) {
      poolInstance.end().catch(() => {});
    }
    // TLS is always on for the hosted Supabase database.
    poolInstance = new PgPool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      max: 5,
    });
    lastUsedConnectionString = connectionString;
  }
  if (!poolInstance) {
    throw new Error('Failed to initialize PostgreSQL pool');
  }
  return poolInstance;
}

const APP_TABLES = [
  'users',
  'members',
  'meetings',
  'resolutions',
  'financial_transactions',
  'announcements',
  'system_logs',
  'afa_igp',
  'afa_igp_expenses',
  'products',
  'activities',
  'organization_funds',
  'auditor_reports',
  'delegation_requests'
];

async function getLiveTableStats(pool: pg.Pool) {
  const client = await pool.connect();
  const tableCounts: Record<string, number> = {};
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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') return sendResponse(res, 405, { error: 'Method not allowed' });
    // Public health check


    const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');

    // No hosted database configured: the app is running on local device storage (offline-first PWA).
    if (!rawUrl) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: 'local',
        provider: 'Local',
        message: 'DATABASE_URL is not set. Running on local device storage; add the Supabase connection string to sync.',
      });
    }

    if (isLoopbackDatabaseUrl(rawUrl)) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: 'local',
        provider: 'Local',
        message: 'DATABASE_URL points at a local database (localhost). Remove it and use the hosted Supabase connection string (Project Settings > Database) to enable cloud sync.',
      });
    }

    if (rawUrl.includes('[YOUR-PASSWORD]') || rawUrl.includes('<password>') || rawUrl.includes('YOUR_PASSWORD')) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: 'local',
        provider: 'Local',
        message: 'DATABASE_URL still contains the placeholder "[YOUR-PASSWORD]". Replace it with your actual Supabase database password in Vercel Settings and redeploy.',
      });
    }

    if (/:\[[^\]]+\]@/.test(rawUrl)) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: 'local',
        provider: 'Local',
        message: 'DATABASE_URL has square brackets around your password like :[password]@. Remove the brackets [ and ] from the password.',
      });
    }

    if (!rawUrl.startsWith('postgres://') && !rawUrl.startsWith('postgresql://')) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        storageMode: 'local',
        provider: 'Local',
        message: 'DATABASE_URL must start with "postgresql://" or "postgres://". Please copy the URI from Supabase Project Settings > Database.',
      });
    }

    const isDirectPort = rawUrl.includes(':5432') && rawUrl.includes('db.');
    // Only a successful connection reports Supabase; every failure below reports Local.
    const provider = 'Supabase';

    const pool = getStatusPool();
    const queryPromise = pool.query('SELECT NOW() as current_time, current_database() as db_name');
    const statsPromise = getLiveTableStats(pool);
    const presPromise = pool.query("SELECT 1 FROM users WHERE lower(replace(role, ' ', '_')) = 'president' LIMIT 1").catch(() => ({ rowCount: 0 }));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        reject(new Error(
          isDirectPort
            ? 'Connection timed out after 4 seconds. You are using the Direct URI (db.xxxx.supabase.co:5432) which requires IPv6. Vercel serverless functions require the Connection Pooler URI (aws-0-*.pooler.supabase.com:6543) over IPv4.'
            : 'Connection timed out after 4 seconds. Check if your Supabase project is active (not paused) or if your database password is correct.'
        ));
      }, 4000)
    );

    const [result, stats, presRes] = await Promise.all([
      Promise.race([queryPromise, timeoutPromise]) as any,
      statsPromise,
      presPromise as any
    ]);

    return sendResponse(res, 200, {
      connected: true,
      configured: true,
      storageMode: 'supabase',
      provider,
      database: result.rows[0]?.db_name || 'postgres',
      timestamp: result.rows[0]?.current_time,
      tableCounts: stats.tableCounts,
      totalRecords: stats.totalRecords,
      hasPresident: Boolean(presRes?.rowCount && presRes.rowCount > 0),
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

    return sendResponse(res, 200, {
      connected: false,
      configured: true,
      storageMode: 'local',
      provider: 'Local',
      error: errMsg,
      message: `Failed to reach Supabase, so the app is running on local device storage until the connection is restored: ${errMsg}.${helpfulTip}`,
    });
  }
}
