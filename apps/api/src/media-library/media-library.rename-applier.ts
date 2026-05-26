import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type {
  MediaLibraryRenamePlan,
  MediaLibraryRenamePlanAction,
} from './media-library.rename-planner';

export interface MediaLibraryRenameApplyInput {
  execute?: boolean;
  includeNotes?: boolean;
  planPath: string;
  reportDir: string;
}

export interface MediaLibraryRenameRollbackInput {
  execute?: boolean;
  manifestPath: string;
  reportDir: string;
}

export interface MediaLibraryRenameApplyManifest {
  actions: MediaLibraryRenameApplyAction[];
  dryRun: boolean;
  error?: string;
  generatedAt: string;
  includeNotes: boolean;
  mode: 'apply';
  planPath: string;
  rootPath: string;
  summary: {
    blocked: number;
    moved: number;
    planned: number;
    skipped: number;
  };
}

export interface MediaLibraryRenameRollbackManifest {
  actions: MediaLibraryRenameRollbackAction[];
  dryRun: boolean;
  error?: string;
  generatedAt: string;
  mode: 'rollback';
  sourceManifestPath: string;
  summary: {
    blocked: number;
    planned: number;
    restored: number;
    skipped: number;
  };
}

interface MediaLibraryRenameApplyAction {
  issues: string[];
  movedAt?: string;
  reason?: string;
  sourceAbsolutePath: string;
  sourceRelativePath: string;
  status: 'blocked' | 'moved' | 'planned' | 'skipped';
  targetAbsolutePath?: string;
  targetRelativePath?: string;
}

interface MediaLibraryRenameRollbackAction {
  originalSourceAbsolutePath: string;
  originalSourceRelativePath: string;
  reason?: string;
  restoredAt?: string;
  status: 'blocked' | 'planned' | 'restored' | 'skipped';
  targetAbsolutePath: string;
  targetRelativePath: string;
}

interface ReportPaths {
  jsonPath: string;
  markdownPath: string;
}

const BLOCKING_ISSUES = new Set([
  'mal-episode-list-verification-required',
  'target-already-exists',
  'target-collision',
  'unsupported-file-kind',
]);

export async function applyMediaLibraryRenamePlan({
  execute = false,
  includeNotes = false,
  planPath,
  reportDir,
}: MediaLibraryRenameApplyInput) {
  const plan = await readJson<MediaLibraryRenamePlan>(planPath);
  assertPlanCanBeApplied(plan);

  const manifest: MediaLibraryRenameApplyManifest = {
    actions: buildApplyActions({ includeNotes, plan }),
    dryRun: !execute,
    generatedAt: new Date().toISOString(),
    includeNotes,
    mode: 'apply',
    planPath,
    rootPath: plan.rootPath,
    summary: {
      blocked: 0,
      moved: 0,
      planned: 0,
      skipped: 0,
    },
  };

  validateApplyActions(manifest);

  if (execute) {
    try {
      for (const action of manifest.actions) {
        if (action.status !== 'planned' || !action.targetAbsolutePath) {
          continue;
        }

        await mkdir(dirname(action.targetAbsolutePath), { recursive: true });
        await rename(action.sourceAbsolutePath, action.targetAbsolutePath);
        action.status = 'moved';
        action.movedAt = new Date().toISOString();
      }
    } catch (error) {
      manifest.error = error instanceof Error ? error.message : String(error);
      summarizeApplyManifest(manifest);
      const reports = await writeApplyReports({ manifest, reportDir });

      throw new Error(
        `Rename apply failed after writing partial manifest: ${reports.jsonPath}. ${manifest.error}`,
      );
    }
  }

  summarizeApplyManifest(manifest);
  const reports = await writeApplyReports({ manifest, reportDir });

  return { manifest, reports };
}

export async function rollbackMediaLibraryRenameApply({
  execute = false,
  manifestPath,
  reportDir,
}: MediaLibraryRenameRollbackInput) {
  const sourceManifest =
    await readJson<MediaLibraryRenameApplyManifest>(manifestPath);
  const rollback: MediaLibraryRenameRollbackManifest = {
    actions: buildRollbackActions(sourceManifest),
    dryRun: !execute,
    generatedAt: new Date().toISOString(),
    mode: 'rollback',
    sourceManifestPath: manifestPath,
    summary: {
      blocked: 0,
      planned: 0,
      restored: 0,
      skipped: 0,
    },
  };

  validateRollbackActions(rollback);

  if (execute) {
    try {
      for (const action of rollback.actions) {
        if (action.status !== 'planned') {
          continue;
        }

        await mkdir(dirname(action.originalSourceAbsolutePath), {
          recursive: true,
        });
        await rename(
          action.targetAbsolutePath,
          action.originalSourceAbsolutePath,
        );
        action.status = 'restored';
        action.restoredAt = new Date().toISOString();
      }
    } catch (error) {
      rollback.error = error instanceof Error ? error.message : String(error);
      summarizeRollbackManifest(rollback);
      const reports = await writeRollbackReports({
        manifest: rollback,
        reportDir,
      });

      throw new Error(
        `Rename rollback failed after writing partial manifest: ${reports.jsonPath}. ${rollback.error}`,
      );
    }
  }

  summarizeRollbackManifest(rollback);
  const reports = await writeRollbackReports({ manifest: rollback, reportDir });

  return { manifest: rollback, reports };
}

export async function findLatestRenameApplyManifest(repoRoot: string) {
  const reportDir = join(repoRoot, 'docs/rename-applies');

  if (!existsSync(reportDir)) {
    return undefined;
  }

  const entries = await readdir(reportDir);
  const candidates = await Promise.all(
    entries
      .filter((entry) => /^media-rename-apply-.+\.json$/u.test(entry))
      .map(async (entry) => {
        const path = join(reportDir, entry);
        const fileStat = await stat(path);

        return { mtimeMs: fileStat.mtimeMs, path };
      }),
  );

  return candidates.sort((first, second) => second.mtimeMs - first.mtimeMs)[0]
    ?.path;
}

function assertPlanCanBeApplied(plan: MediaLibraryRenamePlan) {
  const blockers: string[] = [];

  if (plan.summary.malEpisodeVerificationRequired) {
    blockers.push(
      `malEpisodeVerificationRequired=${plan.summary.malEpisodeVerificationRequired}`,
    );
  }

  if (plan.summary.targetCollisions) {
    blockers.push(`targetCollisions=${plan.summary.targetCollisions}`);
  }

  if (plan.summary.existingTargetConflicts) {
    blockers.push(
      `existingTargetConflicts=${plan.summary.existingTargetConflicts}`,
    );
  }

  for (const action of plan.actions) {
    const blockingIssue = action.issues.find((issue) =>
      BLOCKING_ISSUES.has(issue),
    );

    if (blockingIssue) {
      blockers.push(`${action.sourceRelativePath}: ${blockingIssue}`);
    }
  }

  if (blockers.length) {
    throw new Error(
      `Refusing to apply rename plan with blocking issues:\n${blockers.join('\n')}`,
    );
  }
}

function buildApplyActions({
  includeNotes,
  plan,
}: {
  includeNotes: boolean;
  plan: MediaLibraryRenamePlan;
}) {
  return plan.actions.map((action) =>
    buildApplyAction(plan, action, includeNotes),
  );
}

function buildApplyAction(
  plan: MediaLibraryRenamePlan,
  action: MediaLibraryRenamePlanAction,
  includeNotes: boolean,
): MediaLibraryRenameApplyAction {
  const sourceAbsolutePath = resolveWithinRoot(
    plan.rootPath,
    action.sourceRelativePath,
  );
  const targetAbsolutePath = action.targetRelativePath
    ? resolveWithinRoot(plan.rootPath, action.targetRelativePath)
    : undefined;

  if (action.fileKind === 'note' && !includeNotes) {
    return {
      issues: action.issues,
      reason: 'notes-are-imported-separately',
      sourceAbsolutePath,
      sourceRelativePath: action.sourceRelativePath,
      status: 'skipped',
      targetAbsolutePath,
      targetRelativePath: action.targetRelativePath,
    };
  }

  if (action.action !== 'move-file' || !action.targetRelativePath) {
    return {
      issues: action.issues,
      reason: 'not-a-move-action',
      sourceAbsolutePath,
      sourceRelativePath: action.sourceRelativePath,
      status: 'skipped',
      targetAbsolutePath,
      targetRelativePath: action.targetRelativePath,
    };
  }

  return {
    issues: action.issues,
    sourceAbsolutePath,
    sourceRelativePath: action.sourceRelativePath,
    status: 'planned',
    targetAbsolutePath,
    targetRelativePath: action.targetRelativePath,
  };
}

function validateApplyActions(manifest: MediaLibraryRenameApplyManifest) {
  const targets = new Set<string>();

  for (const action of manifest.actions) {
    if (action.status !== 'planned') {
      continue;
    }

    if (!existsSync(action.sourceAbsolutePath)) {
      action.status = 'blocked';
      action.reason = 'source-missing';
      continue;
    }

    if (!action.targetAbsolutePath) {
      action.status = 'blocked';
      action.reason = 'target-missing';
      continue;
    }

    if (targets.has(action.targetAbsolutePath)) {
      action.status = 'blocked';
      action.reason = 'duplicate-target';
      continue;
    }

    targets.add(action.targetAbsolutePath);

    if (existsSync(action.targetAbsolutePath)) {
      action.status = 'blocked';
      action.reason = 'target-already-exists';
    }
  }

  summarizeApplyManifest(manifest);

  if (manifest.summary.blocked) {
    throw new Error(
      `Refusing to apply rename plan because ${manifest.summary.blocked} move(s) are blocked.`,
    );
  }
}

function buildRollbackActions(sourceManifest: MediaLibraryRenameApplyManifest) {
  if (sourceManifest.dryRun) {
    return sourceManifest.actions
      .filter((action) => action.status === 'planned')
      .reverse()
      .map(
        (action): MediaLibraryRenameRollbackAction => ({
          originalSourceAbsolutePath: action.sourceAbsolutePath,
          originalSourceRelativePath: action.sourceRelativePath,
          reason: 'source-manifest-was-dry-run',
          status: 'skipped',
          targetAbsolutePath: action.targetAbsolutePath ?? '',
          targetRelativePath: action.targetRelativePath ?? '',
        }),
      );
  }

  return sourceManifest.actions
    .filter((action) => action.status === 'moved' && action.targetAbsolutePath)
    .reverse()
    .map(
      (action): MediaLibraryRenameRollbackAction => ({
        originalSourceAbsolutePath: action.sourceAbsolutePath,
        originalSourceRelativePath: action.sourceRelativePath,
        status: 'planned',
        targetAbsolutePath: action.targetAbsolutePath ?? '',
        targetRelativePath: action.targetRelativePath ?? '',
      }),
    );
}

function validateRollbackActions(manifest: MediaLibraryRenameRollbackManifest) {
  for (const action of manifest.actions) {
    if (action.status !== 'planned') {
      continue;
    }

    if (!existsSync(action.targetAbsolutePath)) {
      action.status = 'blocked';
      action.reason = 'current-target-missing';
      continue;
    }

    if (existsSync(action.originalSourceAbsolutePath)) {
      action.status = 'blocked';
      action.reason = 'original-source-already-exists';
    }
  }

  summarizeRollbackManifest(manifest);

  if (manifest.summary.blocked) {
    throw new Error(
      `Refusing to rollback because ${manifest.summary.blocked} restore(s) are blocked.`,
    );
  }
}

function summarizeApplyManifest(manifest: MediaLibraryRenameApplyManifest) {
  manifest.summary = {
    blocked: manifest.actions.filter((action) => action.status === 'blocked')
      .length,
    moved: manifest.actions.filter((action) => action.status === 'moved')
      .length,
    planned: manifest.actions.filter((action) => action.status === 'planned')
      .length,
    skipped: manifest.actions.filter((action) => action.status === 'skipped')
      .length,
  };
}

function summarizeRollbackManifest(
  manifest: MediaLibraryRenameRollbackManifest,
) {
  manifest.summary = {
    blocked: manifest.actions.filter((action) => action.status === 'blocked')
      .length,
    planned: manifest.actions.filter((action) => action.status === 'planned')
      .length,
    restored: manifest.actions.filter((action) => action.status === 'restored')
      .length,
    skipped: manifest.actions.filter((action) => action.status === 'skipped')
      .length,
  };
}

async function writeApplyReports({
  manifest,
  reportDir,
}: {
  manifest: MediaLibraryRenameApplyManifest;
  reportDir: string;
}): Promise<ReportPaths> {
  await mkdir(reportDir, { recursive: true });

  const stamp = manifest.generatedAt.replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `media-rename-apply-${stamp}.json`);
  const markdownPath = join(reportDir, `media-rename-apply-${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(markdownPath, buildApplyMarkdown(manifest));

  return { jsonPath, markdownPath };
}

async function writeRollbackReports({
  manifest,
  reportDir,
}: {
  manifest: MediaLibraryRenameRollbackManifest;
  reportDir: string;
}): Promise<ReportPaths> {
  await mkdir(reportDir, { recursive: true });

  const stamp = manifest.generatedAt.replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `media-rename-rollback-${stamp}.json`);
  const markdownPath = join(reportDir, `media-rename-rollback-${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(markdownPath, buildRollbackMarkdown(manifest));

  return { jsonPath, markdownPath };
}

function buildApplyMarkdown(manifest: MediaLibraryRenameApplyManifest) {
  const lines = [
    '# Elysium Media Rename Apply Manifest',
    '',
    `- Mode: \`${manifest.dryRun ? 'dry-run' : 'execute'}\``,
    `- Generated at: \`${manifest.generatedAt}\``,
    `- Plan: \`${manifest.planPath}\``,
    `- Root: \`${manifest.rootPath}\``,
    `- Planned: \`${manifest.summary.planned}\``,
    `- Moved: \`${manifest.summary.moved}\``,
    `- Skipped: \`${manifest.summary.skipped}\``,
    `- Blocked: \`${manifest.summary.blocked}\``,
    '',
    '## Safety',
    '',
    manifest.dryRun
      ? 'This was a dry run. No media files were moved.'
      : 'This manifest is the rollback source for moved files.',
    '',
    '## Moves',
    '',
    ...manifest.actions
      .filter((action) => action.status !== 'skipped')
      .slice(0, 200)
      .map(
        (action) =>
          `- ${action.status}: \`${action.sourceRelativePath}\` -> \`${action.targetRelativePath ?? ''}\``,
      ),
    '',
    '## Skipped',
    '',
    ...manifest.actions
      .filter((action) => action.status === 'skipped')
      .slice(0, 80)
      .map(
        (action) =>
          `- \`${action.sourceRelativePath}\`: ${action.reason ?? 'skipped'}`,
      ),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function buildRollbackMarkdown(manifest: MediaLibraryRenameRollbackManifest) {
  const lines = [
    '# Elysium Media Rename Rollback Manifest',
    '',
    `- Mode: \`${manifest.dryRun ? 'dry-run' : 'execute'}\``,
    `- Generated at: \`${manifest.generatedAt}\``,
    `- Source manifest: \`${manifest.sourceManifestPath}\``,
    `- Planned: \`${manifest.summary.planned}\``,
    `- Restored: \`${manifest.summary.restored}\``,
    `- Skipped: \`${manifest.summary.skipped}\``,
    `- Blocked: \`${manifest.summary.blocked}\``,
    '',
    '## Restores',
    '',
    ...manifest.actions
      .filter((action) => action.status !== 'skipped')
      .slice(0, 200)
      .map(
        (action) =>
          `- ${action.status}: \`${action.targetRelativePath}\` -> \`${action.originalSourceRelativePath}\``,
      ),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function resolveWithinRoot(rootPath: string, relativePath: string) {
  const root = resolve(rootPath);
  const absolutePath = resolve(root, relativePath);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

  if (absolutePath !== root && !absolutePath.startsWith(rootPrefix)) {
    throw new Error(`Path escapes media root: ${relativePath}`);
  }

  return absolutePath;
}
