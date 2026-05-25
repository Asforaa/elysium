import { Pool } from 'pg';
import { getDatabaseUrl } from '../database/database.config';
import { DatabaseService } from '../database/database.service';

async function main() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const database = new DatabaseService(pool);

  await database.migrate();
  await pool.end();

  console.log(JSON.stringify({ ok: true, migrated: true }, null, 2));
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
});
