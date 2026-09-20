import pg from 'pg';
import { sendResponse } from './helper';

// Bulletproof Pool resolution across CJS, ESM, and bundled Vercel serverless environments
const PgPool = (pg as any)?.Pool || (pg as any)?.default?.Pool || (pg as any)?.default || pg;

let poolInstance: pg.Pool | null = null;
let lastUsedConnectionString: string | null = null;

function cleanDatabaseUrl(rawUrl: string): { connectionString: string; isSsl: boolean; hostInfo: string } {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, '');
  let hostInfo = 'PostgreSQL';

  try {
    const parsed = new URL(urlStr);
    hostInfo = `${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}`;
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    return {
      connectionString: parsed.toString(),
      isSsl: true,
      hostInfo,
    };
  } catch {
    const cleaned = urlStr.replace(/[\?&]sslmode=[^&]*/g, '').replace(/[\?&]ssl=[^&]*/g, '').replace(/\?$/, '');
    return { connectionString: cleaned, isSsl: true, hostInfo };
  }
}

function getStatusPool(): pg.Pool {
  const rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl) throw new Error('DATABASE_URL environment variable is not configured');
  const { connectionString } = cleanDatabaseUrl(rawDbUrl);
  if (!poolInstance || lastUsedConnectionString !== connectionString) {
    if (poolInstance) {
      poolInstance.end().catch(() => {});
    }
    poolInstance = new PgPool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      max: 5,
    });
    lastUsedConnectionString = connectionString;
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
  'hog_raising',
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
    if (req.method === 'OPTIONS') {
      if (typeof res.status === 'function') return res.status(200).end();
      res.statusCode = 200;
      return res.end();
    }

    const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');

    if (!rawUrl) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'DATABASE_URL is not set in Vercel environment variables. Go to Vercel Project Settings > Environment Variables, add DATABASE_URL (check Production), and Redeploy.',
      });
    }

    if (rawUrl.includes('[YOUR-PASSWORD]') || rawUrl.includes('<password>') || rawUrl.includes('YOUR_PASSWORD')) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        provider: 'Supabase',
        message: 'DATABASE_URL still contains the placeholder "[YOUR-PASSWORD]". Replace it with your actual Supabase database password in Vercel Settings and redeploy.',
      });
    }

    if (/:\[[^\]]+\]@/.test(rawUrl)) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        provider: 'Supabase',
        message: 'DATABASE_URL has square brackets around your password like :[password]@. Remove the brackets [ and ] from the password.',
      });
    }

    if (!rawUrl.startsWith('postgres://') && !rawUrl.startsWith('postgresql://')) {
      return sendResponse(res, 200, {
        connected: false,
        configured: false,
        provider: 'Local Storage',
        message: 'DATABASE_URL must start with "postgresql://" or "postgres://". Please copy the URI from Supabase Project Settings > Database.',
      });
    }

    const isSupabase = rawUrl.toLowerCase().includes('supabase');
    const isDirectPort = rawUrl.includes(':5432') && rawUrl.includes('db.');
    const provider = isSupabase ? 'Supabase' : 'PostgreSQL';

    const pool = getStatusPool();
    const queryPromise = pool.query('SELECT NOW() as current_time, current_database() as db_name');
    const statsPromise = getLiveTableStats(pool);
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

    return sendResponse(res, 200, {
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
    const rawUrl = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
    const isSupabase = rawUrl.toLowerCase().includes('supabase');
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
      provider: isSupabase ? 'Supabase' : 'PostgreSQL',
      error: errMsg,
      message: `Failed to connect to ${isSupabase ? 'Supabase' : 'database'}: ${errMsg}.${helpfulTip}`,
    });
  }
}
