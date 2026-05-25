import { Pool } from 'pg';
import { getDatabaseUrl } from '../database/database.config';

async function main() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const result = await pool.query<{ database: string; version: string }>(
    'select current_database() as database, version() as version',
  );

  await pool.end();

  console.log(JSON.stringify({ ok: true, ...result.rows[0] }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database ping failed: ${message}`);
  process.exitCode = 1;
});
