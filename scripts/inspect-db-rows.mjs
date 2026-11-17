// Read-only diagnostic: lists the rows the guest portal depends on, so we can
// tell "not in the database" apart from "in the database but not rendered".
// Usage: $env:DATABASE_URL="..."; node scripts/inspect-db-rows.mjs
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('SKIP: DATABASE_URL is not set.');
  process.exit(0);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });

try {
  await client.connect();

  const show = async (label, sql) => {
    try {
      const { rows } = await client.query(sql);
      console.log(`\n=== ${label} (${rows.length}) ===`);
      for (const row of rows) console.log(JSON.stringify(row));
    } catch (error) {
      console.log(`\n=== ${label} === ERROR: ${error.message}`);
    }
  };

  await show('users', "SELECT username, name, role, is_approved, status FROM users ORDER BY role, name");
  await show('members', "SELECT id, name, member_id_number, farm_location, status, joined_date FROM members ORDER BY name");
  await show('activities', "SELECT id, title, category, scheduled_date, status FROM activities ORDER BY scheduled_date DESC");
  await show('announcements', "SELECT id, title, category, date_posted, priority FROM announcements ORDER BY date_posted DESC");
} finally {
  await client.end().catch(() => {});
}
