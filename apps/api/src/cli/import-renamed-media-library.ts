import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { Pool } from 'pg';
import { getDatabaseUrl } from '../database/database.config';
import { DatabaseService } from '../database/database.service';
import { importRenamedMediaLibrary } from '../media-library/media-library.importer';
import { MediaLibraryRepository } from '../media-library/media-library.repository';
import { findLatestRenamePlan } from '../media-library/media-library.rename-planner';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const planPath = resolveFromRepoRoot(
    args.plan ?? (await findLatestRenamePlan(repoRoot)) ?? '',
    repoRoot,
  );

  if (!planPath) {
    throw new Error(
      'No rename plan found. Run `bun run --filter @elysium/api library:plan-renames` first or pass `--plan <path>`.',
    );
  }

  const reportDir = resolveFromRepoRoot(
    args.reportDir ??
      process.env.ELYSIUM_LIBRARY_IMPORT_REPORT_DIR ??
      'docs/library-imports',
    repoRoot,
  );
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const database = new DatabaseService(pool);

  try {
    await database.migrate();

    const repository = new MediaLibraryRepository(database);
    const summary = await importRenamedMediaLibrary({
      localRootPath:
        args.root ?? process.env.ELYSIUM_MEDIA_ROOT ?? '/home/asforaa/homeserver/Elysium Media',
      planPath,
      reportDir,
      repository,
      rootKey: args.rootKey ?? 'homeserver-main',
      rootName: args.rootName ?? 'Homeserver Elysium Media',
      serverRootPath:
        args.serverRoot ??
        process.env.ELYSIUM_SERVER_MEDIA_ROOT ??
        '/home/asforaauwu/Elysium Media',
    });

    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
  } finally {
    await pool.end();
  }
}

function resolveFromRepoRoot(value: string, repoRoot: string) {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function findRepoRoot(startPath: string) {
  let current = resolve(startPath);

  for (let depth = 0; depth < 8; depth += 1) {
    if (
      existsSync(join(current, 'turbo.json')) &&
      existsSync(join(current, 'apps')) &&
      existsSync(join(current, 'packages'))
    ) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return resolve(startPath);
}

function parseArgs(args: string[]) {
  const result: {
    plan?: string;
    reportDir?: string;
    root?: string;
    rootKey?: string;
    rootName?: string;
    serverRoot?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--plan' && next) {
      result.plan = next;
      index += 1;
      continue;
    }

    if (arg === '--report-dir' && next) {
      result.reportDir = next;
      index += 1;
      continue;
    }

    if (arg === '--root' && next) {
      result.root = next;
      index += 1;
      continue;
    }

    if (arg === '--server-root' && next) {
      result.serverRoot = next;
      index += 1;
      continue;
    }

    if (arg === '--root-key' && next) {
      result.rootKey = next;
      index += 1;
      continue;
    }

    if (arg === '--root-name' && next) {
      result.rootName = next;
      index += 1;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media library import failed: ${message}`);
  process.exitCode = 1;
});
