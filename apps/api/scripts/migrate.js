/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return 'postgresql://music_user:music_pass_dev@localhost:5432/music_rec';
  }
  return url;
}

async function ensureMigrationsTable(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     );`,
  );
}

async function getApplied(client) {
  const res = await client.query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r) => r.filename));
}

function listMigrations(migrationsDir) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files;
}

async function applyMigration(client, filename, sql) {
  console.log(`\n==> Applying migration: ${filename}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [filename],
    );
    await client.query('COMMIT');
    console.log(`✅ Applied: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed: ${filename}`);
    throw err;
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const dbUrl = getDatabaseUrl();

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const files = listMigrations(migrationsDir);

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    for (const f of pending) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
      await applyMigration(client, f, sql);
    }

    console.log(`\n✅ All migrations applied. Count: ${pending.length}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
