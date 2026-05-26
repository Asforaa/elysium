import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  findLatestRenameApplyManifest,
  rollbackMediaLibraryRenameApply,
} from '../media-library/media-library.rename-applier';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot(process.cwd());
  const manifestPath = resolveFromRepoRoot(
    args.manifest ?? (await findLatestRenameApplyManifest(repoRoot)) ?? '',
    repoRoot,
  );
  const reportDir = resolveFromRepoRoot(
    args.reportDir ??
      process.env.ELYSIUM_RENAME_ROLLBACK_REPORT_DIR ??
      'docs/rename-rollbacks',
    repoRoot,
  );

  if (!manifestPath) {
    throw new Error(
      'No rename apply manifest found. Pass `--manifest <path>` or run `library:apply-renames` first.',
    );
  }

  const { manifest, reports } = await rollbackMediaLibraryRenameApply({
    execute: args.execute,
    manifestPath,
    reportDir,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: manifest.dryRun,
        manifestPath,
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
  const result: { execute?: boolean; manifest?: string; reportDir?: string } =
    {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--execute') {
      result.execute = true;
      continue;
    }

    if (arg === '--manifest' && next) {
      result.manifest = next;
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
  console.error(`Media library rename rollback failed: ${message}`);
  process.exitCode = 1;
});
