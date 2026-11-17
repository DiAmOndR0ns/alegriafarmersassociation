// Diagnostic: shows what connection parameters `pg` would use for a given URL,
// and whether a TLS-related query parameter can override an explicit `ssl` option.
import { parse } from 'pg-connection-string';

const urls = [
  'postgresql://u:p@h:5432/postgres?sslmode=verify-full&sslrootcert=',
  'postgresql://u:p@h:5432/postgres?sslmode=verify-full',
  'postgresql://u:p@h:5432/postgres?sslmode=require',
  'postgresql://u:p@h:5432/postgres?ssl=true',
  'postgresql://u:p@h:5432/postgres',
];

for (const url of urls) {
  const config = parse(url);
  const ssl = config.ssl;
  // `ssl` uses lazy getters (they read sslcert/sslkey/sslrootcert lazily and can
  // throw), so resolve the fields explicitly.
  let summary;
  try {
    if (!ssl) {
      summary = 'falsy (no TLS)';
    } else {
      const ca = ssl.ca;
      summary = JSON.stringify({
        rejectUnauthorized: ssl.rejectUnauthorized,
        ca: ca === undefined ? undefined : ca === '' ? '<EMPTY STRING>' : '<pem>',
        hasCheckServerIdentity: typeof ssl.checkServerIdentity === 'function',
      });
    }
  } catch (error) {
    summary = `THROWS: ${error.message}`;
  }
  console.log(`${url.split('?')[1] ?? '(no params)'}\n    -> ${summary}\n`);
}
