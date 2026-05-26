import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  findLatestAniListMatchReport,
  planMediaLibraryRenames,
} from '../media-library/media-library.rename-planner';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const rootPath = resolve(
    args.root ??
      process.env.ELYSIUM_MEDIA_ROOT ??
      '/home/asforaa/homeserver/Elysium Media',
  );
  const reportDir = resolveFromRepoRoot(
    args.reportDir ??
      process.env.ELYSIUM_RENAME_PLAN_REPORT_DIR ??
      'docs/rename-plans',
    repoRoot,
  );
  const matchReportPath =
    args.matchReport === 'none'
      ? undefined
      : resolveFromRepoRoot(
          args.matchReport ??
            (await findLatestAniListMatchReport(repoRoot)) ??
            '',
          repoRoot,
        );

  if (args.matchReport !== 'none' && !matchReportPath) {
    throw new Error(
      'No AniList match report found. Run `bun run --filter @elysium/api library:match-anilist` first or pass `--match-report none`.',
    );
  }

  const { plan, reports } = await planMediaLibraryRenames({
    matchReportPath,
    reportDir,
    rootPath,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        rootPath,
        matchReportPath,
        reports,
        summary: plan.summary,
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
  const result: { matchReport?: string; reportDir?: string; root?: string } =
    {};

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

    if (arg === '--match-report' && next) {
      result.matchReport = next;
      index += 1;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media library rename planning failed: ${message}`);
  process.exitCode = 1;
});
