// Diagnostic: does a TLS query parameter in the URL override an explicit `ssl`
// option? Connecting to a closed local port means "config survived, then the
// TCP connect failed" (ECONNREFUSED) vs "TLS settings were replaced/threw".
import pg from 'pg';

const { Client } = pg;

async function attempt(label, url, ssl) {
  const client = new Client({ connectionString: url, ssl, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    console.log(`${label}: CONNECTED`);
  } catch (error) {
    console.log(`${label}: ${error.code || 'ERR'} - ${String(error.message).split('\n')[0]}`);
  } finally {
    await client.end().catch(() => { });
  }
}

const wanted = { rejectUnauthorized: false };
await attempt('plain URL            + {rejectUnauthorized:false}', 'postgresql://u:p@127.0.0.1:1/db', wanted);
await attempt('?sslmode=verify-full + {rejectUnauthorized:false}', 'postgresql://u:p@127.0.0.1:1/db?sslmode=verify-full', wanted);
await attempt('?sslmode=verify-full&sslrootcert= + {...}', 'postgresql://u:p@127.0.0.1:1/db?sslmode=verify-full&sslrootcert=', wanted);
await attempt('?sslmode=require     + {rejectUnauthorized:false}', 'postgresql://u:p@127.0.0.1:1/db?sslmode=require', wanted);
