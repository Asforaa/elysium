import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  matchLocalAnimeToAniList,
  writeLocalAnimeMatchReports,
} from '../media-library/anilist-library.matcher';
import { scanMediaLibrary } from '../media-library/media-library.scanner';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const rootPath = resolve(
    args.root ??
      process.env.ELYSIUM_MEDIA_ROOT ??
      '/home/asforaa/homeserver/Elysium Media',
  );
  const reportDir = resolveFromRepoRoot(
    args.reportDir ?? 'docs/match-reports',
    repoRoot,
  );
  const scan = await scanMediaLibrary(rootPath);
  const report = await matchLocalAnimeToAniList({
    delayMs: args.delayMs,
    filter: args.filter,
    limit: args.limit,
    scan,
  });
  const reports = await writeLocalAnimeMatchReports({ report, reportDir });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        reports,
        rootPath,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
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
    delayMs?: number;
    filter?: string;
    limit?: number;
    reportDir?: string;
    root?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--root' && next) {
      result.root = next;
      index += 1;
      continue;
    }

    if (arg === '--report-dir' && next) {
      result.reportDir = next;
      index += 1;
      continue;
    }

    if (arg === '--limit' && next) {
      result.limit = Number(next);
      index += 1;
      continue;
    }

    if (arg === '--filter' && next) {
      result.filter = next;
      index += 1;
      continue;
    }

    if (arg === '--delay-ms' && next) {
      result.delayMs = Number(next);
      index += 1;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`AniList library match failed: ${message}`);
  process.exitCode = 1;
});
