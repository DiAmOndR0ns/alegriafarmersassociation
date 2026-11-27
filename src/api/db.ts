import pg from 'pg';
import { EggHarvestLog, IgpLivestockInventory, IgpSale } from '../types';
import { deriveIgpLivestockInventory } from '../utils/igpInventory';
import type { MembershipPayment, MembershipYearSnapshot } from '../types';
import { getInitialFund } from '../utils/fundBalance';
import { cleanDateString, cleanNumber, cleanText, cleanTextList, safeImageUrl } from './sanitize';

/** Audit states a ledger row may carry. */
const AUDITED_STATUSES: readonly string[] = ['Unaudited', 'Audited', 'Flagged'];

/** Roles that the sync layer may ever store on an account. */
const ASSIGNABLE_ROLE_VALUES: readonly string[] = [
  'Vice_President',
  'Secretary',
  'Assistant_Secretary',
  'Board_Member',
  'Treasurer',
  'Assistant_Treasurer',
  'Auditor',
  'PIO',
  'Member'
];

// Bulletproof Pool resolution across CJS, ESM, and bundled Vercel serverless environments
const PgPool = (pg as any)?.Pool || (pg as any)?.default?.Pool || (pg as any)?.default || pg;

let poolInstance: pg.Pool | null = null;
let lastUsedConnectionString: string | null = null;

// Pools are cached per connection string so that a changed DATABASE_URL never
// forces us to end a pool that in-flight requests are still using. The previous
// single-slot cache called poolInstance.end() whenever the URL changed, which
// could tear down a pool mid-query under concurrent serverless invocations.
const poolCache = new Map<string, pg.Pool>();
const poolIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

const POOL_IDLE_TTL_MS = 60_000;

function scheduleIdleEviction(connectionString: string) {
  const existing = poolIdleTimers.get(connectionString);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    poolIdleTimers.delete(connectionString);
    const cached = poolCache.get(connectionString);
    if (!cached) return;
    poolCache.delete(connectionString);
    // Safe to end here: the pool sat idle for the whole TTL, so no request is using it.
    cached.end().catch(() => { });
  }, POOL_IDLE_TTL_MS);

  // Don't keep a Node process alive just for pool cleanup.
  if (typeof (timer as any)?.unref === 'function') (timer as any).unref();
  poolIdleTimers.set(connectionString, timer);
}
export const DATABASE_URL_ERROR = 'DATABASE_URL must point at the hosted Supabase PostgreSQL project.';

/** True when the URL targets a loopback host, i.e. a local database instead of Supabase. */
export function isLoopbackDatabaseUrl(rawUrl: string): boolean {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, '');
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return /^[a-z]+:\/\/.*@(localhost|127\.0\.0\.1|\[::1\])([:/?]|$)/i.test(urlStr);
  }
}

export function isDatabaseConfigured(): boolean {
  const dbUrl = process.env.DATABASE_URL?.trim().replace(/^["']|["']$/g, '');
  return Boolean(
    dbUrl &&
    dbUrl !== '' &&
    !dbUrl.includes('[YOUR-PASSWORD]') &&
    !dbUrl.includes('<password>') &&
    !dbUrl.includes('YOUR_PASSWORD') &&
    !dbUrl.includes('your_supabase_connection_string') &&
    (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) &&
    !isLoopbackDatabaseUrl(dbUrl)
  );
}

/**
 * Normalizes the Supabase connection string. TLS is always required for the
 * hosted database, so any `sslmode`/`ssl` query parameter is stripped here and
 * the `ssl` option is set explicitly on the pool instead.
 *
 * This is not cosmetic. `pg-connection-string` turns a URL parameter
 * `sslmode=verify-ca` / `sslmode=verify-full` into an `ssl` object of its own,
 * and `pg` merges that into the explicit `ssl` option — `connectionString` is
 * applied *after* the top-level config. A leftover
 * `?sslmode=verify-full&sslrootcert=` therefore replaced our
 * `{ rejectUnauthorized: false }` with `{ ca: '', rejectUnauthorized: true }`,
 * and the driver then resolved that empty `ca` to Node's bundled root store.
 * Supabase's pooler presents a self-signed chain, so every connection died with
 * "self-signed certificate in certificate chain" — login, sync, status, and the
 * public achievements/products endpoints alike. Strip every TLS-related key so
 * the explicit `ssl` option is the only source of truth.
 */
export function cleanDatabaseUrl(rawUrl: string): { connectionString: string; isSsl: boolean; hostInfo: string } {
  const urlStr = rawUrl.trim().replace(/^["']|["']$/g, '');
  let hostInfo = 'Supabase';
  // TLS is decided by getDatabaseSslOptions(), never by the URL.
  const dropTlsParams = (url: URL) => {
    for (const key of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']) {
      url.searchParams.delete(key);
    }
  };

  try {
    const parsed = new URL(urlStr);
    hostInfo = `${parsed.hostname}${parsed.port ? ':' + parsed.port : ''}${parsed.pathname}`;
    dropTlsParams(parsed);
    return {
      connectionString: parsed.toString(),
      isSsl: true,
      hostInfo,
    };
  } catch {
    const cleaned = urlStr
      .replace(/[?&](?:sslmode|ssl|sslrootcert|sslcert|sslkey)=[^&]*/g, '')
      .replace(/\?$/, '');
    return { connectionString: cleaned, isSsl: true, hostInfo };
  }
}

export function getDatabaseSslOptions() {
  const encodedCa = process.env.SUPABASE_CA_CERT_BASE64?.trim();
  if (!encodedCa) return { rejectUnauthorized: false };

  const ca = Buffer.from(encodedCa, 'base64').toString('utf8').trim();
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) {
    // A malformed/empty blob must not downgrade us into strict verification
    // with no trust anchors - that fails every connection with an opaque TLS
    // error. Fall back to the same behaviour as an unset variable.
    console.warn('[DB TLS] SUPABASE_CA_CERT_BASE64 is not a PEM certificate; ignoring it.');
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true, ca };
}

export function getPool(): pg.Pool {
  const rawDbUrl = process.env.DATABASE_URL;
  if (rawDbUrl && isLoopbackDatabaseUrl(rawDbUrl)) {
    throw new Error(DATABASE_URL_ERROR);
  }
  if (!rawDbUrl || !isDatabaseConfigured()) {
    throw new Error(DATABASE_URL_ERROR);
  }

  const { connectionString, isSsl } = cleanDatabaseUrl(rawDbUrl);

  // Reuse the cached pool for this connection string and keep it alive: ending a
  // pool here could abort queries other concurrent requests are still running.
  const cached = poolCache.get(connectionString);
  if (cached) {
    scheduleIdleEviction(connectionString);
    poolInstance = cached;
    lastUsedConnectionString = connectionString;
    return cached;
  }

  // Supabase's pooler may present a self-signed certificate chain. Keep TLS
  // enabled for this connection without globally changing Node's TLS settings.
  const pool = new PgPool({
    connectionString,
    ssl: getDatabaseSslOptions(),
    connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 10000,
    max: 6,
  });

  pool.on('error', (err: any) => {
    console.warn('[PostgreSQL Pool Client Error]:', err?.message || err);
  });

  poolCache.set(connectionString, pool);
  scheduleIdleEviction(connectionString);
  poolInstance = pool;
  lastUsedConnectionString = connectionString;

  return pool;
}

export async function runSchemaMigrations(client: pg.PoolClient) {
  const statements = [
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS member_id_number VARCHAR(100);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_paid_through INTEGER;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS inactive_reason TEXT;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS rsbsa_number VARCHAR(100);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS is_rsbsa_registered BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS gender VARCHAR(20);`,
    `ALTER TABLE members ADD COLUMN IF NOT EXISTS birth_date VARCHAR(50);`,
    `CREATE TABLE IF NOT EXISTS pending_members(
      id VARCHAR(100) PRIMARY KEY,
      name TEXT NOT NULL,
      username VARCHAR(100),
      farm_location TEXT,
      primary_crops TEXT[],
      contact_number VARCHAR(50),
      joined_date VARCHAR(50),
      rsbsa_number VARCHAR(100),
      is_rsbsa_registered BOOLEAN DEFAULT FALSE,
      avatar_url TEXT,
      gender VARCHAR(20),
      birth_date VARCHAR(50),
      affiliations JSONB DEFAULT '[]'::jsonb,
      registration_status VARCHAR(80) DEFAULT 'Pending Secretary Approval',
      approved_by_secretary TEXT,
      approved_by_secretary_date VARCHAR(50)
    );`,

    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id_number VARCHAR(100);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS rsbsa_number VARCHAR(100);`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_rsbsa_registered BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_history JSONB DEFAULT '[]'::jsonb;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS total_failed_logins INTEGER DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_requested BOOLEAN DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_totp_secret TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_used_step BIGINT;`,
    `UPDATE users SET mfa_enabled = TRUE WHERE lower(replace(role, ' ', '_')) = 'president' AND mfa_enabled = FALSE;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users (lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN ('member', 'board_member');`,

    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fund_source TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_status VARCHAR(50) DEFAULT 'Unaudited';`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audited_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS audit_notes TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approval_status VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approved_by TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approved_date VARCHAR(50);`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS president_approval_remarks TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS purpose TEXT;`,
    `ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS liquidation_deadline VARCHAR(50);`,

    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendance_record JSONB;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS minutes_approval_status VARCHAR(50);`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approved_by TEXT;`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approved_date VARCHAR(50);`,
    `ALTER TABLE meetings ADD COLUMN IF NOT EXISTS approval_remarks TEXT;`,
    `CREATE TABLE IF NOT EXISTS afa_igp (id VARCHAR(100) PRIMARY KEY, produces TEXT[], closed_years INT[]);`,
    `CREATE TABLE IF NOT EXISTS afa_igp_livestocks (
      produce TEXT NOT NULL,
      stage TEXT NOT NULL,
      head_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (produce, stage)
    );`,
    `DO $$
      DECLARE
        has_stage BOOLEAN;
        has_head_count BOOLEAN;
        has_stage_breakdown BOOLEAN;
        has_opening_count BOOLEAN;
        has_initial_count BOOLEAN;
      BEGIN
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'stage'
        ) INTO has_stage;
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'head_count'
        ) INTO has_head_count;

        IF NOT has_stage OR NOT has_head_count THEN
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'stage_breakdown'
          ) INTO has_stage_breakdown;
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'opening_count'
          ) INTO has_opening_count;
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'afa_igp_livestocks' AND column_name = 'initial_count'
          ) INTO has_initial_count;

          CREATE TABLE IF NOT EXISTS afa_igp_livestocks_migrated (
            produce TEXT NOT NULL,
            stage TEXT NOT NULL,
            head_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (produce, stage)
          );

          IF has_stage_breakdown THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, kv.key,
                CASE WHEN COALESCE(kv.value, '') ~ '^[0-9]+$' THEN kv.value::integer ELSE 0 END
              FROM afa_igp_livestocks AS l
              CROSS JOIN LATERAL jsonb_each_text(
                CASE WHEN jsonb_typeof(l.stage_breakdown) = 'object' THEN l.stage_breakdown ELSE '{}'::jsonb END
              ) AS kv(key, value)
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL AND NULLIF(trim(kv.key), '') IS NOT NULL
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          END IF;

          IF has_opening_count THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, 'General',
                CASE WHEN COALESCE(l.opening_count::text, '') ~ '^[0-9]+$' THEN l.opening_count ELSE 0 END
              FROM afa_igp_livestocks AS l
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL
                AND COALESCE(l.opening_count, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM afa_igp_livestocks_migrated m WHERE m.produce = l.produce)
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          ELSIF has_initial_count THEN
            EXECUTE $m$
              INSERT INTO afa_igp_livestocks_migrated (produce, stage, head_count)
              SELECT l.produce, 'General',
                CASE WHEN COALESCE(l.initial_count::text, '') ~ '^[0-9]+$' THEN l.initial_count ELSE 0 END
              FROM afa_igp_livestocks AS l
              WHERE NULLIF(trim(l.produce), '') IS NOT NULL
                AND COALESCE(l.initial_count, 0) > 0
                AND NOT EXISTS (SELECT 1 FROM afa_igp_livestocks_migrated m WHERE m.produce = l.produce)
              ON CONFLICT (produce, stage) DO NOTHING;
            $m$;
          END IF;

          DROP TABLE afa_igp_livestocks;
          ALTER TABLE afa_igp_livestocks_migrated RENAME TO afa_igp_livestocks;
        END IF;
      END $$;`,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'herd_breakdown'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Swine Raising (Baboyan)', stage_name, stage_qty
            FROM afa_igp,
            LATERAL (VALUES
              ('Fattening', CASE WHEN COALESCE(herd_breakdown->>'fattening', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'fattening')::integer ELSE 0 END),
              ('Gestation', CASE WHEN COALESCE(herd_breakdown->>'gestation', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'gestation')::integer ELSE 0 END),
              ('Lactating', CASE WHEN COALESCE(herd_breakdown->>'lactating', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'lactating')::integer ELSE 0 END),
              ('Dispersal', CASE WHEN COALESCE(herd_breakdown->>'dispersal', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'dispersal')::integer ELSE 0 END)
            ) AS s(stage_name, stage_qty)
            WHERE stage_qty > 0
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Cattle Raising (Bakahan)', stage_name, stage_qty
            FROM afa_igp,
            LATERAL (VALUES
              ('Fattening', CASE WHEN COALESCE(herd_breakdown->>'cattleFattening', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'cattleFattening')::integer ELSE 0 END),
              ('Dispersal', CASE WHEN COALESCE(herd_breakdown->>'cattleDispersal', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'cattleDispersal')::integer ELSE 0 END)
            ) AS s(stage_name, stage_qty)
            WHERE stage_qty > 0
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT 'Poultry Raising (RTL)', 'RTL',
              CASE WHEN COALESCE(herd_breakdown->>'rtlCount', '') ~ '^[0-9]+$' THEN (herd_breakdown->>'rtlCount')::integer ELSE 0 END
            FROM afa_igp
            WHERE COALESCE(herd_breakdown->>'rtlCount', '0') <> '0'
            ON CONFLICT (produce, stage) DO NOTHING;
          $migration$;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'afa_igp_livestock'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT l.produce, kv.key,
              CASE WHEN COALESCE(kv.value, '') ~ '^[0-9]+$' THEN kv.value::integer ELSE 0 END
            FROM afa_igp_livestock AS l
            CROSS JOIN LATERAL jsonb_each_text(
              CASE WHEN jsonb_typeof(l.stage_breakdown) = 'object' THEN l.stage_breakdown ELSE '{}'::jsonb END
            ) AS kv(key, value)
            WHERE NULLIF(trim(kv.key), '') IS NOT NULL
            ON CONFLICT (produce, stage) DO NOTHING;

            INSERT INTO afa_igp_livestocks (produce, stage, head_count)
            SELECT l.produce, 'General',
              CASE WHEN COALESCE(l.opening_count::text, '') ~ '^[0-9]+$' THEN l.opening_count ELSE 0 END
            FROM afa_igp_livestock AS l
            WHERE COALESCE(l.stage_breakdown, '{}'::jsonb) = '{}'::jsonb
              AND COALESCE(l.opening_count, 0) > 0
            ON CONFLICT (produce, stage) DO NOTHING;
          $migration$;
          DROP TABLE IF EXISTS afa_igp_livestock;
        END IF;
      END $$;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS initial_count;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS opening_count;`,
    `ALTER TABLE afa_igp_livestocks DROP COLUMN IF EXISTS stage_breakdown;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS opening_hog_count;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS herd_breakdown;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS initial_count;`,
    `CREATE TABLE IF NOT EXISTS afa_igp_expenses(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    expense_data JSONB,
    category TEXT,
    quantity NUMERIC,
    description TEXT,
    amount NUMERIC,
    recorded_by TEXT,
    fund_source TEXT,
    stage TEXT
  ); `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS expense_data JSONB; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS category TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS quantity NUMERIC; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS description TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS amount NUMERIC; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS recorded_by TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS fund_source TEXT; `,
    `ALTER TABLE afa_igp_expenses ADD COLUMN IF NOT EXISTS stage TEXT; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_expenses' AND column_name = 'hog_stage'
  ) THEN
          EXECUTE 'UPDATE afa_igp_expenses SET stage = COALESCE(NULLIF(stage, ''''), hog_stage)';
        END IF;
      END $$; `,
    `CREATE TABLE IF NOT EXISTS afa_igp_harvests(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT,
    date VARCHAR(50),
    time VARCHAR(50),
    collected_by TEXT NOT NULL,
    egg_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Audit',
    audited_by TEXT,
    audited_date VARCHAR(50),
    audit_remarks TEXT,
    signed_by TEXT,
    signed_date VARCHAR(50),
    signature_remarks TEXT
  ); `,
    `CREATE TABLE IF NOT EXISTS afa_igp_sales(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    stage TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    recorded_by TEXT,
    fund_source TEXT,
    notes TEXT
  ); `,
    `ALTER TABLE afa_igp_sales ADD COLUMN IF NOT EXISTS stage TEXT; `,
    `ALTER TABLE afa_igp_sales ADD COLUMN IF NOT EXISTS quantity NUMERIC NOT NULL DEFAULT 0; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hog_stage'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET stage = COALESCE(NULLIF(stage, ''''), hog_stage)';
        END IF;
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'produce_count'
  ) AND EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hogs_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales
            SET quantity = CASE WHEN quantity = 0 THEN COALESCE(NULLIF(produce_count, 0), hogs_count, 0) ELSE quantity END';
        ELSIF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'produce_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET quantity = CASE WHEN quantity = 0 THEN produce_count ELSE quantity END';
        ELSIF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_sales' AND column_name = 'hogs_count'
  ) THEN
          EXECUTE 'UPDATE afa_igp_sales SET quantity = CASE WHEN quantity = 0 THEN hogs_count ELSE quantity END';
        END IF;
      END $$; `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp_expenses' AND column_name = 'expense_data'
  ) THEN
          EXECUTE $migration$
            UPDATE afa_igp_expenses SET
  category = COALESCE(NULLIF(category, ''), expense_data ->> 'category'),
    quantity = CASE
                WHEN quantity IS NULL OR quantity = 0 THEN
                  CASE WHEN COALESCE(expense_data ->> 'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense_data ->> 'quantity')::numeric ELSE quantity END
                ELSE quantity END,
    description = COALESCE(NULLIF(description, ''), expense_data ->> 'description'),
    amount = CASE
                WHEN amount IS NULL OR amount = 0 THEN
                  CASE WHEN COALESCE(expense_data ->> 'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense_data ->> 'amount')::numeric ELSE amount END
                ELSE amount END,
    recorded_by = COALESCE(NULLIF(recorded_by, ''), expense_data ->> 'recordedBy'),
    fund_source = COALESCE(NULLIF(fund_source, ''), expense_data ->> 'fundSource'),
    stage = COALESCE(NULLIF(stage, ''), expense_data ->> 'stage', expense_data ->> 'hogStage'),
    produce = CASE
  WHEN(COALESCE(stage, expense_data ->> 'stage', expense_data ->> 'hogStage') = 'RTL'
                  OR COALESCE(category, expense_data ->> 'category') ~* '(rtl|poultry|chicken|egg)')
                  AND COALESCE(produce, expense_data ->> 'produce', '') ~* '(swine|hog|baboy|^$)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(NULLIF(produce, ''), NULLIF(expense_data ->> 'produce', ''), 'Swine Raising (Baboyan)')
  END
            WHERE expense_data IS NOT NULL
  $migration$;
        END IF;
      END $$; `,
    `CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses(produce); `,
    `DO $$
  BEGIN
        IF EXISTS(
    SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'expenses'
  ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_expenses(
    id, produce, date, expense_data, category, quantity, description, amount, recorded_by, fund_source, stage
  )
            SELECT expense ->> 'id',
    CASE
                WHEN COALESCE(expense ->> 'stage', expense ->> 'hogStage') = 'RTL'
                  OR expense ->> 'category' ~* '(rtl|poultry|chicken|egg)'
                  THEN 'Poultry Raising (RTL)'
                ELSE COALESCE(
      NULLIF(expense ->> 'produce', ''),
      CASE WHEN expense ->> 'category' ~* '(calf|cattle|baka)'
                    THEN 'Cattle Raising (Bakahan)' END,
      'Swine Raising (Baboyan)'
    )
  END,
    expense ->> 'date',
    expense,
    expense ->> 'category',
    CASE WHEN COALESCE(expense ->> 'quantity', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense ->> 'quantity')::numeric END,
    expense ->> 'description',
    CASE WHEN COALESCE(expense ->> 'amount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
  THEN(expense ->> 'amount')::numeric END,
    expense ->> 'recordedBy',
    expense ->> 'fundSource',
    COALESCE(expense ->> 'stage', expense ->> 'hogStage')
            FROM afa_igp AS igp
            CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(igp.expenses) = 'array' THEN igp.expenses ELSE '[]':: jsonb END
    ) AS item(expense)
            WHERE NULLIF(expense ->> 'id', '') IS NOT NULL
            ON CONFLICT (id) DO UPDATE SET
  produce = CASE
                WHEN afa_igp_expenses.produce ~* '(swine|hog|baboy)'
                  AND EXCLUDED.produce ~* '(poultry|rtl|chicken|egg)'
                  THEN EXCLUDED.produce
                ELSE COALESCE(NULLIF(afa_igp_expenses.produce, ''), EXCLUDED.produce)
  END,
    date = COALESCE(NULLIF(afa_igp_expenses.date, ''), EXCLUDED.date),
    expense_data = COALESCE(afa_igp_expenses.expense_data, EXCLUDED.expense_data),
    category = COALESCE(NULLIF(afa_igp_expenses.category, ''), EXCLUDED.category),
    quantity = CASE
                WHEN afa_igp_expenses.quantity IS NULL OR afa_igp_expenses.quantity = 0
                  THEN EXCLUDED.quantity
                ELSE afa_igp_expenses.quantity
  END,
    description = COALESCE(NULLIF(afa_igp_expenses.description, ''), EXCLUDED.description),
    amount = CASE
                WHEN afa_igp_expenses.amount IS NULL OR afa_igp_expenses.amount = 0
                  THEN EXCLUDED.amount
                ELSE afa_igp_expenses.amount
  END,
    recorded_by = COALESCE(NULLIF(afa_igp_expenses.recorded_by, ''), EXCLUDED.recorded_by),
    fund_source = COALESCE(NULLIF(afa_igp_expenses.fund_source, ''), EXCLUDED.fund_source),
    stage = COALESCE(NULLIF(afa_igp_expenses.stage, ''), EXCLUDED.stage)
  $migration$;
        END IF;
      END $$; `,
    `DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'sales'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_sales (
              id, produce, date, stage, quantity, revenue, recorded_by, fund_source, notes
            )
            SELECT sale->>'id',
              COALESCE(NULLIF(sale->>'produce', ''), 'Unspecified'),
              sale->>'date',
              COALESCE(sale->>'stage', sale->>'hogStage'),
              CASE WHEN COALESCE(sale->>'quantity', sale->>'produceCount', sale->>'hogsCount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN COALESCE(sale->>'quantity', sale->>'produceCount', sale->>'hogsCount')::numeric ELSE 0 END,
              CASE WHEN COALESCE(sale->>'revenue', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                THEN (sale->>'revenue')::numeric ELSE 0 END,
              sale->>'recordedBy',
              sale->>'fundSource',
              sale->>'notes'
            FROM afa_igp AS igp
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(igp.sales) = 'array' THEN igp.sales ELSE '[]'::jsonb END
            ) AS item(sale)
            WHERE NULLIF(sale->>'id', '') IS NOT NULL
            ON CONFLICT (id) DO NOTHING;
          $migration$;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'afa_igp' AND column_name = 'chore_logs'
        ) THEN
          EXECUTE $migration$
            INSERT INTO afa_igp_harvests (
              id, produce, date, time, collected_by, egg_count, notes, status,
              audited_by, audited_date, audit_remarks, signed_by, signed_date, signature_remarks
            )
            SELECT harvest->>'id',
              harvest->>'produce',
              harvest->>'date',
              harvest->>'time',
              COALESCE(NULLIF(harvest->>'collectedBy', ''), 'Unknown'),
              CASE WHEN COALESCE(harvest->>'eggCount', '') ~ '^[0-9]+$'
                THEN (harvest->>'eggCount')::integer ELSE 0 END,
              harvest->>'notes',
              COALESCE(NULLIF(harvest->>'status', ''), 'Pending Audit'),
              harvest->>'auditedBy',
              harvest->>'auditedDate',
              harvest->>'auditRemarks',
              harvest->>'signedBy',
              harvest->>'signedDate',
              harvest->>'signatureRemarks'
            FROM afa_igp AS igp
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(igp.chore_logs) = 'array' THEN igp.chore_logs ELSE '[]'::jsonb END
            ) AS item(harvest)
            WHERE NULLIF(harvest->>'id', '') IS NOT NULL
            ON CONFLICT (id) DO NOTHING;
          $migration$;
        END IF;
      END $$;`,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS expenses, DROP COLUMN IF EXISTS sales, DROP COLUMN IF EXISTS chore_logs;`,
    `DROP TABLE IF EXISTS afa_igp_group_members; `,
    `DROP TABLE IF EXISTS afa_igp_groups; `,
    `ALTER TABLE afa_igp DROP COLUMN IF EXISTS groups; `,
    `ALTER TABLE afa_igp_expenses DROP COLUMN IF EXISTS hog_stage; `,
    `ALTER TABLE afa_igp_sales DROP COLUMN IF EXISTS hog_stage, DROP COLUMN IF EXISTS hogs_count, DROP COLUMN IF EXISTS produce_count; `,
    `DROP TABLE IF EXISTS hog_raising; `,

    `ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS ceb_name TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS quantity_available VARCHAR(100); `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_name TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_sitio TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS farmer_phone VARCHAR(50); `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person TEXT; `,
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE; `,

    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS ceb_title TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS date_scheduled VARCHAR(50); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS scheduled_time VARCHAR(100); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS time_scheduled VARCHAR(100); `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS target_audience TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS image_url TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS attendees_count INTEGER DEFAULT 0; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS documented_notes TEXT; `,
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS status_reason TEXT; `,

    `UPDATE financial_transactions AS tx
      SET activity_id = NULL
      WHERE tx.activity_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM activities AS activity WHERE activity.id = tx.activity_id); `,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) NOT NULL DEFAULT 'usable';`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS lost_quantity INTEGER DEFAULT 0;`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS used_quantity INTEGER DEFAULT 0;`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS purchase_transaction_id VARCHAR(100);`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100);`,
    `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);`,
    `UPDATE financial_transactions AS tx
      SET meeting_id = NULL
      WHERE tx.meeting_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM meetings AS m WHERE m.id = tx.meeting_id);`,
    `UPDATE inventory AS item
      SET activity_id = NULL
      WHERE item.activity_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM activities AS a WHERE a.id = item.activity_id);`,
    `UPDATE inventory AS item
      SET meeting_id = NULL
      WHERE item.meeting_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM meetings AS m WHERE m.id = item.meeting_id);`,
    `UPDATE inventory
      SET asset_type = 'rental'
      WHERE (asset_type IS NULL OR asset_type = 'usable')
        AND (category = 'Rental Assets' OR catalog_product_id IS NOT NULL);`,
    `UPDATE inventory AS item
      SET purchase_transaction_id = NULL
      WHERE item.purchase_transaction_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM financial_transactions AS tx WHERE tx.id = item.purchase_transaction_id);`,
    `UPDATE inventory AS item
      SET catalog_product_id = NULL
      WHERE item.catalog_product_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM products AS product WHERE product.id = item.catalog_product_id); `,
    `DO $$
  BEGIN
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_activity_id_fkey'
            AND conrelid = 'financial_transactions':: regclass
  ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_activity_id_fkey
            FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_catalog_product_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_catalog_product_id_fkey
            FOREIGN KEY(catalog_product_id) REFERENCES products(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_purchase_transaction_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_purchase_transaction_id_fkey
            FOREIGN KEY(purchase_transaction_id) REFERENCES financial_transactions(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'financial_transactions_meeting_id_fkey'
            AND conrelid = 'financial_transactions':: regclass
  ) THEN
          ALTER TABLE financial_transactions
            ADD CONSTRAINT financial_transactions_meeting_id_fkey
            FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_activity_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_activity_id_fkey
            FOREIGN KEY(activity_id) REFERENCES activities(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
        IF NOT EXISTS(
    SELECT 1 FROM pg_constraint
          WHERE conname = 'inventory_meeting_id_fkey'
            AND conrelid = 'inventory':: regclass
  ) THEN
          ALTER TABLE inventory
            ADD CONSTRAINT inventory_meeting_id_fkey
            FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
            DEFERRABLE INITIALLY DEFERRED NOT VALID;
        END IF;
      END $$; `,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_activity_id_fkey; `,
    `ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_meeting_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_catalog_product_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_purchase_transaction_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_activity_id_fkey; `,
    `ALTER TABLE inventory VALIDATE CONSTRAINT inventory_meeting_id_fkey; `,
    `CREATE INDEX IF NOT EXISTS financial_transactions_activity_id_idx ON financial_transactions(activity_id); `,
    `CREATE INDEX IF NOT EXISTS financial_transactions_meeting_id_idx ON financial_transactions(meeting_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_catalog_product_id_idx ON inventory(catalog_product_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_purchase_transaction_id_idx ON inventory(purchase_transaction_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_activity_id_idx ON inventory(activity_id); `,
    `CREATE INDEX IF NOT EXISTS inventory_meeting_id_idx ON inventory(meeting_id); `,

    `CREATE TABLE IF NOT EXISTS achievements(
    id VARCHAR(100) PRIMARY KEY,
    year VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    ceb_title TEXT,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
  ); `,
    `CREATE TABLE IF NOT EXISTS organization_funds(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    current_balance NUMERIC DEFAULT 0,
    description TEXT,
    custodian TEXT,
    last_updated VARCHAR(50)
  ); `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS category TEXT; `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS source_origin TEXT; `,
    `ALTER TABLE organization_funds ADD COLUMN IF NOT EXISTS initial_fund NUMERIC DEFAULT 0; `,
    // Legacy databases still carry allocated_amount; newer ones only have initial_fund.
    // Guard the backfill so a missing legacy column cannot fail the whole migration.
    `DO $$
  BEGIN
       IF EXISTS(SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
         UPDATE organization_funds SET initial_fund = allocated_amount
  WHERE(initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
       END IF;
     END $$; `,
    `ALTER TABLE organization_funds DROP CONSTRAINT IF EXISTS organization_funds_code_key; `,

    // Drop legacy unused auditor_reports table (superseded by live AuditorReport + per-transaction auditing)
    `DROP TABLE IF EXISTS auditor_reports;`,

    // Executive Delegation Requests (Proposal Requirement: President to VP delegation)
    `CREATE TABLE IF NOT EXISTS delegation_requests(
    id VARCHAR(100) PRIMARY KEY,
    requested_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]':: jsonb,
    requested_date VARCHAR(50) NOT NULL,
    effective_start VARCHAR(50),
    effective_end VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pending',
    reviewed_by TEXT,
    reviewed_date VARCHAR(50),
    remarks TEXT
  ); `,
    `ALTER TABLE delegation_requests ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]':: jsonb; `,

    // Annual membership dues. One row per member per membership year; the roster
    // and the printed year-end list are derived from these receipts, not from a
    // hand-toggled Active/Inactive flag.
    `CREATE TABLE IF NOT EXISTS membership_payments(
    id VARCHAR(100) PRIMARY KEY,
    member_id VARCHAR(100) NOT NULL,
    member_name TEXT NOT NULL,
    member_id_number VARCHAR(100),
    year INTEGER NOT NULL,
    amount NUMERIC DEFAULT 0,
    date_paid VARCHAR(50),
    method VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending',
    recorded_by TEXT,
    recorded_at VARCHAR(50),
    verified_by TEXT,
    verified_date VARCHAR(50),
    voided_by TEXT,
    voided_date VARCHAR(50),
    void_reason TEXT,
    notes TEXT,
    transaction_id VARCHAR(100)
  ); `,
    `CREATE INDEX IF NOT EXISTS membership_payments_year_idx ON membership_payments(year); `,
    `CREATE INDEX IF NOT EXISTS membership_payments_member_idx ON membership_payments(member_id); `,
    // One live receipt per member per year; voided rows are kept for the audit trail.
    `CREATE UNIQUE INDEX IF NOT EXISTS membership_payments_one_live_per_year_idx
       ON membership_payments(member_id, year) WHERE status <> 'Voided'; `,

    // Immutable roster snapshot written when an officer closes a membership year.
    `CREATE TABLE IF NOT EXISTS membership_year_snapshots(
    year INTEGER PRIMARY KEY,
    closed_by TEXT,
    closed_at VARCHAR(50),
    dues_amount NUMERIC DEFAULT 0,
    total_members INTEGER DEFAULT 0,
    paid_members INTEGER DEFAULT 0,
    unpaid_members INTEGER DEFAULT 0,
    total_collected NUMERIC DEFAULT 0,
    listed_members JSONB DEFAULT '[]':: jsonb,
    unpaid_member_ids JSONB DEFAULT '[]':: jsonb,
    remarks TEXT
  ); `,

    `DO $$
      DECLARE queue_has_rows BOOLEAN;
  BEGIN
        IF to_regclass('public.sync_queue') IS NOT NULL THEN
          EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.sync_queue LIMIT 1)' INTO queue_has_rows;
          IF NOT queue_has_rows THEN
            EXECUTE 'DROP TABLE public.sync_queue';
  ELSE
            RAISE NOTICE 'Preserving non-empty legacy sync_queue table';
          END IF;
        END IF;
      END $$; `,

    // Clean up any pending_members row whose applicant has already been confirmed into `members`.
    `DELETE FROM pending_members pm
     WHERE EXISTS (
       SELECT 1 FROM members m
       WHERE m.id = pm.id
          OR lower(trim(m.name)) = lower(trim(pm.name))
     );`,

    // Clean up orphaned plain Member accounts in `users` whose corresponding member
    // or pending_member record was already deleted earlier.
    `DELETE FROM users u
     WHERE lower(replace(u.role, ' ', '_')) = 'member'
       AND NOT EXISTS (
         SELECT 1 FROM members m
         WHERE m.id = u.id
            OR (u.member_id_number IS NOT NULL AND u.member_id_number <> '' AND m.member_id_number = u.member_id_number)
            OR lower(trim(m.name)) = lower(trim(u.name))
       )
       AND NOT EXISTS (
         SELECT 1 FROM pending_members pm
         WHERE pm.id = u.id
            OR (pm.username IS NOT NULL AND pm.username <> '' AND lower(trim(pm.username)) = lower(trim(u.username)))
            OR lower(trim(pm.name)) = lower(trim(u.name))
       );`
  ];

  const failures: Array<{ statement: string; error: string }> = [];
  for (const stmt of statements) {
    try {
      await client.query(stmt);
    } catch (error: any) {
      const message = error?.message || String(error);
      failures.push({ statement: stmt, error: message });
      console.error('[Schema Migration Failure]:', message, '\nStatement:', stmt);
    }
  }

  if (failures.length > 0) {
    const details = failures.map(({ statement, error }) => `- ${error}: ${statement} `).join('\n');
    throw new Error(`Schema migration failed for ${failures.length} statement(s): \n${details} `);
  }
}

export async function initDatabaseSchema(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users(
    id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_approved BOOLEAN DEFAULT TRUE,
    joined_date VARCHAR(50),
    farm_location TEXT,
    primary_crops TEXT[],
    contact_number VARCHAR(50),
    status VARCHAR(50),
    avatar_url TEXT,
    member_id_number VARCHAR(100),
    rsbsa_number VARCHAR(100),
    is_rsbsa_registered BOOLEAN DEFAULT FALSE,
    password_history JSONB DEFAULT '[]':: jsonb,
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMPTZ,
    total_failed_logins INTEGER DEFAULT 0,
    reset_requested BOOLEAN DEFAULT FALSE
    , totp_secret TEXT
    , pending_totp_secret TEXT
    , mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE
    , totp_last_used_step BIGINT
  );
  `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_unique_named_role_idx
      ON users(lower(replace(role, ' ', '_')))
      WHERE lower(replace(role, ' ', '_')) NOT IN('member', 'board_member'); `);

    // 2. Members
    await client.query(`
      CREATE TABLE IF NOT EXISTS members(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    farm_location TEXT,
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

    // 2b. Pending Members (Unconfirmed applications awaiting Secretary approval and/or Treasurer membership fee confirmation)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_members(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    username VARCHAR(100),
    farm_location TEXT,
    primary_crops TEXT[],
    contact_number VARCHAR(50),
    joined_date VARCHAR(50),
    rsbsa_number VARCHAR(100),
    is_rsbsa_registered BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    gender VARCHAR(20),
    birth_date VARCHAR(50),
    affiliations JSONB DEFAULT '[]'::jsonb,
    registration_status VARCHAR(80) DEFAULT 'Pending Secretary Approval',
    approved_by_secretary TEXT,
    approved_by_secretary_date VARCHAR(50)
  );
  `);

    // 3. Meetings
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings(
    id VARCHAR(100) PRIMARY KEY,
    title TEXT NOT NULL,
    date VARCHAR(50),
    location TEXT,
    attendance_count INTEGER DEFAULT 0,
    agenda TEXT,
    minutes TEXT,
    officer_in_charge TEXT,
    attendance_record JSONB,
    minutes_approval_status VARCHAR(50),
    approved_by TEXT,
    approved_date VARCHAR(50),
    approval_remarks TEXT
  );
  `);

    // 4. Resolutions
    await client.query(`
      CREATE TABLE IF NOT EXISTS resolutions(
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

    // 5. Financial Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_transactions(
    id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    amount NUMERIC NOT NULL,
    date VARCHAR(50),
    description TEXT,
    recorded_by TEXT,
    activity_id VARCHAR(100),
    fund_source TEXT,
    purpose TEXT,
    liquidation_deadline VARCHAR(50),
    audited_status VARCHAR(50) DEFAULT 'Unaudited',
    audited_by TEXT,
    audited_date VARCHAR(50),
    audit_notes TEXT
  );
  `);
    // President sign-off on audited financial records (Auditor → President).
    await client.query(`
      ALTER TABLE financial_transactions
        ADD COLUMN IF NOT EXISTS president_approval_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS president_approved_by TEXT,
      ADD COLUMN IF NOT EXISTS president_approved_date VARCHAR(50),
        ADD COLUMN IF NOT EXISTS president_approval_remarks TEXT;
  `);

    // 6. Announcements
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements(
    id VARCHAR(100) PRIMARY KEY,
    title TEXT NOT NULL,
    category VARCHAR(100),
    content TEXT,
    date_posted VARCHAR(50),
    priority VARCHAR(50),
    posted_by TEXT
  );
  `);

    // 7. System Logs (Audit chain)
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_logs(
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

    // 8. IGP State (reformatted afa_igp + normalized afa_igp_livestocks)
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp (
        id VARCHAR(100) PRIMARY KEY,
        produces TEXT[],
        closed_years INT[]
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_livestocks (
        produce TEXT NOT NULL,
        stage TEXT NOT NULL,
        head_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (produce, stage)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_expenses(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    expense_data JSONB,
    category TEXT,
    quantity NUMERIC,
    description TEXT,
    amount NUMERIC,
    recorded_by TEXT,
    fund_source TEXT,
    stage TEXT
  );
  `);
    await client.query('CREATE INDEX IF NOT EXISTS afa_igp_expenses_produce_idx ON afa_igp_expenses (produce);');
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_harvests(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT,
    date VARCHAR(50),
    time VARCHAR(50),
    collected_by TEXT NOT NULL,
    egg_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending Audit',
    audited_by TEXT,
    audited_date VARCHAR(50),
    audit_remarks TEXT,
    signed_by TEXT,
    signed_date VARCHAR(50),
    signature_remarks TEXT
  );
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS afa_igp_sales(
    id VARCHAR(100) PRIMARY KEY,
    produce TEXT NOT NULL,
    date VARCHAR(50),
    stage TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    revenue NUMERIC NOT NULL DEFAULT 0,
    recorded_by TEXT,
    fund_source TEXT,
    notes TEXT
  );
  `);

    // 9. Products
    await client.query(`
      CREATE TABLE IF NOT EXISTS products(
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

    // 10. Association inventory
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    category VARCHAR(100),
    quantity INTEGER DEFAULT 0,
    damaged_quantity INTEGER DEFAULT 0,
    unit VARCHAR(50),
    item_condition VARCHAR(50),
    location TEXT,
    notes TEXT,
    catalog_product_id VARCHAR(100),
    recorded_by TEXT,
    date_recorded VARCHAR(50),
    last_updated VARCHAR(50)
  );
  `);
    await client.query(`
      ALTER TABLE inventory
        ADD COLUMN IF NOT EXISTS damaged_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS lost_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS used_quantity INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) NOT NULL DEFAULT 'usable',
        ADD COLUMN IF NOT EXISTS catalog_product_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS purchase_transaction_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS activity_id VARCHAR(100),
        ADD COLUMN IF NOT EXISTS meeting_id VARCHAR(100);
  `);

    // 11. Activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities(
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
    status_reason TEXT,
    documented_notes TEXT,
    attendees_count INTEGER DEFAULT 0,
    target_audience TEXT,
    image_url TEXT
  );
  `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements(
    id VARCHAR(100) PRIMARY KEY,
    year VARCHAR(20) NOT NULL,
    title TEXT NOT NULL,
    ceb_title TEXT,
    description TEXT NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'Trophy'
  );
  `);

    // 12. Organization Funds
    await client.query(`
      CREATE TABLE IF NOT EXISTS organization_funds(
    id VARCHAR(100) PRIMARY KEY,
    name TEXT NOT NULL,
    code VARCHAR(50) NOT NULL,
    initial_fund NUMERIC DEFAULT 0,
    current_balance NUMERIC DEFAULT 0,
    description TEXT,
    custodian TEXT,
    last_updated VARCHAR(50)
  );
  `);
    await client.query(`
      ALTER TABLE organization_funds
        ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS source_origin TEXT,
      ADD COLUMN IF NOT EXISTS initial_fund NUMERIC DEFAULT 0;
  `);
    // Backfill the initial fund from the legacy allocated_amount column, but only
    // when that column exists: fresh databases are created with initial_fund only.
    await client.query(`
      DO $$
  BEGIN
        IF EXISTS(SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'organization_funds' AND column_name = 'allocated_amount') THEN
          UPDATE organization_funds SET initial_fund = allocated_amount
  WHERE(initial_fund IS NULL OR initial_fund = 0) AND allocated_amount IS NOT NULL AND allocated_amount <> 0;
        END IF;
      END $$;
  `);
    // Fund codes are auto-derived from the fund name, so two funds can legitimately
    // share initials. A UNIQUE constraint here silently rolled back the whole sync.
    await client.query(`
      ALTER TABLE organization_funds
        DROP CONSTRAINT IF EXISTS organization_funds_code_key;
  `);

    // 13. Drop legacy unused auditor_reports table
    await client.query(`DROP TABLE IF EXISTS auditor_reports;`);

    // 14. Delegation Requests
    await client.query(`
      CREATE TABLE IF NOT EXISTS delegation_requests(
    id VARCHAR(100) PRIMARY KEY,
    requested_by TEXT NOT NULL,
    reason TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]':: jsonb,
    requested_date VARCHAR(50) NOT NULL,
    effective_start VARCHAR(50),
    effective_end VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Pending',
    reviewed_by TEXT,
    reviewed_date VARCHAR(50),
    remarks TEXT
  );
  `);
    await client.query(`ALTER TABLE delegation_requests ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL DEFAULT '[]':: jsonb`);

    // 15. Annual membership dues + closed membership years
    await client.query(`
      CREATE TABLE IF NOT EXISTS membership_payments(
    id VARCHAR(100) PRIMARY KEY,
    member_id VARCHAR(100) NOT NULL,
    member_name TEXT NOT NULL,
    member_id_number VARCHAR(100),
    year INTEGER NOT NULL,
    amount NUMERIC DEFAULT 0,
    date_paid VARCHAR(50),
    method VARCHAR(50) DEFAULT 'Cash',
    reference_no VARCHAR(100),
    status VARCHAR(50) DEFAULT 'Pending',
    recorded_by TEXT,
    recorded_at VARCHAR(50),
    verified_by TEXT,
    verified_date VARCHAR(50),
    voided_by TEXT,
    voided_date VARCHAR(50),
    void_reason TEXT,
    notes TEXT,
    transaction_id VARCHAR(100)
  );
      CREATE INDEX IF NOT EXISTS membership_payments_year_idx ON membership_payments(year);
      CREATE INDEX IF NOT EXISTS membership_payments_member_idx ON membership_payments(member_id);
  `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS membership_year_snapshots(
    year INTEGER PRIMARY KEY,
    closed_by TEXT,
    closed_at VARCHAR(50),
    dues_amount NUMERIC DEFAULT 0,
    total_members INTEGER DEFAULT 0,
    paid_members INTEGER DEFAULT 0,
    unpaid_members INTEGER DEFAULT 0,
    total_collected NUMERIC DEFAULT 0,
    listed_members JSONB DEFAULT '[]':: jsonb,
    unpaid_member_ids JSONB DEFAULT '[]':: jsonb,
    remarks TEXT
  );
  `);

    await client.query('COMMIT');
    console.log('[DB DEBUG] Database schema initialized successfully');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[DB DEBUG] Schema initialization failed:', err?.message || err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getTableStats(pool: pg.Pool): Promise<{
  tableCounts: Record<string, number>;
  totalRecords: number;
}> {
  const client = await pool.connect();
  try {
    const res = await client.query(`
  SELECT
    (SELECT count(*) FROM users) as users,
    (SELECT count(*) FROM members) as members,
      (SELECT count(*) FROM meetings) as meetings,
        (SELECT count(*) FROM resolutions) as resolutions,
          (SELECT count(*) FROM financial_transactions) as financial_transactions,
            (SELECT count(*) FROM announcements) as announcements,
              (SELECT count(*) FROM system_logs) as system_logs,
                (SELECT count(*) FROM afa_igp) as afa_igp,
                  (SELECT count(*) FROM afa_igp_livestocks) as afa_igp_livestocks,
                      (SELECT count(*) FROM afa_igp_expenses) as afa_igp_expenses,
                        (SELECT count(*) FROM afa_igp_harvests) as afa_igp_harvests,
                          (SELECT count(*) FROM afa_igp_sales) as afa_igp_sales,
                            (SELECT count(*) FROM products) as products,
                              (SELECT count(*) FROM inventory) as inventory,
                                (SELECT count(*) FROM activities) as activities,
                                  (SELECT count(*) FROM achievements) as achievements,
                                    (SELECT count(*) FROM organization_funds) as organization_funds,
                                        (SELECT count(*) FROM delegation_requests) as delegation_requests,
                                          (SELECT count(*) FROM membership_payments) as membership_payments,
                                            (SELECT count(*) FROM membership_year_snapshots) as membership_year_snapshots
    `);
    const row = res.rows[0] || {};
    const tableCounts: Record<string, number> = {
      users: Number(row.users || 0),
      members: Number(row.members || 0),
      meetings: Number(row.meetings || 0),
      resolutions: Number(row.resolutions || 0),
      financial_transactions: Number(row.financial_transactions || 0),
      announcements: Number(row.announcements || 0),
      system_logs: Number(row.system_logs || 0),
      afa_igp: Number(row.afa_igp || 0),
      afa_igp_livestocks: Number(row.afa_igp_livestocks || 0),
      afa_igp_expenses: Number(row.afa_igp_expenses || 0),
      afa_igp_harvests: Number(row.afa_igp_harvests || 0),
      afa_igp_sales: Number(row.afa_igp_sales || 0),
      products: Number(row.products || 0),
      inventory: Number(row.inventory || 0),
      activities: Number(row.activities || 0),
      achievements: Number(row.achievements || 0),
      organization_funds: Number(row.organization_funds || 0),
      delegation_requests: Number(row.delegation_requests || 0),
      membership_payments: Number(row.membership_payments || 0),
      membership_year_snapshots: Number(row.membership_year_snapshots || 0),
    };
    const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
    return { tableCounts, totalRecords };
  } catch (err: any) {
    console.error('[DB DEBUG] getTableStats failed:', err?.message || err);
    return {
      tableCounts: {},
      totalRecords: 0,
    };
  } finally {
    client.release();
  }
}

let schemaInitialized = false;
let schemaInitInFlight: Promise<void> | null = null;

export const ENTITY_TABLE_MAP: Readonly<Record<string, string>> = {
  user: 'users', users: 'users', officer: 'users', officers: 'users',
  member: 'members', members: 'members',
  pendingmember: 'pending_members', pendingmembers: 'pending_members',
  pending_member: 'pending_members', pending_members: 'pending_members',
  meeting: 'meetings', meetings: 'meetings',
  resolution: 'resolutions', resolutions: 'resolutions',
  transaction: 'financial_transactions', transactions: 'financial_transactions',
  financialtransaction: 'financial_transactions', financialtransactions: 'financial_transactions',
  financial_transaction: 'financial_transactions', financial_transactions: 'financial_transactions',
  announcement: 'announcements', announcements: 'announcements',
  product: 'products', products: 'products', activity: 'activities', activities: 'activities',
  inventory: 'inventory', inventories: 'inventory',
  achievement: 'achievements', achievements: 'achievements',
  fund: 'organization_funds', funds: 'organization_funds',
  organizationfund: 'organization_funds', organizationfunds: 'organization_funds',
  organization_fund: 'organization_funds', organization_funds: 'organization_funds',
  delegationrequest: 'delegation_requests', delegationrequests: 'delegation_requests',
  delegation_request: 'delegation_requests', delegation_requests: 'delegation_requests',
  membershippayment: 'membership_payments', membershippayments: 'membership_payments',
  membership_payment: 'membership_payments', membership_payments: 'membership_payments',
  afa_igp: 'afa_igp', afaigp: 'afa_igp', igp: 'afa_igp', systemlog: 'system_logs', systemlogs: 'system_logs', log: 'system_logs', logs: 'system_logs'
};

export function lookupEntityTable(entity: string): string | undefined {
  const lower = (entity || '').toLowerCase();
  const normalized = lower.replace(/[-_]/g, '');
  return ENTITY_TABLE_MAP[entity] || ENTITY_TABLE_MAP[lower] || ENTITY_TABLE_MAP[normalized];
}

/**
 * Directly and immediately deletes one or more entities from the PostgreSQL Cloud Database.
 */
export async function deleteEntityFromPostgres(
  pool: pg.Pool,
  entity: string,
  ids: string | string[]
): Promise<{ success: boolean; deletedCount: number; entity: string; table: string }> {
  const tableName = lookupEntityTable(entity);
  if (!tableName) {
    throw new Error(`Unknown entity type for database deletion: ${entity} `);
  }

  const idList = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
  if (idList.length === 0) {
    return { success: true, deletedCount: 0, entity, table: tableName };
  }

  const client = await pool.connect();
  try {
    let deletedMemberIdNumbers: string[] = [];
    let deletedMemberNames: string[] = [];
    if (tableName === 'members' || tableName === 'pending_members') {
      try {
        const lookupCol = tableName === 'members' ? 'id, name, member_id_number' : 'id, name';
        const existing = await client.query(`SELECT ${lookupCol} FROM ${tableName} WHERE id = ANY($1)`, [idList]);
        deletedMemberIdNumbers = existing.rows
          .map((r: any) => typeof r.member_id_number === 'string' ? r.member_id_number.trim() : '')
          .filter(Boolean);
        deletedMemberNames = existing.rows
          .map((r: any) => typeof r.name === 'string' ? r.name.trim().toLowerCase() : '')
          .filter(Boolean);
      } catch {
        // Ignore lookup error and proceed with primary deletion
      }
    }

    const res = await client.query(`DELETE FROM ${tableName} WHERE id = ANY($1)`, [idList]);

    if (tableName === 'members' || tableName === 'pending_members') {
      // Cascade-delete linked plain Member portal accounts in `users` (never officers)
      await client.query(
        `DELETE FROM users
         WHERE lower(replace(role, ' ', '_')) = 'member'
           AND (
             id = ANY($1)
             OR (member_id_number IS NOT NULL AND member_id_number <> '' AND member_id_number = ANY($2))
             OR (lower(trim(name)) = ANY($3))
           )`,
        [idList, deletedMemberIdNumbers, deletedMemberNames]
      );
      if (tableName === 'members') {
        await client.query('DELETE FROM membership_payments WHERE member_id = ANY($1)', [idList]);
      }
    }

    console.log(`[DB DELETE] Removed ${res.rowCount || 0} record(s) from "${tableName}"(IDs: ${idList.join(', ')})`);
    return { success: true, deletedCount: res.rowCount || 0, entity, table: tableName };
  } finally {
    client.release();
  }
}

/** Ensures every base table exists, then applies additive migrations. */
export async function ensureDatabaseSchema(pool: pg.Pool) {
  if (schemaInitialized) return;
  if (schemaInitInFlight) return schemaInitInFlight;
  schemaInitInFlight = (async () => {
    try {
      console.log('[DB DEBUG] Ensuring all database tables exist...');
      await initDatabaseSchema(pool);
      const client = await pool.connect();
      try {
        await runSchemaMigrations(client);
      } finally {
        client.release();
      }
      schemaInitialized = true;
    } catch (err: any) {
      console.error('[DB DEBUG] ensureDatabaseSchema failed:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        hint: err?.hint
      });
      throw err;
    } finally {
      schemaInitInFlight = null;
    }
  })();
  return schemaInitInFlight;
}

export function mergeIgpExpenses(
  segmentedRows: Array<{
    id: string;
    produce?: string | null;
    date?: string | null;
    category?: string | null;
    quantity?: number | string | null;
    description?: string | null;
    amount?: number | string | null;
    recorded_by?: string | null;
    fund_source?: string | null;
    stage?: string | null;
    expense_data?: Record<string, unknown> | null;
  }>
) {
  return segmentedRows.map((row) => {
    const legacy = row.expense_data && typeof row.expense_data === 'object' ? row.expense_data : {};
    const legacyString = (key: string) => typeof legacy[key] === 'string' ? legacy[key] as string : undefined;
    const legacyNumber = (key: string) => {
      const value = legacy[key];
      if (typeof value !== 'number' && typeof value !== 'string') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
      id: row.id,
      ...(row.produce || legacyString('produce') ? { produce: row.produce || legacyString('produce') } : {}),
      ...(row.date || legacyString('date') ? { date: row.date || legacyString('date') } : {}),
      ...(row.category || legacyString('category') ? { category: row.category || legacyString('category') } : {}),
      ...(row.quantity != null || legacyNumber('quantity') != null
        ? { quantity: Number(row.quantity ?? legacyNumber('quantity')) }
        : {}),
      ...(row.description || legacyString('description')
        ? { description: row.description || legacyString('description') }
        : {}),
      ...(row.amount != null || legacyNumber('amount') != null
        ? { amount: Number(row.amount ?? legacyNumber('amount')) }
        : {}),
      ...(row.recorded_by || legacyString('recordedBy')
        ? { recordedBy: row.recorded_by || legacyString('recordedBy') }
        : {}),
      ...(row.fund_source || legacyString('fundSource')
        ? { fundSource: row.fund_source || legacyString('fundSource') }
        : {}),
      ...(row.stage || legacyString('stage') || legacyString('hogStage')
        ? { stage: row.stage || legacyString('stage') || legacyString('hogStage') }
        : {})
    };
  });
}

function mergeIgpRecords<T extends { id?: string }>(normalized: T[], legacy: T[]): T[] {
  const records = new Map<string, T>();
  for (const record of legacy) {
    if (typeof record?.id === 'string' && record.id) records.set(record.id, record);
  }
  for (const record of normalized) {
    if (typeof record?.id !== 'string' || !record.id) continue;
    const existing = records.get(record.id);
    records.set(record.id, existing ? { ...existing, ...record } : record);
  }
  return Array.from(records.values());
}

function normalizeLegacyIgpExpense(expense: any) {
  const { hogStage, ...record } = expense;
  const stage = record.stage || hogStage;
  return { ...record, ...(stage ? { stage } : {}) };
}

function normalizeLegacyIgpSale(sale: any): IgpSale {
  const { hogStage, hogsCount, produceCount, ...record } = sale;
  const quantity = Number(record.quantity ?? produceCount ?? hogsCount ?? 0);
  return {
    ...record,
    ...(record.stage || hogStage ? { stage: record.stage || hogStage } : {}),
    quantity: Number.isFinite(quantity) ? Math.max(0, quantity) : 0
  };
}

export async function fetchAllDataFromPostgres(pool: pg.Pool) {
  await ensureDatabaseSchema(pool);
  const client = await pool.connect();
  try {
    const safeQuery = async (sql: string) => {
      try {
        return await client.query(sql);
      } catch {
        return { rows: [] as any[] };
      }
    };

    const [
      usersRes,
      membersRes,
      meetingsRes,
      resolutionsRes,
      transactionsRes,
      announcementsRes,
      logsRes,
      hogQuery,
      igpLivestockRows,
      igpExpenseRows,
      igpSalesRows,
      igpHarvestRows,
      productsRes,
      inventoryRes,
      activitiesRes,
      achievementsRes,
      fundsRes,
      pmRes,
      delRes,
      payRes,
      snapRes
    ] = await Promise.all([
      client.query('SELECT * FROM users ORDER BY name ASC'),
      client.query('SELECT * FROM members ORDER BY name ASC'),
      client.query('SELECT * FROM meetings ORDER BY date DESC'),
      client.query('SELECT * FROM resolutions ORDER BY date_agreed DESC'),
      client.query('SELECT * FROM financial_transactions ORDER BY date DESC'),
      client.query('SELECT * FROM announcements ORDER BY date_posted DESC'),
      client.query('SELECT * FROM system_logs ORDER BY timestamp DESC'),
      client.query("SELECT * FROM afa_igp WHERE id IN ('main_state', 'afa_igp_main', 'hog_raising_main') ORDER BY (id = 'main_state') DESC LIMIT 1"),
      client.query('SELECT produce, stage, head_count FROM afa_igp_livestocks ORDER BY produce ASC, stage ASC'),
      client.query('SELECT * FROM afa_igp_expenses ORDER BY date DESC, id ASC'),
      client.query('SELECT * FROM afa_igp_sales ORDER BY date DESC, id ASC'),
      client.query('SELECT * FROM afa_igp_harvests ORDER BY date DESC, time DESC, id ASC'),
      client.query('SELECT * FROM products ORDER BY name ASC'),
      client.query('SELECT * FROM inventory ORDER BY name ASC'),
      client.query('SELECT * FROM activities ORDER BY scheduled_date DESC'),
      client.query('SELECT * FROM achievements ORDER BY year DESC, title ASC'),
      client.query('SELECT * FROM organization_funds ORDER BY name ASC'),
      safeQuery('SELECT * FROM pending_members ORDER BY joined_date DESC, name ASC'),
      safeQuery('SELECT * FROM delegation_requests ORDER BY requested_date DESC'),
      safeQuery('SELECT * FROM membership_payments ORDER BY year DESC, date_paid DESC'),
      safeQuery('SELECT * FROM membership_year_snapshots ORDER BY year DESC')
    ]);
    const hogRes = hogQuery.rows.length > 0 ? hogQuery : await client.query('SELECT * FROM afa_igp LIMIT 1');

    const pendingMembers: any[] = pmRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      username: r.username || undefined,
      farmLocation: r.farm_location || 'Sitio Tapon',
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number || 'None',
      joinedDate: r.joined_date || '',
      rsbsaNumber: r.rsbsa_number || undefined,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered),
      avatarUrl: r.avatar_url || undefined,
      gender: r.gender || undefined,
      birthDate: r.birth_date || undefined,
      affiliations: Array.isArray(r.affiliations) ? r.affiliations : [],
      registrationStatus: r.registration_status === 'Awaiting Treasurer Fee' ? 'Awaiting Treasurer Fee' : 'Pending Secretary Approval',
      approvedBySecretary: r.approved_by_secretary || undefined,
      approvedBySecretaryDate: r.approved_by_secretary_date || undefined
    }));

    const delegationRequests: any[] = delRes.rows.map(r => ({
      id: r.id,
      requestedBy: r.requested_by,
      reason: r.reason,
      scopes: Array.isArray(r.scopes) ? r.scopes : [],
      requestedDate: r.requested_date,
      effectiveStart: r.effective_start,
      effectiveEnd: r.effective_end,
      status: r.status,
      reviewedBy: r.reviewed_by,
      reviewedDate: r.reviewed_date,
      remarks: r.remarks
    }));

    const membershipPayments: MembershipPayment[] = payRes.rows.map(r => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      memberIdNumber: r.member_id_number || undefined,
      year: Number(r.year),
      amount: Number(r.amount || 0),
      datePaid: r.date_paid || '',
      method: r.method || 'Cash',
      referenceNo: r.reference_no || undefined,
      status: r.status || 'Pending',
      recordedBy: r.recorded_by || '',
      recordedAt: r.recorded_at || '',
      verifiedBy: r.verified_by || undefined,
      verifiedDate: r.verified_date || undefined,
      voidedBy: r.voided_by || undefined,
      voidedDate: r.voided_date || undefined,
      voidReason: r.void_reason || undefined,
      notes: r.notes || undefined,
      transactionId: r.transaction_id || undefined
    }));

    const membershipYearSnapshots: MembershipYearSnapshot[] = snapRes.rows.map(r => ({
      year: Number(r.year),
      closedBy: r.closed_by || '',
      closedAt: r.closed_at || '',
      duesAmount: Number(r.dues_amount || 0),
      totalMembers: Number(r.total_members || 0),
      paidMembers: Number(r.paid_members || 0),
      unpaidMembers: Number(r.unpaid_members || 0),
      totalCollected: Number(r.total_collected || 0),
      listedMembers: Array.isArray(r.listed_members) ? r.listed_members : [],
      unpaidMemberIds: Array.isArray(r.unpaid_member_ids) ? r.unpaid_member_ids : [],
      remarks: r.remarks || undefined
    }));

    let hogState: {
      livestockInventory: IgpLivestockInventory[];
      produces: string[];
      expenses: any[];
      sales: any[];
      choreLogs: any[];
      eggHarvests: any[];
      closedYears: any[];
    } = {
      livestockInventory: [],
      produces: [],
      expenses: [],
      sales: [],
      choreLogs: [],
      eggHarvests: [],
      closedYears: []
    };

    const normalizedSales: IgpSale[] = igpSalesRows.rows.map((r) => ({
      id: r.id,
      date: r.date || '',
      quantity: Number(r.quantity || 0),
      revenue: Number(r.revenue || 0),
      recordedBy: r.recorded_by || '',
      ...(r.produce ? { produce: r.produce } : {}),
      ...(r.stage ? { stage: r.stage } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      ...(r.fund_source ? { fundSource: r.fund_source } : {})
    }));
    const normalizedHarvests: EggHarvestLog[] = igpHarvestRows.rows.map((r) => ({
      id: r.id,
      date: r.date || '',
      time: r.time || '',
      collectedBy: r.collected_by || '',
      eggCount: Number(r.egg_count || 0),
      status: r.status || 'Pending Audit',
      ...(r.produce ? { produce: r.produce } : {}),
      ...(r.notes ? { notes: r.notes } : {}),
      ...(r.audited_by ? { auditedBy: r.audited_by } : {}),
      ...(r.audited_date ? { auditedDate: r.audited_date } : {}),
      ...(r.audit_remarks ? { auditRemarks: r.audit_remarks } : {}),
      ...(r.signed_by ? { signedBy: r.signed_by } : {}),
      ...(r.signed_date ? { signedDate: r.signed_date } : {}),
      ...(r.signature_remarks ? { signatureRemarks: r.signature_remarks } : {})
    }));

    // Group normalized afa_igp_livestocks rows (produce, stage, head_count) by produce
    const livestockByProduce = new Map<string, Record<string, number>>();
    for (const r of igpLivestockRows.rows) {
      const produce = String(r.produce || '').trim();
      const stage = String(r.stage || '').trim();
      if (!produce || !stage) continue;
      const existing = livestockByProduce.get(produce) || {};
      existing[stage] = Math.max(0, Math.floor(Number(r.head_count) || 0));
      livestockByProduce.set(produce, existing);
    }
    const normalizedLivestock: IgpLivestockInventory[] = Array.from(livestockByProduce.entries()).map(
      ([produce, stageBreakdown]) => ({ produce, stageBreakdown })
    );

    if (hogRes.rows.length > 0) {
      const row = hogRes.rows[0];
      const rawProduces: string[] = Array.isArray(row.produces) ? row.produces : [];
      const cleanProduces = rawProduces.filter((p: string) => Boolean(p && p.trim()) && p !== 'Tilapia Breeding' && !p.toLowerCase().includes('tilapia'));
      hogState = {
        livestockInventory: normalizedLivestock,
        produces: cleanProduces,
        expenses: mergeIgpRecords(
          mergeIgpExpenses(igpExpenseRows.rows),
          Array.isArray(row.expenses) ? row.expenses.map(normalizeLegacyIgpExpense) : []
        ),
        sales: mergeIgpRecords(normalizedSales, Array.isArray(row.sales) ? row.sales.map(normalizeLegacyIgpSale) : []),
        choreLogs: mergeIgpRecords(normalizedHarvests, Array.isArray(row.chore_logs) ? row.chore_logs : []),
        eggHarvests: mergeIgpRecords(normalizedHarvests, Array.isArray(row.chore_logs) ? row.chore_logs : []),
        closedYears: row.closed_years || []
      };
    } else {
      hogState.livestockInventory = normalizedLivestock;
      hogState.expenses = mergeIgpExpenses(igpExpenseRows.rows);
      hogState.sales = normalizedSales;
      hogState.choreLogs = normalizedHarvests;
      hogState.eggHarvests = normalizedHarvests;
    }

    const members = membersRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      farmLocation: r.farm_location,
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number,
      status: r.status,
      joinedDate: r.joined_date,
      memberIdNumber: r.member_id_number,
      rsbsaNumber: r.rsbsa_number,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered),
      avatarUrl: r.avatar_url,
      gender: r.gender,
      birthDate: r.birth_date,
      membershipPaidThrough: r.membership_paid_through == null ? undefined : Number(r.membership_paid_through),
      inactiveReason: r.inactive_reason || undefined
    }));

    const users = usersRes.rows.map(r => ({
      id: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      isApproved: r.is_approved,
      joinedDate: r.joined_date,
      farmLocation: r.farm_location,
      primaryCrops: r.primary_crops || [],
      contactNumber: r.contact_number,
      status: r.status,
      avatarUrl: r.avatar_url,
      memberIdNumber: r.member_id_number,
      rsbsaNumber: r.rsbsa_number,
      isRsbsaRegistered: Boolean(r.is_rsbsa_registered),
      membershipPaidThrough: r.membership_paid_through == null ? undefined : Number(r.membership_paid_through),
      inactiveReason: r.inactive_reason || undefined,
      resetRequested: Boolean(r.reset_requested),
      mfaEnabled: Boolean(r.mfa_enabled)
    }));

    const meetings = meetingsRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      date: r.date,
      location: r.location,
      attendanceCount: Number(r.attendance_count || 0),
      agenda: r.agenda,
      minutes: r.minutes,
      officerInCharge: r.officer_in_charge,
      attendanceRecord: r.attendance_record || {},
      minutesApprovalStatus: r.minutes_approval_status || undefined,
      approvedBy: r.approved_by || undefined,
      approvedDate: r.approved_date || undefined,
      approvalRemarks: r.approval_remarks || undefined
    }));

    const resolutions = resolutionsRes.rows.map(r => ({
      id: r.id,
      resolutionNumber: r.resolution_number,
      title: r.title,
      description: r.description,
      dateAgreed: r.date_agreed,
      movedBy: r.moved_by,
      secondedBy: r.seconded_by,
      voteInFavor: Number(r.vote_in_favor || 0),
      voteAgainst: Number(r.vote_against || 0),
      voteAbstain: Number(r.vote_abstain || 0),
      status: r.status
    }));

    const transactions = transactionsRes.rows.map(r => ({
      id: r.id,
      type: r.type,
      category: r.category,
      amount: Number(r.amount || 0),
      date: r.date,
      description: r.description,
      recordedBy: r.recorded_by,
      activityId: r.activity_id,
      meetingId: r.meeting_id || undefined,
      fundSource: r.fund_source,
      auditedStatus: r.audited_status,
      auditedBy: r.audited_by,
      auditedDate: r.audited_date,
      auditNotes: r.audit_notes,
      purpose: r.purpose || undefined,
      liquidationDeadline: r.liquidation_deadline || undefined,
      presidentApprovalStatus: r.president_approval_status || undefined,
      presidentApprovedBy: r.president_approved_by || undefined,
      presidentApprovedDate: r.president_approved_date || undefined,
      presidentApprovalRemarks: r.president_approval_remarks || undefined
    }));

    const announcements = announcementsRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      content: r.content,
      datePosted: r.date_posted,
      priority: r.priority,
      postedBy: r.posted_by
    }));

    const logs = logsRes.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      user: r.user_name,
      role: r.role,
      action: r.action,
      details: r.details,
      syncStatus: r.sync_status || 'synced',
      hash: r.hash,
      previousHash: r.previous_hash
    }));

    const products = productsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      cebName: r.ceb_name,
      category: r.category,
      description: r.description,
      unit: r.unit,
      price: Number(r.price || 0),
      quantityAvailable: r.quantity_available,
      stockStatus: r.stock_status,
      farmerName: r.farmer_name,
      farmerSitio: r.farmer_sitio,
      farmerPhone: r.farmer_phone,
      contactPerson: r.contact_person,
      imageUrl: r.image_url,
      isPublished: r.is_published,
      updatedBy: r.updated_by,
      managedBy: r.managed_by,
      dateUpdated: r.date_updated
    }));

    const inventory = inventoryRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      assetType: (r.asset_type === 'rental' || r.category === 'Rental Assets' || Boolean(r.catalog_product_id)) ? 'rental' : 'usable',
      category: r.category,
      quantity: Number(r.quantity || 0),
      damagedQuantity: r.damaged_quantity == null ? undefined : Number(r.damaged_quantity),
      lostQuantity: r.lost_quantity == null ? undefined : Number(r.lost_quantity),
      usedQuantity: r.used_quantity == null ? undefined : Number(r.used_quantity),
      unit: r.unit,
      condition: r.item_condition,
      location: r.location || undefined,
      notes: r.notes || undefined,
      catalogProductId: r.catalog_product_id || undefined,
      purchaseTransactionId: r.purchase_transaction_id || undefined,
      activityId: r.activity_id || undefined,
      meetingId: r.meeting_id || undefined,
      recordedBy: r.recorded_by || '',
      dateRecorded: r.date_recorded || '',
      lastUpdated: r.last_updated || ''
    }));

    const activities = activitiesRes.rows.map(r => ({
      id: r.id,
      title: r.title,
      cebTitle: r.ceb_title,
      category: r.category,
      scheduledDate: r.scheduled_date || r.date_scheduled,
      dateScheduled: r.date_scheduled || r.scheduled_date,
      scheduledTime: r.scheduled_time || r.time_scheduled,
      timeScheduled: r.time_scheduled || r.scheduled_time,
      location: r.location,
      description: r.description,
      organizer: r.organizer,
      status: r.status,
      statusReason: r.status_reason,
      documentedNotes: r.documented_notes,
      attendeesCount: Number(r.attendees_count || 0),
      targetAudience: r.target_audience,
      imageUrl: r.image_url
    }));

    const achievements = achievementsRes.rows.map(r => ({
      id: r.id,
      year: r.year,
      title: r.title,
      cebTitle: r.ceb_title,
      description: r.description,
      icon: r.icon
    }));

    const funds = fundsRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      initialFund: Number(r.initial_fund ?? r.allocated_amount ?? 0),
      currentBalance: Number(r.current_balance || 0),
      category: r.category || '',
      source: r.source_origin || '',
      description: r.description,
      custodian: r.custodian,
      lastUpdated: r.last_updated
    }));

    return {
      users,
      members,
      pendingMembers,
      meetings,
      resolutions,
      transactions,
      financialTransactions: transactions,
      announcements,
      logs,
      systemLogs: logs,
      livestockIgp: hogState,
      products,
      inventory,
      activities,
      achievements,
      funds,
      organizationFunds: funds,
      delegationRequests,
      membershipPayments,
      membershipYearSnapshots
    };
  } finally {
    client.release();
  }
}

type SaveMapping = {
  table: string;
  fields: Array<[string, string, (value: any, row: any) => any]>;
  deletedIds: Set<string>;
};

async function saveEntity(
  client: pg.PoolClient,
  rows: any[],
  mapping: SaveMapping
): Promise<void> {
  const activeRows = rows.filter((row) => row?.id && !mapping.deletedIds.has(row.id));
  if (activeRows.length === 0) return;

  const columns = ['id', ...mapping.fields.map(([column]) => column)];
  const placeholders = columns.map((_, index) => `$${index + 1} `);
  const updates = columns.slice(1).map((column) =>
    mapping.table === 'users' && column === 'password'
      ? `password = CASE WHEN EXCLUDED.password IS NOT NULL AND EXCLUDED.password != '' THEN EXCLUDED.password ELSE users.password END`
      : `${column} = EXCLUDED.${column} `
  );
  const query = `INSERT INTO ${mapping.table} (${columns.join(', ')}) VALUES(${placeholders.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')} `;

  for (const row of activeRows) {
    const values = [row.id, ...mapping.fields.map(([, , transform]) => transform(row, row))];
    await client.query(query, values);
  }
}

async function saveIgpExpenseSegments(
  client: pg.PoolClient,
  expenses: any[],
  defaultProduce?: string
) {
  const ids: string[] = [];
  for (const expense of expenses) {
    if (typeof expense?.id !== 'string' || !expense.id.trim()) {
      throw new Error('Cannot sync IGP expense without a valid id');
    }

    const category = String(expense.category || '');
    const stage = String(expense.stage || '');
    const inferredProduce = stage === 'RTL' || /rtl|poultry|chicken|egg/i.test(category)
      ? 'Poultry Raising (RTL)'
      : /calf|cattle|baka/i.test(category)
        ? 'Cattle Raising (Bakahan)'
        : /piglet|swine|hog|baboy/i.test(category)
          ? 'Swine Raising (Baboyan)'
          : undefined;
    const produce = typeof expense.produce === 'string' && expense.produce.trim()
      ? expense.produce.trim()
      : inferredProduce || defaultProduce || 'Swine Raising (Baboyan)';
    ids.push(expense.id);
    await client.query(`
      INSERT INTO afa_igp_expenses(
                                              id, produce, date, category, quantity, description, amount, recorded_by, fund_source, stage, expense_data
                                            )
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
  produce = EXCLUDED.produce,
    date = EXCLUDED.date,
    category = EXCLUDED.category,
    quantity = EXCLUDED.quantity,
    description = EXCLUDED.description,
    amount = EXCLUDED.amount,
    recorded_by = EXCLUDED.recorded_by,
    fund_source = EXCLUDED.fund_source,
    stage = EXCLUDED.stage,
    expense_data = EXCLUDED.expense_data;
  `, [
      expense.id,
      produce,
      expense.date || null,
      cleanText(expense.category, 200),
      expense.quantity == null ? null : Math.max(0, cleanNumber(expense.quantity)),
      cleanText(expense.description, 2000),
      cleanNumber(expense.amount),
      cleanText(expense.recordedBy, 200),
      cleanText(expense.fundSource, 200),
      cleanText(expense.stage, 100),
      JSON.stringify(expense)
    ]);
  }

  await client.query(
    'DELETE FROM afa_igp_expenses WHERE NOT (id = ANY($1::varchar[]))',
    [ids]
  );
}

async function saveIgpSales(
  client: pg.PoolClient,
  sales: IgpSale[]
) {
  const ids: string[] = [];
  for (const sale of sales) {
    if (typeof sale?.id !== 'string' || !sale.id.trim()) {
      throw new Error('Cannot sync IGP sale without a valid id');
    }

    const produce = cleanText(sale.produce, 200) || 'Unspecified';
    ids.push(sale.id);
    await client.query(`
      INSERT INTO afa_igp_sales(
    id, produce, date, stage, quantity, revenue, recorded_by, fund_source, notes
  )
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
  produce = EXCLUDED.produce,
    date = EXCLUDED.date,
    stage = EXCLUDED.stage,
    quantity = EXCLUDED.quantity,
    revenue = EXCLUDED.revenue,
    recorded_by = EXCLUDED.recorded_by,
    fund_source = EXCLUDED.fund_source,
    notes = EXCLUDED.notes;
  `, [
      sale.id,
      produce,
      cleanDateString(sale.date, 50),
      cleanText(sale.stage, 100),
      Math.max(0, cleanNumber(sale.quantity)),
      cleanNumber(sale.revenue),
      cleanText(sale.recordedBy, 200),
      cleanText(sale.fundSource, 200),
      cleanText(sale.notes, 2000)
    ]);
  }

  await client.query('DELETE FROM afa_igp_sales WHERE NOT (id = ANY($1::varchar[]))', [ids]);
}

async function saveIgpLivestock(
  client: pg.PoolClient,
  livestock: IgpLivestockInventory[]
) {
  const activeProduces: string[] = [];
  const activeStages: string[] = [];
  for (const inventory of livestock) {
    const produce = cleanText(inventory?.produce, 200);
    if (!produce) throw new Error('Cannot sync IGP livestock inventory without a produce name');
    const entries = Object.entries(inventory.stageBreakdown || {});
    for (const [stage, count] of entries) {
      const cleanStage = cleanText(stage, 100);
      if (!cleanStage) throw new Error(`Cannot sync IGP inventory for ${produce} with a blank stage`);
      const headCount = Math.max(0, Math.floor(cleanNumber(count)));
      activeProduces.push(produce);
      activeStages.push(cleanStage);
      await client.query(`
        INSERT INTO afa_igp_livestocks (produce, stage, head_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (produce, stage) DO UPDATE SET
          head_count = EXCLUDED.head_count;
      `, [
        produce,
        cleanStage,
        headCount
      ]);
    }
  }

  if (activeProduces.length === 0) {
    await client.query('DELETE FROM afa_igp_livestocks');
  } else {
    await client.query(
      `DELETE FROM afa_igp_livestocks AS t
       WHERE NOT EXISTS (
         SELECT 1
         FROM unnest($1::varchar[], $2::varchar[]) AS active(produce, stage)
         WHERE active.produce = t.produce AND active.stage = t.stage
       )`,
      [activeProduces, activeStages]
    );
  }
}

async function saveIgpHarvests(
  client: pg.PoolClient,
  harvests: EggHarvestLog[]
) {
  for (const harvest of harvests) {
    if (typeof harvest?.id !== 'string' || !harvest.id.trim()) {
      throw new Error('Cannot sync IGP harvest without a valid id');
    }
    const collectedBy = cleanText(harvest.collectedBy, 200);
    if (!collectedBy) throw new Error(`Cannot sync IGP harvest ${harvest.id} without a collector`);
    await client.query(`
      INSERT INTO afa_igp_harvests(
    id, produce, date, time, collected_by, egg_count, notes, status,
    audited_by, audited_date, audit_remarks, signed_by, signed_date, signature_remarks
  )
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
  produce = COALESCE(EXCLUDED.produce, afa_igp_harvests.produce),
    date = EXCLUDED.date,
    time = EXCLUDED.time,
    collected_by = EXCLUDED.collected_by,
    egg_count = EXCLUDED.egg_count,
    notes = EXCLUDED.notes,
    status = EXCLUDED.status,
    audited_by = EXCLUDED.audited_by,
    audited_date = EXCLUDED.audited_date,
    audit_remarks = EXCLUDED.audit_remarks,
    signed_by = EXCLUDED.signed_by,
    signed_date = EXCLUDED.signed_date,
    signature_remarks = EXCLUDED.signature_remarks;
  `, [
      harvest.id,
      cleanText(harvest.produce, 200),
      cleanDateString(harvest.date, 50),
      cleanText(harvest.time, 50),
      collectedBy,
      Math.max(0, Math.floor(cleanNumber(harvest.eggCount))),
      cleanText(harvest.notes, 2000),
      cleanText(harvest.status, 50) || 'Pending Audit',
      cleanText(harvest.auditedBy, 200),
      cleanDateString(harvest.auditedDate, 50),
      cleanText(harvest.auditRemarks, 2000),
      cleanText(harvest.signedBy, 200),
      cleanDateString(harvest.signedDate, 50),
      cleanText(harvest.signatureRemarks, 2000)
    ]);
  }
}

export async function saveFullStateToPostgres(pool: pg.Pool, state: any) {
  console.log('[DB DEBUG] saveFullStateToPostgres called');
  console.log('[DB DEBUG] State keys:', Object.keys(state || {}));

  await ensureDatabaseSchema(pool);
  const client = await pool.connect();

  try {
    console.log('[DB DEBUG] Starting transaction...');
    await client.query('BEGIN');

    // Track all deleted IDs across entities so they are NEVER re-inserted in this transaction
    const deletedUserIds = new Set<string>();
    const deletedMemberIds = new Set<string>();
    const deletedPendingMemberIds = new Set<string>();
    const deletedMeetingIds = new Set<string>();
    const deletedResolutionIds = new Set<string>();
    const deletedTxIds = new Set<string>();
    const deletedAnnouncementIds = new Set<string>();
    const deletedProductIds = new Set<string>();
    const deletedInventoryIds = new Set<string>();
    const deletedActivityIds = new Set<string>();
    const deletedAchievementIds = new Set<string>();
    const deletedFundIds = new Set<string>();
    const deletedDelegationIds = new Set<string>();
    const deletedMembershipPaymentIds = new Set<string>();

    // 1. Handle Explicit Batch Deletions
    if (state.deletedIds && typeof state.deletedIds === 'object') {
      const d = state.deletedIds;
      if (Array.isArray(d.users) && d.users.length > 0) {
        d.users.forEach((id: string) => deletedUserIds.add(id));
        await client.query('DELETE FROM users WHERE id = ANY($1)', [d.users]);
        console.log('[DB DELETE] Batch deleted users:', d.users);
      }
      if (Array.isArray(d.members) && d.members.length > 0) {
        d.members.forEach((id: string) => {
          deletedMemberIds.add(id);
          deletedUserIds.add(id);
        });
        await client.query(
          `DELETE FROM users
           WHERE lower(replace(role, ' ', '_')) = 'member'
             AND (
               id = ANY($1)
               OR EXISTS (
                 SELECT 1 FROM members m
                 WHERE m.id = ANY($1)
                   AND (
                     (m.member_id_number IS NOT NULL AND m.member_id_number <> '' AND users.member_id_number = m.member_id_number)
                     OR lower(trim(users.name)) = lower(trim(m.name))
                   )
               )
             )`,
          [d.members]
        );
        await client.query('DELETE FROM members WHERE id = ANY($1)', [d.members]);
        console.log('[DB DELETE] Batch deleted members:', d.members);
      }
      const pms = d.pendingMembers || d.pending_members;
      if (Array.isArray(pms) && pms.length > 0) {
        pms.forEach((id: string) => {
          deletedPendingMemberIds.add(id);
          deletedUserIds.add(id);
        });
        await client.query(
          `DELETE FROM users
           WHERE lower(replace(role, ' ', '_')) = 'member'
             AND (
               id = ANY($1)
               OR EXISTS (
                 SELECT 1 FROM pending_members pm
                 WHERE pm.id = ANY($1)
                   AND lower(trim(users.name)) = lower(trim(pm.name))
               )
             )`,
          [pms]
        );
        await client.query('DELETE FROM pending_members WHERE id = ANY($1)', [pms]);
        console.log('[DB DELETE] Batch deleted pending_members:', pms);
      }
      if (Array.isArray(d.meetings) && d.meetings.length > 0) {
        d.meetings.forEach((id: string) => deletedMeetingIds.add(id));
        await client.query('DELETE FROM meetings WHERE id = ANY($1)', [d.meetings]);
        console.log('[DB DELETE] Batch deleted meetings:', d.meetings);
      }
      if (Array.isArray(d.resolutions) && d.resolutions.length > 0) {
        d.resolutions.forEach((id: string) => deletedResolutionIds.add(id));
        await client.query('DELETE FROM resolutions WHERE id = ANY($1)', [d.resolutions]);
        console.log('[DB DELETE] Batch deleted resolutions:', d.resolutions);
      }
      const txs = d.financialTransactions || d.transactions;
      if (Array.isArray(txs) && txs.length > 0) {
        txs.forEach((id: string) => deletedTxIds.add(id));
        await client.query('DELETE FROM financial_transactions WHERE id = ANY($1)', [txs]);
        console.log('[DB DELETE] Batch deleted transactions:', txs);
      }
      if (Array.isArray(d.announcements) && d.announcements.length > 0) {
        d.announcements.forEach((id: string) => deletedAnnouncementIds.add(id));
        await client.query('DELETE FROM announcements WHERE id = ANY($1)', [d.announcements]);
        console.log('[DB DELETE] Batch deleted announcements:', d.announcements);
      }
      if (Array.isArray(d.products) && d.products.length > 0) {
        d.products.forEach((id: string) => deletedProductIds.add(id));
        await client.query('DELETE FROM products WHERE id = ANY($1)', [d.products]);
        console.log('[DB DELETE] Batch deleted products:', d.products);
      }
      if (Array.isArray(d.inventory) && d.inventory.length > 0) {
        d.inventory.forEach((id: string) => deletedInventoryIds.add(id));
        await client.query('DELETE FROM inventory WHERE id = ANY($1)', [d.inventory]);
        console.log('[DB DELETE] Batch deleted inventory records:', d.inventory);
      }
      if (Array.isArray(d.activities) && d.activities.length > 0) {
        d.activities.forEach((id: string) => deletedActivityIds.add(id));
        await client.query('DELETE FROM activities WHERE id = ANY($1)', [d.activities]);
        console.log('[DB DELETE] Batch deleted activities:', d.activities);
      }
      if (Array.isArray(d.achievements) && d.achievements.length > 0) {
        d.achievements.forEach((id: string) => deletedAchievementIds.add(id));
        await client.query('DELETE FROM achievements WHERE id = ANY($1)', [d.achievements]);
      }
      const funds = d.funds || d.organizationFunds;
      if (Array.isArray(funds) && funds.length > 0) {
        funds.forEach((id: string) => deletedFundIds.add(id));
        await client.query('DELETE FROM organization_funds WHERE id = ANY($1)', [funds]);
        console.log('[DB DELETE] Batch deleted funds:', funds);
      }
      const dels = d.delegationRequests || d.delegation_requests;
      if (Array.isArray(dels) && dels.length > 0) {
        dels.forEach((id: string) => deletedDelegationIds.add(id));
        await client.query('DELETE FROM delegation_requests WHERE id = ANY($1)', [dels]);
      }
      const mps = d.membershipPayments || d.membership_payments;
      if (Array.isArray(mps) && mps.length > 0) {
        mps.forEach((id: string) => deletedMembershipPaymentIds.add(id));
        await client.query('DELETE FROM membership_payments WHERE id = ANY($1)', [mps]);
      }
    }
    // Removing a member also removes their dues receipts: the ledger belongs to
    // the person, and a deleted member must not appear in any year's roster.
    for (const memberId of [...deletedMemberIds, ...(Array.isArray(state.deletedIds?.members) ? state.deletedIds.members : [])]) {
      await client.query('DELETE FROM membership_payments WHERE member_id = $1', [memberId]);
    }

    // 2. Single item deletion support
    if (state.deleteItem && state.deleteItem.entity && state.deleteItem.id) {
      const tbl = lookupEntityTable(state.deleteItem.entity);
      if (tbl) {
        if (tbl === 'members') {
          deletedMemberIds.add(state.deleteItem.id);
          deletedUserIds.add(state.deleteItem.id);
          await client.query(
            `DELETE FROM users
             WHERE lower(replace(role, ' ', '_')) = 'member'
               AND (
                 id = $1
                 OR EXISTS (
                   SELECT 1 FROM members m
                   WHERE m.id = $1
                     AND (
                       (m.member_id_number IS NOT NULL AND m.member_id_number <> '' AND users.member_id_number = m.member_id_number)
                       OR lower(trim(users.name)) = lower(trim(m.name))
                     )
                 )
               )`,
            [state.deleteItem.id]
          );
        }
        if (tbl === 'pending_members') {
          deletedPendingMemberIds.add(state.deleteItem.id);
          deletedUserIds.add(state.deleteItem.id);
          await client.query(
            `DELETE FROM users
             WHERE lower(replace(role, ' ', '_')) = 'member'
               AND (
                 id = $1
                 OR EXISTS (
                   SELECT 1 FROM pending_members pm
                   WHERE pm.id = $1
                     AND lower(trim(users.name)) = lower(trim(pm.name))
                 )
               )`,
            [state.deleteItem.id]
          );
        }
        await client.query(`DELETE FROM ${tbl} WHERE id = $1`, [state.deleteItem.id]);
        if (tbl === 'users') deletedUserIds.add(state.deleteItem.id);
        if (tbl === 'meetings') deletedMeetingIds.add(state.deleteItem.id);
        if (tbl === 'resolutions') deletedResolutionIds.add(state.deleteItem.id);
        if (tbl === 'financial_transactions') deletedTxIds.add(state.deleteItem.id);
        if (tbl === 'announcements') deletedAnnouncementIds.add(state.deleteItem.id);
        if (tbl === 'products') deletedProductIds.add(state.deleteItem.id);
        if (tbl === 'inventory') deletedInventoryIds.add(state.deleteItem.id);
        if (tbl === 'activities') deletedActivityIds.add(state.deleteItem.id);
        if (tbl === 'achievements') deletedAchievementIds.add(state.deleteItem.id);
        if (tbl === 'organization_funds') deletedFundIds.add(state.deleteItem.id);
        if (tbl === 'delegation_requests') deletedDelegationIds.add(state.deleteItem.id);
        if (tbl === 'membership_payments') deletedMembershipPaymentIds.add(state.deleteItem.id);
        if (tbl === 'members') await client.query('DELETE FROM membership_payments WHERE member_id = $1', [state.deleteItem.id]);
        console.log(`[DB DELETE] Single deleted ${tbl} ID: ${state.deleteItem.id} `);
      }
    }

    if (state.users && Array.isArray(state.users)) {
      const activeUsers = state.users.filter((u: any) => !deletedUserIds.has(u.id));
      console.log('[DB DEBUG] Saving', activeUsers.length, 'users...');
      for (const u of activeUsers) {
        if (!u || typeof u.username !== 'string' || !u.username.trim()) continue;
        // Bound the fields that reach `users` so a sync payload cannot inject markup.
        const cleanUsername = String(u.username).trim().toLowerCase().slice(0, 100);
        const existingRow = await client.query('SELECT id, role FROM users WHERE lower(username) = lower($1) LIMIT 1', [cleanUsername]);
        const existingRole = existingRow.rows[0]?.role;
        // Accounts are matched by username only. A client-supplied id must never
        // be able to overwrite a different account's row.
        const targetId = existingRow.rows[0]?.id || undefined;
        const isNewAccount = !targetId;
        // Only a verified officer-role designation (President issue) may change a
        // role; a plain account sync must not be able to hand out officer seats.
        // Roles arrive pre-validated: either the server-issued designation or a
        // new Member account. Anything else is stored as Member at minimum.
        const incomingRole = ASSIGNABLE_ROLE_VALUES.includes(String(u.role)) ? String(u.role) : 'Member';
        const isCurrentPresident = existingRole && existingRole.toLowerCase() === 'president';
        const targetRole = isCurrentPresident && incomingRole.toLowerCase() !== 'president' ? existingRole : incomingRole;
        // Sync cannot change approval; new accounts start unapproved and conflicts preserve the database value.
        const isApproved = false;
        const cleanName = cleanText(u.name, 200) || cleanUsername;
        const rowId = typeof u.id === 'string' && u.id ? u.id : undefined;
        let resolvedId = targetId || rowId;
        if (!resolvedId) {
          console.warn('[Cloud DB Push] Skipping user row without a resolvable account id:', cleanUsername);
          continue;
        }

        // An existing account keeps its current role unless the incoming row was
        // authorised by `roleUpdate`; otherwise a plain account sync could hand
        // out officer seats. `$17` is the per-row authorisation flag.
        await client.query(`
          INSERT INTO users(id, username, password, name, role, is_approved, joined_date, farm_location, primary_crops, contact_number, status, avatar_url, member_id_number, rsbsa_number, is_rsbsa_registered, mfa_enabled)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
    name = EXCLUDED.name,
    role = CASE WHEN $17::boolean THEN EXCLUDED.role ELSE users.role END,
      joined_date = EXCLUDED.joined_date,
      farm_location = EXCLUDED.farm_location,
      primary_crops = EXCLUDED.primary_crops,
      contact_number = EXCLUDED.contact_number,
      status = EXCLUDED.status,
      avatar_url = EXCLUDED.avatar_url,
      member_id_number = EXCLUDED.member_id_number,
      rsbsa_number = EXCLUDED.rsbsa_number,
      is_rsbsa_registered = EXCLUDED.is_rsbsa_registered,
      mfa_enabled = COALESCE(users.mfa_enabled, EXCLUDED.mfa_enabled);
  `, [
          resolvedId, cleanUsername, '', cleanName, targetRole, isApproved,
          cleanDateString(u.joinedDate, 50), cleanText(u.farmLocation, 200),
          cleanTextList(u.primaryCrops), cleanText(u.contactNumber, 50), u.status === 'Inactive' ? 'Inactive' : 'Active',
          safeImageUrl(u.avatarUrl), cleanText(u.memberIdNumber, 100), cleanText(u.rsbsaNumber, 100),
          Boolean(u.isRsbsaRegistered),
          // MFA is enabled by enrollment only (auth endpoints), never by a sync row.
          false,
          !isNewAccount && u.roleAuthorized === true
        ]);
      }
      console.log('[DB DEBUG] Users saved');
    }

    // 2. Members (filtered to never re-insert deleted members)
    if (state.members && Array.isArray(state.members)) {
      const activeMembers = state.members.filter((m: any) => !deletedMemberIds.has(m.id));
      console.log('[DB DEBUG] Saving', activeMembers.length, 'members...');
      for (const m of activeMembers) {
        if (!m || typeof m.id !== 'string' || !m.id) continue;
        const memberName = cleanText(m.name, 200);
        if (!memberName) continue;
        await client.query(`
          INSERT INTO members(id, name, farm_location, primary_crops, contact_number, status, joined_date, member_id_number, rsbsa_number, is_rsbsa_registered, avatar_url, gender, birth_date)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
    farm_location = EXCLUDED.farm_location,
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
          m.id, memberName, cleanText(m.farmLocation, 200),
          cleanTextList(m.primaryCrops), cleanText(m.contactNumber, 50), m.status === 'Inactive' ? 'Inactive' : 'Active',
          cleanDateString(m.joinedDate, 50), cleanText(m.memberIdNumber, 100), cleanText(m.rsbsaNumber, 100),
          Boolean(m.isRsbsaRegistered), safeImageUrl(m.avatarUrl), cleanText(m.gender, 20),
          cleanDateString(m.birthDate, 50)
        ]);
      }
      console.log('[DB DEBUG] Members saved');
    }

    // 2b. Pending Members (Unconfirmed registrations awaiting Secretary approval or Treasurer fee confirmation)
    const rawPendingMembers = state.pendingMembers || state.pending_members;
    if (rawPendingMembers && Array.isArray(rawPendingMembers)) {
      const confirmedMembersRes = await client.query('SELECT id, lower(trim(name)) AS norm_name FROM members');
      const confirmedIds = new Set<string>(
        confirmedMembersRes.rows.map((r: any) => String(r.id || '').trim()).filter(Boolean)
      );
      const confirmedNames = new Set<string>(
        confirmedMembersRes.rows.map((r: any) => String(r.norm_name || '').trim()).filter(Boolean)
      );
      if (Array.isArray(state.members)) {
        for (const m of state.members) {
          if (m?.id && !deletedMemberIds.has(m.id)) {
            confirmedIds.add(String(m.id).trim());
            const n = cleanText(m.name, 200)?.trim().toLowerCase();
            if (n) confirmedNames.add(n);
          }
        }
      }
      const activePending = rawPendingMembers.filter((pm: any) => {
        if (!pm?.id || deletedPendingMemberIds.has(pm.id)) return false;
        const pmId = String(pm.id).trim();
        const pmName = (cleanText(pm.name, 200) || '').trim().toLowerCase();
        return !confirmedIds.has(pmId) && !(pmName && confirmedNames.has(pmName));
      });
      for (const pm of activePending) {
        const pmName = cleanText(pm.name, 200);
        if (!pmName) continue;
        await client.query(`
          INSERT INTO pending_members(
            id, name, username, farm_location, primary_crops, contact_number, joined_date,
            rsbsa_number, is_rsbsa_registered, avatar_url, gender, birth_date, affiliations,
            registration_status, approved_by_secretary, approved_by_secretary_date
          )
          VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            username = COALESCE(EXCLUDED.username, pending_members.username),
            farm_location = EXCLUDED.farm_location,
            primary_crops = EXCLUDED.primary_crops,
            contact_number = EXCLUDED.contact_number,
            joined_date = EXCLUDED.joined_date,
            rsbsa_number = EXCLUDED.rsbsa_number,
            is_rsbsa_registered = EXCLUDED.is_rsbsa_registered,
            avatar_url = EXCLUDED.avatar_url,
            gender = EXCLUDED.gender,
            birth_date = EXCLUDED.birth_date,
            affiliations = EXCLUDED.affiliations,
            registration_status = EXCLUDED.registration_status,
            approved_by_secretary = EXCLUDED.approved_by_secretary,
            approved_by_secretary_date = EXCLUDED.approved_by_secretary_date;
        `, [
          pm.id,
          pmName,
          cleanText(pm.username, 100),
          cleanText(pm.farmLocation, 200),
          cleanTextList(pm.primaryCrops),
          cleanText(pm.contactNumber, 50),
          cleanDateString(pm.joinedDate, 50),
          cleanText(pm.rsbsaNumber, 100),
          Boolean(pm.isRsbsaRegistered),
          safeImageUrl(pm.avatarUrl),
          cleanText(pm.gender, 20),
          cleanDateString(pm.birthDate, 50),
          JSON.stringify(Array.isArray(pm.affiliations) ? pm.affiliations : []),
          pm.registrationStatus === 'Awaiting Treasurer Fee' ? 'Awaiting Treasurer Fee' : 'Pending Secretary Approval',
          cleanText(pm.approvedBySecretary, 200),
          cleanDateString(pm.approvedBySecretaryDate, 50)
        ]);
      }
      // Always purge any pending_members rows that already exist in confirmed `members`.
      await client.query(`
        DELETE FROM pending_members pm
        WHERE EXISTS (
          SELECT 1 FROM members m
          WHERE m.id = pm.id
             OR lower(trim(m.name)) = lower(trim(pm.name))
        );
      `);
    }
    // A President push carries approval-only rows (id + presidentApproval*). Those
    // must update the sign-off columns and nothing else, so the Treasurer's
    // amounts and fund sources are never overwritten by an approval action.
    const rawTxList = state.financialTransactions || state.transactions;
    if (rawTxList && Array.isArray(rawTxList) && state.auditorReviewOnly === true) {
      // Auditor step: verify the ledger entry. Amounts and fund sources are untouched.
      for (const tx of rawTxList) {
        if (!tx?.id || deletedTxIds.has(tx.id)) continue;
        await client.query(`
          UPDATE financial_transactions SET
  audited_status = COALESCE($2, audited_status),
    audited_by = COALESCE($3, audited_by),
    audited_date = COALESCE($4, audited_date),
    audit_notes = COALESCE($5, audit_notes)
          WHERE id = $1;
  `, [
          tx.id, tx.auditedStatus || null, tx.auditedBy || null,
          tx.auditedDate || null, tx.auditNotes || null
        ]);
      }
      console.log('[DB DEBUG] Auditor financial reviews saved');
    } else if (rawTxList && Array.isArray(rawTxList) && state.presidentApprovalOnly === true) {
      // President step: only records the Auditor has already verified may be signed off.
      for (const tx of rawTxList) {
        if (!tx?.id || deletedTxIds.has(tx.id)) continue;
        await client.query(`
          UPDATE financial_transactions SET
  president_approval_status = COALESCE($2, president_approval_status),
    president_approved_by = COALESCE($3, president_approved_by),
    president_approved_date = COALESCE($4, president_approved_date),
    president_approval_remarks = COALESCE($5, president_approval_remarks)
          WHERE id = $1 AND audited_status = 'Audited';
  `, [
          tx.id, tx.presidentApprovalStatus || null, tx.presidentApprovedBy || null,
          tx.presidentApprovedDate || null, tx.presidentApprovalRemarks || null
        ]);
      }
      console.log('[DB DEBUG] President financial approvals saved');
    } else if (rawTxList && Array.isArray(rawTxList)) {
      const txList = rawTxList.filter((tx: any) => !deletedTxIds.has(tx.id));
      const pendingActivityIds = new Set<string>(
        (Array.isArray(state.activities) ? state.activities : [])
          .filter((activity: any) =>
            activity?.id
            && !deletedActivityIds.has(activity.id)
            && cleanText(activity.title, 300)
          )
          .map((activity: any) => activity.id)
      );
      let existingActivityIds: Set<string> | null = null;
      let existingMeetingIds: Set<string> | null = null;
      console.log('[DB DEBUG] Saving', txList.length, 'transactions...');
      for (const tx of txList) {
        if (!tx || typeof tx.id !== 'string' || !tx.id) continue;
        // Ledger rows are the highest-integrity records: unknown entry types are
        // refused, amounts must be a finite non-negative number and text fields
        // are stripped of markup before they reach the books.
        const txType = String(tx.type || '').toLowerCase();
        if (txType !== 'income' && txType !== 'expense') continue;
        const txAmount = Number(tx.amount);
        if (!Number.isFinite(txAmount) || txAmount < 0) continue;
        let activityId = cleanText(tx.activityId, 100);
        if (activityId && !pendingActivityIds.has(activityId)) {
          if (!existingActivityIds) {
            const existingActivities = await client.query('SELECT id FROM activities');
            existingActivityIds = new Set(existingActivities.rows.map((row: any) => String(row.id)));
          }
          if (!existingActivityIds.has(activityId)) activityId = null;
        }
        let meetingId = cleanText(tx.meetingId, 100);
        if (meetingId) {
          if (!existingMeetingIds) {
            const existingMeetings = await client.query('SELECT id FROM meetings');
            existingMeetingIds = new Set(existingMeetings.rows.map((row: any) => String(row.id)));
          }
          if (!existingMeetingIds.has(meetingId)) meetingId = null;
        }
        await client.query(`
          INSERT INTO financial_transactions (id, type, category, amount, date, description, recorded_by, activity_id, fund_source, purpose, liquidation_deadline, audited_status, audited_by, audited_date, audit_notes, meeting_id)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
    category = EXCLUDED.category,
    amount = EXCLUDED.amount,
    date = EXCLUDED.date,
    description = EXCLUDED.description,
    recorded_by = EXCLUDED.recorded_by,
    activity_id = EXCLUDED.activity_id,
    fund_source = EXCLUDED.fund_source,
    purpose = COALESCE(EXCLUDED.purpose, financial_transactions.purpose),
    liquidation_deadline = COALESCE(EXCLUDED.liquidation_deadline, financial_transactions.liquidation_deadline),
    audited_status = EXCLUDED.audited_status,
    audited_by = EXCLUDED.audited_by,
    audited_date = EXCLUDED.audited_date,
    audit_notes = EXCLUDED.audit_notes,
    meeting_id = EXCLUDED.meeting_id;
  `, [
          tx.id, txType === 'income' ? 'income' : 'expense', cleanText(tx.category, 100) || 'Uncategorized',
          cleanNumber(txAmount), cleanDateString(tx.date, 50), cleanText(tx.description, 2000),
          cleanText(tx.recordedBy, 200), activityId, cleanText(tx.fundSource, 200),
          cleanText(tx.purpose, 2000), cleanDateString(tx.liquidationDeadline, 50),
          AUDITED_STATUSES.includes(String(tx.auditedStatus)) ? String(tx.auditedStatus) : 'Unaudited',
          cleanText(tx.auditedBy, 200), cleanDateString(tx.auditedDate, 50), cleanText(tx.auditNotes, 2000),
          meetingId
        ]);
      }
      console.log('[DB DEBUG] Transactions saved');
    }

    // 4. Meetings (filtered to never re-insert deleted meetings)
    if (state.meetings && Array.isArray(state.meetings)) {
      const activeMeetings = state.meetings.filter((mt: any) => !deletedMeetingIds.has(mt.id));
      console.log('[DB DEBUG] Saving', activeMeetings.length, 'meetings...');
      for (const mt of activeMeetings) {
        if (!mt || typeof mt.id !== 'string' || !mt.id) continue;
        const meetingTitle = cleanText(mt.title, 300);
        if (!meetingTitle) continue;
        await client.query(`
          INSERT INTO meetings (id, title, date, location, attendance_count, agenda, minutes, officer_in_charge, attendance_record, minutes_approval_status, approved_by, approved_date, approval_remarks)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
    date = EXCLUDED.date,
    location = EXCLUDED.location,
    attendance_count = EXCLUDED.attendance_count,
    agenda = EXCLUDED.agenda,
    minutes = EXCLUDED.minutes,
    officer_in_charge = EXCLUDED.officer_in_charge,
    attendance_record = EXCLUDED.attendance_record,
    minutes_approval_status = COALESCE(EXCLUDED.minutes_approval_status, meetings.minutes_approval_status),
    approved_by = COALESCE(EXCLUDED.approved_by, meetings.approved_by),
    approved_date = COALESCE(EXCLUDED.approved_date, meetings.approved_date),
    approval_remarks = COALESCE(EXCLUDED.approval_remarks, meetings.approval_remarks);
  `, [
          mt.id, meetingTitle, cleanDateString(mt.date, 50), cleanText(mt.location, 200),
          Math.min(Math.max(0, Math.floor(Number(mt.attendanceCount) || 0)), 100000),
          cleanText(mt.agenda, 20000) || '', cleanText(mt.minutes, 20000) || '', cleanText(mt.officerInCharge, 200) || '',
          JSON.stringify(mt.attendanceRecord && typeof mt.attendanceRecord === 'object' ? mt.attendanceRecord : {}),
          cleanText(mt.minutesApprovalStatus, 50), cleanText(mt.approvedBy, 200),
          cleanDateString(mt.approvedDate, 50), cleanText(mt.approvalRemarks, 2000)
        ]);
      }
      console.log('[DB DEBUG] Meetings saved');
    }

    // 5. AFA IGP State (reformatted afa_igp + normalized afa_igp_livestocks & afa_igp_harvests)
    if (state.livestockIgp) {
      console.log('[DB DEBUG] Saving AFA IGP state...');
      const legacyBreakdown = state.livestockIgp.herdBreakdown;
      const legacyInventory = legacyBreakdown && typeof legacyBreakdown === 'object'
        ? [
          {
            produce: 'Swine Raising (Baboyan)',
            stageBreakdown: {
              Fattening: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.fattening))),
              Gestation: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.gestation))),
              Lactating: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.lactating))),
              Dispersal: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.dispersal)))
            }
          },
          {
            produce: 'Cattle Raising (Bakahan)',
            stageBreakdown: {
              Fattening: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.cattleFattening))),
              Dispersal: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.cattleDispersal)))
            }
          },
          {
            produce: 'Poultry Raising (RTL)',
            stageBreakdown: { RTL: Math.max(0, Math.floor(cleanNumber(legacyBreakdown.rtlCount))) }
          }
        ]
        : undefined;
      const explicitInventory = Array.isArray(state.livestockIgp.livestockInventory)
        ? state.livestockIgp.livestockInventory
        : legacyInventory;
      const derivedInventory = Array.isArray(state.livestockIgp.expenses)
        ? deriveIgpLivestockInventory(
          state.livestockIgp.expenses,
          Array.isArray(state.livestockIgp.sales) ? state.livestockIgp.sales : [],
          state.livestockIgp.produces?.[0]
        )
        : [];
      const livestockInventory = (() => {
        if (!explicitInventory && derivedInventory.length === 0) return undefined;
        const byProduce = new Map<string, IgpLivestockInventory>();
        for (const item of explicitInventory || []) {
          if (item?.produce) byProduce.set(item.produce, item);
        }
        for (const item of derivedInventory) {
          if (item?.produce) byProduce.set(item.produce, item);
        }
        return Array.from(byProduce.values());
      })();
      const eggHarvests = Array.isArray(state.livestockIgp.eggHarvests)
        ? state.livestockIgp.eggHarvests
        : Array.isArray(state.livestockIgp.choreLogs)
          ? state.livestockIgp.choreLogs
          : undefined;

      await client.query(`
        INSERT INTO afa_igp (id, produces, closed_years)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          produces = EXCLUDED.produces,
          closed_years = COALESCE(EXCLUDED.closed_years, afa_igp.closed_years);
      `, [
        'main_state',
        state.livestockIgp.produces || [],
        Array.isArray(state.livestockIgp.closedYears) ? state.livestockIgp.closedYears : null
      ]);
      await client.query("DELETE FROM afa_igp WHERE id != 'main_state'");
      if (livestockInventory) {
        await saveIgpLivestock(client, livestockInventory);
      }
      if (Array.isArray(state.livestockIgp.expenses)) {
        await saveIgpExpenseSegments(
          client,
          state.livestockIgp.expenses,
          state.livestockIgp.produces?.[0]
        );
      }
      if (Array.isArray(state.livestockIgp.sales)) {
        await saveIgpSales(client, state.livestockIgp.sales);
      }
      if (eggHarvests && eggHarvests.length > 0) await saveIgpHarvests(client, eggHarvests);
      console.log('[DB DEBUG] AFA IGP state saved');
    }

    if (Array.isArray(state.eggHarvests) && !state.livestockIgp) {
      let eggHarvests = state.eggHarvests;
      if (state.appendEggHarvests) {
        const existing = await client.query('SELECT id FROM afa_igp_harvests');
        const existingIds = new Set(existing.rows.map((row: any) => row?.id));
        eggHarvests = eggHarvests.filter((harvest: any) => !existingIds.has(harvest?.id));
      }
      await saveIgpHarvests(client, eggHarvests);
    }

    // 6. System Logs
    const logList = state.systemLogs || state.logs;
    if (logList && Array.isArray(logList)) {
      console.log('[DB DEBUG] Saving', logList.length, 'system logs...');
      for (const lg of logList) {
        await client.query(`
          INSERT INTO system_logs(id, timestamp, user_name, role, action, details, sync_status, hash, previous_hash)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          lg.id, cleanDateString(lg.timestamp, 100), cleanText((lg as any).user || (lg as any).userName, 200) || 'Officer',
          cleanText(lg.role, 50), cleanText(lg.action, 300), cleanText(lg.details, 4000),
          lg.syncStatus === 'pending' ? 'pending' : 'synced',
          /^[a-f0-9]{64}$/i.test(String(lg.hash || '')) ? String(lg.hash) : null,
          /^[a-f0-9]{1,64}$/i.test(String(lg.previousHash || '')) ? String(lg.previousHash) : null
        ]);
      }
      console.log('[DB DEBUG] System logs saved');
    }

    // 7. Products (filtered to never re-insert deleted products)
    if (state.products && Array.isArray(state.products)) {
      const activeProducts = state.products.filter((p: any) => !deletedProductIds.has(p.id));
      console.log('[DB DEBUG] Saving', activeProducts.length, 'products...');
      for (const p of activeProducts) {
        if (!p || typeof p.id !== 'string' || !p.id || !cleanText(p.name, 300)) continue;
        await client.query(`
          INSERT INTO products(id, name, ceb_name, category, description, unit, price, quantity_available, stock_status, farmer_name, farmer_sitio, farmer_phone, contact_person, image_url, is_published, updated_by, managed_by, date_updated)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
          p.id, cleanText(p.name, 300) || 'Unnamed product', cleanText(p.cebName, 300), cleanText(p.category, 100),
          cleanText(p.description, 5000), cleanText(p.unit, 50), cleanNumber(p.price), cleanText(p.quantityAvailable, 100),
          cleanText(p.stockStatus, 50), cleanText(p.farmerName, 200), cleanText(p.farmerSitio, 200), cleanText(p.farmerPhone, 50),
          cleanText(p.contactPerson, 200), safeImageUrl(p.imageUrl), p.isPublished !== false,
          cleanText(p.updatedBy, 200), cleanText(p.managedBy, 200), cleanDateString(p.dateUpdated, 50)
        ]);
      }
      console.log('[DB DEBUG] Products saved');
    }

    // 8. Resolutions (filtered to never re-insert deleted resolutions)
    if (state.resolutions && Array.isArray(state.resolutions)) {
      const activeResolutions = state.resolutions.filter((r: any) => !deletedResolutionIds.has(r.id));
      console.log('[DB DEBUG] Saving', activeResolutions.length, 'resolutions...');
      for (const r of activeResolutions) {
        if (!r || typeof r.id !== 'string' || !r.id) continue;
        if (!cleanText(r.resolutionNumber, 100) || !cleanText(r.title, 300)) continue;
        await client.query(`
          INSERT INTO resolutions(id, resolution_number, title, description, date_agreed, moved_by, seconded_by, vote_in_favor, vote_against, vote_abstain, status)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          r.id, cleanText(r.resolutionNumber, 100), cleanText(r.title, 300), cleanText(r.description, 20000),
          cleanDateString(r.dateAgreed, 50), cleanText(r.movedBy, 200), cleanText(r.secondedBy, 200),
          Math.floor(cleanNumber(r.voteInFavor, 100000)), Math.floor(cleanNumber(r.voteAgainst, 100000)),
          Math.floor(cleanNumber(r.voteAbstain, 100000)), cleanText(r.status, 50)
        ]);
      }
      console.log('[DB DEBUG] Resolutions saved');
    }

    // 9. Announcements (filtered to never re-insert deleted announcements)
    if (state.announcements && Array.isArray(state.announcements)) {
      const activeAnnouncements = state.announcements.filter((a: any) => !deletedAnnouncementIds.has(a.id));
      console.log('[DB DEBUG] Saving', activeAnnouncements.length, 'announcements...');
      for (const a of activeAnnouncements) {
        if (!a || typeof a.id !== 'string' || !a.id) continue;
        const announcementTitle = cleanText(a.title, 300);
        if (!announcementTitle) continue;
        await client.query(`
          INSERT INTO announcements(id, title, category, content, date_posted, priority, posted_by)
  VALUES($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
    category = EXCLUDED.category,
    content = EXCLUDED.content,
    date_posted = EXCLUDED.date_posted,
    priority = EXCLUDED.priority,
    posted_by = EXCLUDED.posted_by;
  `, [
          a.id, announcementTitle, cleanText(a.category, 100), cleanText(a.content, 20000),
          cleanDateString(a.datePosted, 50), cleanText(a.priority, 50), cleanText(a.postedBy, 200)
        ]);
      }
      console.log('[DB DEBUG] Announcements saved');
    }

    // 10. Activities (filtered to never re-insert deleted activities)
    if (state.activities && Array.isArray(state.activities)) {
      const activeActivities = state.activities.filter((act: any) => !deletedActivityIds.has(act.id));
      console.log('[DB DEBUG] Saving', activeActivities.length, 'activities...');
      for (const act of activeActivities) {
        if (!act || typeof act.id !== 'string' || !act.id) continue;
        const activityTitle = cleanText(act.title, 300);
        if (!activityTitle) continue;
        await client.query(`
          INSERT INTO activities(id, title, ceb_title, category, scheduled_date, date_scheduled, scheduled_time, time_scheduled, location, description, organizer, status, status_reason, documented_notes, attendees_count, target_audience, image_url)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
    status_reason = EXCLUDED.status_reason,
    documented_notes = EXCLUDED.documented_notes,
    attendees_count = EXCLUDED.attendees_count,
    target_audience = EXCLUDED.target_audience,
    image_url = EXCLUDED.image_url;
  `, [
          act.id, activityTitle, cleanText(act.cebTitle, 300), cleanText(act.category, 100),
          cleanDateString(act.scheduledDate || act.dateScheduled, 50),
          cleanDateString(act.dateScheduled || act.scheduledDate, 50),
          cleanText(act.scheduledTime || act.timeScheduled, 100),
          cleanText(act.timeScheduled || act.scheduledTime, 100),
          cleanText(act.location, 200), cleanText(act.description, 20000), cleanText(act.organizer, 200), cleanText(act.status, 50),
          cleanText(act.statusReason, 1000), cleanText(act.documentedNotes, 20000),
          Math.min(Math.max(0, Math.floor(Number(act.attendeesCount) || 0)), 100000),
          cleanText(act.targetAudience, 300), safeImageUrl(act.imageUrl)
        ]);
      }
      console.log('[DB DEBUG] Activities saved');
    }

    // 11. Organization Funds (filtered to never re-insert deleted funds)
    const rawFundList = state.organizationFunds || state.funds;
    if (rawFundList && Array.isArray(rawFundList)) {
      const fundList = rawFundList.filter((f: any) => !deletedFundIds.has(f.id));
      console.log('[DB DEBUG] Saving', fundList.length, 'organization funds...');
      for (const f of fundList) {
        if (!f || typeof f.id !== 'string' || !f.id) continue;
        const fundName = cleanText(f.name, 200);
        if (!fundName) continue;
        // A fund code is printed on statements; keep it short and alphanumeric.
        const fundCode = (cleanText(f.code, 50) || fundName).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'FUND';
        await client.query(`
          INSERT INTO organization_funds(id, name, code, initial_fund, current_balance, description, custodian, last_updated, category, source_origin)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
    code = EXCLUDED.code,
    initial_fund = EXCLUDED.initial_fund,
    current_balance = EXCLUDED.current_balance,
    description = EXCLUDED.description,
    custodian = EXCLUDED.custodian,
    last_updated = EXCLUDED.last_updated,
    category = EXCLUDED.category,
    source_origin = EXCLUDED.source_origin;
  `, [
          f.id, fundName, fundCode, cleanNumber(getInitialFund(f)), cleanNumber(f.currentBalance),
          cleanText(f.description, 2000) || '', cleanText(f.custodian, 200) || '',
          cleanDateString(f.lastUpdated, 50) || new Date().toISOString().split('T')[0],
          cleanText(f.category, 100), cleanText(f.source, 200)
        ]);
      }
      console.log('[DB DEBUG] Organization funds saved');
    }

    // 12. Membership dues ledger. Receipts are upserted; removing one is done by
    // marking it Voided, so the audit trail survives a correction.
    if (state.membershipPayments && Array.isArray(state.membershipPayments)) {
      const activePayments = state.membershipPayments.filter((p: any) =>
        p && typeof p.id === 'string' && !deletedMembershipPaymentIds.has(p.id)
      );
      console.log('[DB DEBUG] Saving', activePayments.length, 'membership payments...');
      for (const p of activePayments) {
        const year = Math.floor(cleanNumber(p.year));
        if (!year || year < 2000 || year > 2100) continue;
        await client.query(`
          INSERT INTO membership_payments(id, member_id, member_name, member_id_number, year, amount, date_paid, method, reference_no, status, recorded_by, recorded_at, verified_by, verified_date, voided_by, voided_date, void_reason, notes, transaction_id)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          ON CONFLICT (id) DO UPDATE SET
  member_id = EXCLUDED.member_id,
    member_name = EXCLUDED.member_name,
    member_id_number = EXCLUDED.member_id_number,
    year = EXCLUDED.year,
    amount = EXCLUDED.amount,
    date_paid = EXCLUDED.date_paid,
    method = EXCLUDED.method,
    reference_no = EXCLUDED.reference_no,
    status = EXCLUDED.status,
    recorded_by = EXCLUDED.recorded_by,
    recorded_at = EXCLUDED.recorded_at,
    verified_by = EXCLUDED.verified_by,
    verified_date = EXCLUDED.verified_date,
    voided_by = EXCLUDED.voided_by,
    voided_date = EXCLUDED.voided_date,
    void_reason = EXCLUDED.void_reason,
    notes = EXCLUDED.notes,
    transaction_id = EXCLUDED.transaction_id;
  `, [
          p.id, cleanText(p.memberId, 100), cleanText(p.memberName, 200) || 'Member',
          cleanText(p.memberIdNumber, 100), year, cleanNumber(p.amount),
          cleanDateString(p.datePaid, 50), cleanText(p.method, 50) || 'Cash', cleanText(p.referenceNo, 100),
          ['Pending', 'Verified', 'Voided'].includes(String(p.status)) ? p.status : 'Pending',
          cleanText(p.recordedBy, 200), cleanDateString(p.recordedAt, 50),
          cleanText(p.verifiedBy, 200), cleanDateString(p.verifiedDate, 50),
          cleanText(p.voidedBy, 200), cleanDateString(p.voidedDate, 50),
          cleanText(p.voidReason, 2000), cleanText(p.notes, 2000), cleanText(p.transactionId, 100)
        ]);
      }
    }

    // 14. Closed membership years. One immutable roster per year.
    if (state.membershipYearSnapshots && Array.isArray(state.membershipYearSnapshots)) {
      for (const snap of state.membershipYearSnapshots) {
        const year = Math.floor(cleanNumber(snap.year));
        if (!year || year < 2000 || year > 2100) continue;
        await client.query(`
          INSERT INTO membership_year_snapshots(year, closed_by, closed_at, dues_amount, total_members, paid_members, unpaid_members, total_collected, listed_members, unpaid_member_ids, remarks)
  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT(year) DO NOTHING;
  `, [
          year, cleanText(snap.closedBy, 200), cleanDateString(snap.closedAt, 50), cleanNumber(snap.duesAmount),
          Math.floor(cleanNumber(snap.totalMembers)), Math.floor(cleanNumber(snap.paidMembers)),
          Math.floor(cleanNumber(snap.unpaidMembers)), cleanNumber(snap.totalCollected),
          JSON.stringify(Array.isArray(snap.listedMembers) ? snap.listedMembers : []),
          JSON.stringify(Array.isArray(snap.unpaidMemberIds) ? snap.unpaidMemberIds : []),
          cleanText(snap.remarks, 2000)
        ]);
      }
    }

    const saveMappings: SaveMapping[] = [
      {
        table: 'members', deletedIds: deletedMemberIds, fields: [
          ['name', 'name', (r) => r.name], ['farm_location', 'farmLocation', (r) => r.farmLocation || null],
          ['primary_crops', 'primaryCrops', (r) => r.primaryCrops || []], ['contact_number', 'contactNumber', (r) => r.contactNumber || null],
          ['status', 'status', (r) => r.status || 'Active'], ['joined_date', 'joinedDate', (r) => r.joinedDate || null],
          ['member_id_number', 'memberIdNumber', (r) => r.memberIdNumber || null], ['rsbsa_number', 'rsbsaNumber', (r) => r.rsbsaNumber || null],
          ['is_rsbsa_registered', 'isRsbsaRegistered', (r) => Boolean(r.isRsbsaRegistered)], ['avatar_url', 'avatarUrl', (r) => r.avatarUrl || null],
          ['gender', 'gender', (r) => r.gender || null], ['birth_date', 'birthDate', (r) => r.birthDate || null],
          ['membership_paid_through', 'membershipPaidThrough', (r) => r.membershipPaidThrough == null ? null : Math.floor(cleanNumber(r.membershipPaidThrough))],
          ['inactive_reason', 'inactiveReason', (r) => r.inactiveReason ? cleanText(r.inactiveReason, 500) : null]
        ]
      },
      {
        table: 'meetings', deletedIds: deletedMeetingIds, fields: [
          ['title', 'title', (r) => r.title], ['date', 'date', (r) => r.date], ['location', 'location', (r) => r.location],
          ['attendance_count', 'attendanceCount', (r) => r.attendanceCount || 0], ['agenda', 'agenda', (r) => r.agenda || ''],
          ['minutes', 'minutes', (r) => r.minutes || ''], ['officer_in_charge', 'officerInCharge', (r) => r.officerInCharge || ''],
          ['attendance_record', 'attendanceRecord', (r) => JSON.stringify(r.attendanceRecord || {})]
        ]
      },
      {
        table: 'system_logs', deletedIds: new Set(), fields: [
          ['timestamp', 'timestamp', (r) => r.timestamp], ['user_name', 'user', (r) => r.user || r.userName || 'Officer'],
          ['role', 'role', (r) => r.role], ['action', 'action', (r) => r.action], ['details', 'details', (r) => r.details],
          ['sync_status', 'syncStatus', (r) => r.syncStatus || 'synced'], ['hash', 'hash', (r) => r.hash || null], ['previous_hash', 'previousHash', (r) => r.previousHash || null]
        ]
      },
      {
        table: 'products', deletedIds: deletedProductIds, fields: [
          ['name', 'name', (r) => r.name], ['ceb_name', 'cebName', (r) => r.cebName || null], ['category', 'category', (r) => r.category],
          ['description', 'description', (r) => r.description], ['unit', 'unit', (r) => r.unit], ['price', 'price', (r) => r.price],
          ['quantity_available', 'quantityAvailable', (r) => r.quantityAvailable || null], ['stock_status', 'stockStatus', (r) => r.stockStatus],
          ['farmer_name', 'farmerName', (r) => r.farmerName || null], ['farmer_sitio', 'farmerSitio', (r) => r.farmerSitio || null],
          ['farmer_phone', 'farmerPhone', (r) => r.farmerPhone || null], ['contact_person', 'contactPerson', (r) => r.contactPerson || null],
          ['image_url', 'imageUrl', (r) => r.imageUrl || null], ['is_published', 'isPublished', (r) => r.isPublished ?? true],
          ['updated_by', 'updatedBy', (r) => r.updatedBy || null], ['managed_by', 'managedBy', (r) => r.managedBy || null], ['date_updated', 'dateUpdated', (r) => r.dateUpdated || null]
        ]
      },
      {
        table: 'activities', deletedIds: deletedActivityIds, fields: [
          ['title', 'title', (r) => r.title], ['ceb_title', 'cebTitle', (r) => r.cebTitle || null], ['category', 'category', (r) => r.category],
          ['scheduled_date', 'scheduledDate', (r) => r.scheduledDate || r.dateScheduled || null], ['date_scheduled', 'dateScheduled', (r) => r.dateScheduled || r.scheduledDate || null],
          ['scheduled_time', 'scheduledTime', (r) => r.scheduledTime || r.timeScheduled || null], ['time_scheduled', 'timeScheduled', (r) => r.timeScheduled || r.scheduledTime || null],
          ['location', 'location', (r) => r.location], ['description', 'description', (r) => r.description], ['organizer', 'organizer', (r) => r.organizer],
          ['status', 'status', (r) => r.status], ['status_reason', 'statusReason', (r) => r.statusReason || null],
          ['documented_notes', 'documentedNotes', (r) => r.documentedNotes || null],
          ['attendees_count', 'attendeesCount', (r) => r.attendeesCount || 0], ['target_audience', 'targetAudience', (r) => r.targetAudience || null], ['image_url', 'imageUrl', (r) => r.imageUrl || null]
        ]
      },
      {
        table: 'inventory', deletedIds: deletedInventoryIds, fields: [
          ['name', 'name', (r) => cleanText(r.name, 300) || 'Unnamed inventory item'],
          ['asset_type', 'assetType', (r) => (r.assetType === 'rental' || r.category === 'Rental Assets' || Boolean(r.catalogProductId)) ? 'rental' : 'usable'],
          ['category', 'category', (r) => cleanText(r.category, 100) || 'Other'],
          ['quantity', 'quantity', (r) => Math.floor(cleanNumber(r.quantity))],
          ['damaged_quantity', 'damagedQuantity', (r) => Math.min(
            Math.floor(cleanNumber(r.quantity)),
            Math.floor(cleanNumber(r.damagedQuantity))
          )],
          ['lost_quantity', 'lostQuantity', (r) => Math.min(
            Math.floor(cleanNumber(r.quantity)),
            Math.floor(cleanNumber(r.lostQuantity))
          )],
          ['used_quantity', 'usedQuantity', (r) => Math.min(
            Math.floor(cleanNumber(r.quantity)),
            Math.floor(cleanNumber(r.usedQuantity))
          )],
          ['unit', 'unit', (r) => cleanText(r.unit, 50) || 'units'],
          ['item_condition', 'condition', (r) => cleanText(r.condition, 50) || 'Good'],
          ['location', 'location', (r) => cleanText(r.location, 500)],
          ['notes', 'notes', (r) => cleanText(r.notes, 5000)],
          ['catalog_product_id', 'catalogProductId', (r) => cleanText(r.catalogProductId, 100)],
          ['purchase_transaction_id', 'purchaseTransactionId', (r) => cleanText(r.purchaseTransactionId, 100)],
          ['activity_id', 'activityId', (r) => cleanText(r.activityId, 100)],
          ['meeting_id', 'meetingId', (r) => cleanText(r.meetingId, 100)],
          ['recorded_by', 'recordedBy', (r) => cleanText(r.recordedBy, 200) || 'Treasurer'],
          ['date_recorded', 'dateRecorded', (r) => cleanDateString(r.dateRecorded, 50)],
          ['last_updated', 'lastUpdated', (r) => cleanDateString(r.lastUpdated, 50)]
        ]
      },
      {
        table: 'resolutions', deletedIds: deletedResolutionIds, fields: [
          ['resolution_number', 'resolutionNumber', (r) => r.resolutionNumber], ['title', 'title', (r) => r.title], ['description', 'description', (r) => r.description],
          ['date_agreed', 'dateAgreed', (r) => r.dateAgreed], ['moved_by', 'movedBy', (r) => r.movedBy], ['seconded_by', 'secondedBy', (r) => r.secondedBy],
          ['vote_in_favor', 'voteInFavor', (r) => r.voteInFavor], ['vote_against', 'voteAgainst', (r) => r.voteAgainst],
          ['vote_abstain', 'voteAbstain', (r) => r.voteAbstain], ['status', 'status', (r) => r.status]
        ]
      },
      {
        table: 'announcements', deletedIds: deletedAnnouncementIds, fields: [
          ['title', 'title', (r) => r.title], ['category', 'category', (r) => r.category], ['content', 'content', (r) => r.content],
          ['date_posted', 'datePosted', (r) => r.datePosted], ['priority', 'priority', (r) => r.priority], ['posted_by', 'postedBy', (r) => r.postedBy]
        ]
      },
      {
        table: 'achievements', deletedIds: deletedAchievementIds, fields: [
          ['year', 'year', (r) => r.year], ['title', 'title', (r) => r.title], ['ceb_title', 'cebTitle', (r) => r.cebTitle || null],
          ['description', 'description', (r) => r.description], ['icon', 'icon', (r) => r.icon || 'Trophy']
        ]
      },
      {
        table: 'organization_funds', deletedIds: deletedFundIds, fields: [
          ['name', 'name', (r) => r.name], ['code', 'code', (r) => r.code], ['initial_fund', 'initialFund', (r) => getInitialFund(r)],
          ['current_balance', 'currentBalance', (r) => r.currentBalance || 0], ['description', 'description', (r) => r.description || ''],
          ['custodian', 'custodian', (r) => r.custodian || ''], ['last_updated', 'lastUpdated', (r) => r.lastUpdated || new Date().toISOString().split('T')[0]],
          ['category', 'category', (r) => r.category || null], ['source_origin', 'source', (r) => r.source || null]
        ]
      },
      {
        table: 'delegation_requests', deletedIds: deletedDelegationIds, fields: [
          ['requested_by', 'requestedBy', (r) => r.requestedBy], ['reason', 'reason', (r) => r.reason],
          ['scopes', 'scopes', (r) => JSON.stringify(Array.isArray(r.scopes) ? r.scopes : [])], ['requested_date', 'requestedDate', (r) => r.requestedDate],
          ['effective_start', 'effectiveStart', (r) => r.effectiveStart || null], ['effective_end', 'effectiveEnd', (r) => r.effectiveEnd || null],
          ['status', 'status', (r) => r.status || 'Pending'], ['reviewed_by', 'reviewedBy', (r) => r.reviewedBy || null],
          ['reviewed_date', 'reviewedDate', (r) => r.reviewedDate || null], ['remarks', 'remarks', (r) => r.remarks || null]
        ]
      }
    ];

    for (const mapping of saveMappings) {
      const stateKeyByTable: Record<string, string[]> = {
        system_logs: ['systemLogs', 'logs'],
        organization_funds: ['organizationFunds', 'funds'],
        delegation_requests: ['delegationRequests']
      };
      const stateKeys = stateKeyByTable[mapping.table] || [mapping.table];
      let rows = stateKeys.map((key) => state[key]).find(Array.isArray) as any[] | undefined;
      if (Array.isArray(rows) && mapping.table === 'inventory' && rows.length > 0) {
        // Validate optional foreign keys against live DB rows so stale or deleted
        // links gracefully clear to NULL instead of tripping PostgreSQL FK 23503.
        const loadIds = async (sql: string) => {
          const res = await client.query(sql);
          return new Set(res.rows.map((row: any) => String(row.id)));
        };
        const hasCatalogRef = rows.some((r) => cleanText(r?.catalogProductId, 100));
        const hasTxRef = rows.some((r) => cleanText(r?.purchaseTransactionId, 100));
        const hasActRef = rows.some((r) => cleanText(r?.activityId, 100));
        const hasMtgRef = rows.some((r) => cleanText(r?.meetingId, 100));
        const validProductIds = hasCatalogRef ? await loadIds('SELECT id FROM products') : null;
        const validTxIds = hasTxRef ? await loadIds('SELECT id FROM financial_transactions') : null;
        const validActivityIds = hasActRef ? await loadIds('SELECT id FROM activities') : null;
        const validMeetingIds = hasMtgRef ? await loadIds('SELECT id FROM meetings') : null;

        rows = rows.map((r) => {
          if (!r || typeof r !== 'object') return r;
          const catalogProductId = cleanText(r.catalogProductId, 100);
          const purchaseTransactionId = cleanText(r.purchaseTransactionId, 100);
          const activityId = cleanText(r.activityId, 100);
          const meetingId = cleanText(r.meetingId, 100);
          return {
            ...r,
            catalogProductId: catalogProductId && validProductIds?.has(catalogProductId) ? catalogProductId : null,
            purchaseTransactionId: purchaseTransactionId && validTxIds?.has(purchaseTransactionId) ? purchaseTransactionId : null,
            activityId: activityId && validActivityIds?.has(activityId) ? activityId : null,
            meetingId: meetingId && validMeetingIds?.has(meetingId) ? meetingId : null,
          };
        });
      }
      if (Array.isArray(rows)) await saveEntity(client, rows, mapping);
    }

    console.log('[DB DEBUG] Committing transaction...');
    await client.query('COMMIT');
    console.log('[DB DEBUG] Transaction committed successfully');
    return { success: true };
  } catch (err: any) {
    console.error('[DB DEBUG] Transaction failed:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      where: err?.where
    });
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
