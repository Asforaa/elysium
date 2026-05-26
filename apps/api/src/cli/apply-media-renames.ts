import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { applyMediaLibraryRenamePlan } from '../media-library/media-library.rename-applier';
import { findLatestRenamePlan } from '../media-library/media-library.rename-planner';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const planPath = resolveFromRepoRoot(
    args.plan ?? (await findLatestRenamePlan(repoRoot)) ?? '',
    repoRoot,
  );
  const reportDir = resolveFromRepoRoot(
    args.reportDir ??
      process.env.ELYSIUM_RENAME_APPLY_REPORT_DIR ??
      'docs/rename-applies',
    repoRoot,
  );

  if (!planPath) {
    throw new Error(
      'No rename plan found. Run `bun run --filter @elysium/api library:plan-renames` first or pass `--plan <path>`.',
    );
  }

  const { manifest, reports } = await applyMediaLibraryRenamePlan({
    execute: args.execute,
    includeNotes: args.includeNotes,
    planPath,
    reportDir,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: manifest.dryRun,
        includeNotes: manifest.includeNotes,
        planPath,
        reports,
        summary: manifest.summary,
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
    execute?: boolean;
    includeNotes?: boolean;
    plan?: string;
    reportDir?: string;
  } = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--execute') {
      result.execute = true;
      continue;
    }

    if (arg === '--include-notes') {
      result.includeNotes = true;
      continue;
    }

    if (arg === '--plan' && next) {
      result.plan = next;
      index += 1;
      continue;
    }

    if (arg === '--report-dir' && next) {
      result.reportDir = next;
      index += 1;
    }
  }

  return result;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media library rename apply failed: ${message}`);
  process.exitCode = 1;
});
