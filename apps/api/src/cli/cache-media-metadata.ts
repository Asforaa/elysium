import { Pool } from 'pg';
import { getDatabaseUrl } from '../database/database.config';
import { DatabaseService } from '../database/database.service';
import { MediaMetadataCacheService } from '../media-library/media-metadata-cache.service';
import { MediaLibraryRepository } from '../media-library/media-library.repository';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const database = new DatabaseService(pool);

  try {
    await database.migrate();

    const repository = new MediaLibraryRepository(database);
    const cache = new MediaMetadataCacheService(repository);
    const results = await cache.cacheAllKnownAnime({
      delayMs: args.delayMs,
      limit: args.limit,
      missingOnly: !args.includeCached,
    });
    const failed = results.filter((result) => !result.cached);

    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          cached: results.filter((result) => result.cached).length,
          failed: failed.length,
          failures: failed.slice(0, 20),
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

function parseArgs(args: string[]) {
  const result: {
    delayMs?: number;
    includeCached?: boolean;
    limit?: number;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--limit' && next) {
      const parsed = Number(next);

      if (Number.isInteger(parsed) && parsed > 0) {
        result.limit = parsed;
      }

      index += 1;
      continue;
    }

    if (arg === '--delay-ms' && next) {
      const parsed = Number(next);

      if (Number.isFinite(parsed) && parsed >= 0) {
        result.delayMs = parsed;
      }

      index += 1;
      continue;
    }

    if (arg === '--include-cached') {
      result.includeCached = true;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media metadata cache failed: ${message}`);
  process.exitCode = 1;
});
