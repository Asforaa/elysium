import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
} from 'node:path';
import type {
  MediaLibraryRenamePlan,
  MediaLibraryRenamePlanAction,
} from './media-library.rename-planner';
import type { MediaLibraryCategory } from './media-library.types';
import { MediaLibraryRepository } from './media-library.repository';

export interface ImportRenamedMediaLibraryInput {
  localRootPath?: string;
  planPath: string;
  reportDir: string;
  rootKey?: string;
  rootName?: string;
  serverRootPath?: string;
}

export interface ImportRenamedMediaLibrarySummary {
  entities: number;
  files: number;
  importRunId: string;
  missingFiles: number;
  notes: number;
  planPath: string;
  reportPath?: string;
  rootPath: string;
  skipped: number;
}

interface EntityCacheRecord {
  action: MediaLibraryRenamePlanAction;
  displayTitle: string;
  elysiumId: string;
  folderName: string;
  mediaKind: string;
  relativeFolderPath: string;
}

interface EpisodeDescriptor {
  episodeNumber?: string;
  episodeTitle?: string;
  sortOrder?: number;
}

export async function importRenamedMediaLibrary({
  localRootPath,
  planPath,
  reportDir,
  repository,
  rootKey = 'homeserver-main',
  rootName = 'Homeserver Elysium Media',
  serverRootPath,
}: ImportRenamedMediaLibraryInput & {
  repository: MediaLibraryRepository;
}): Promise<ImportRenamedMediaLibrarySummary> {
  const plan = await readPlan(planPath);
  const rootPath = resolve(localRootPath ?? plan.rootPath);
  const mediaRootId = await repository.upsertRoot({
    key: rootKey,
    localPath: rootPath,
    name: rootName,
    serverPath: serverRootPath,
  });
  const importRunId = await repository.createImportRun({
    mediaRootId,
    mode: 'renamed-plan-import',
    rootPath,
    status: 'running',
    summary: {
      planPath,
      planGeneratedAt: plan.generatedAt,
    },
  });
  const summary = {
    entities: 0,
    files: 0,
    importRunId,
    missingFiles: 0,
    notes: 0,
    planPath,
    rootPath,
    skipped: 0,
  };
  const entityIdsByKey = new Map<string, string>();
  const entityRecordsByHint = new Map<string, EntityCacheRecord>();
  const episodeFallbacksByEntity = new Map<string, number>();

  try {
    for (const action of plan.actions) {
      if (action.fileKind === 'video') {
        const imported = await importVideoAction({
          action,
          episodeFallbacksByEntity,
          entityIdsByKey,
          entityRecordsByHint,
          importRunId,
          mediaRootId,
          repository,
          rootPath,
        });

        if (imported === 'missing') {
          summary.missingFiles += 1;
        } else if (imported === 'skipped') {
          summary.skipped += 1;
        } else if (imported === 'entity-created') {
          summary.entities += 1;
          summary.files += 1;
        } else {
          summary.files += 1;
        }

        continue;
      }

      if (action.fileKind === 'note') {
        const imported = await importNoteAction({
          action,
          entityRecordsByHint,
          importRunId,
          mediaRootId,
          repository,
          rootPath,
        });

        if (imported) {
          summary.notes += 1;
        } else {
          summary.skipped += 1;
        }

        continue;
      }

      summary.skipped += 1;
    }

    await repository.completeImportRun(importRunId, 'completed', summary);

    const reportPath = await writeImportReport({ reportDir, summary });

    return { ...summary, reportPath };
  } catch (error) {
    await repository.completeImportRun(importRunId, 'failed', {
      ...summary,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function importVideoAction({
  action,
  episodeFallbacksByEntity,
  entityIdsByKey,
  entityRecordsByHint,
  importRunId,
  mediaRootId,
  repository,
  rootPath,
}: {
  action: MediaLibraryRenamePlanAction;
  episodeFallbacksByEntity: Map<string, number>;
  entityIdsByKey: Map<string, string>;
  entityRecordsByHint: Map<string, EntityCacheRecord>;
  importRunId: string;
  mediaRootId: string;
  repository: MediaLibraryRepository;
  rootPath: string;
}) {
  if (!action.targetRelativePath || !action.elysiumId) {
    return 'skipped' as const;
  }

  const absolutePath = resolve(rootPath, action.targetRelativePath);

  if (!existsSync(absolutePath)) {
    return 'missing' as const;
  }

  const entityRecord = entityRecordFromAction(action);
  const entityKey = action.entityKey ?? entityRecord.elysiumId;
  const cachedEntityId = entityIdsByKey.get(entityKey);
  let entityCreated = false;
  const mediaEntityId =
    cachedEntityId ??
    (await repository.upsertEntity({
      canonicalTitle: entityRecord.displayTitle,
      displayTitle: entityRecord.displayTitle,
      elysiumId: entityRecord.elysiumId,
      episodeCount: action.metadata?.verifiedMediaOverride?.episodes,
      folderName: entityRecord.folderName,
      format: action.metadata?.verifiedMediaOverride?.format,
      matchConfidence: action.metadata?.matchScore,
      matchStatus: action.metadata?.anilistId ? 'matched' : 'local',
      mediaKind: entityRecord.mediaKind,
      metadata: {
        category: action.category,
        entityKey: action.entityKey,
        importSource: 'rename-plan',
        matchedTitle: action.metadata?.matchedTitle,
      },
      metadataId: action.metadata?.anilistId,
      metadataProvider: action.metadata?.anilistId ? 'anilist' : undefined,
      relativeFolderPath: entityRecord.relativeFolderPath,
      sourceSearchTitle: action.metadata?.matchedTitle ?? entityRecord.displayTitle,
      titleRomaji: action.metadata?.matchedTitle ?? entityRecord.displayTitle,
    }));

  if (!cachedEntityId) {
    entityCreated = true;
    entityIdsByKey.set(entityKey, mediaEntityId);
    entityRecordsByHint.set(entityRecord.elysiumId, entityRecord);
    entityRecordsByHint.set(entityRecord.displayTitle.toLowerCase(), entityRecord);
  }

  if (action.metadata?.anilistId) {
    await repository.upsertExternalId({
      mediaEntityId,
      provider: 'anilist',
      providerId: String(action.metadata.anilistId),
      providerPayload: {
        confidence: action.metadata.matchConfidence,
        score: action.metadata.matchScore,
        title: action.metadata.matchedTitle,
      },
      providerUrl: `https://anilist.co/anime/${action.metadata.anilistId}`,
    });
  }

  if (action.metadata?.malId) {
    await repository.upsertExternalId({
      mediaEntityId,
      provider: 'myanimelist',
      providerId: String(action.metadata.malId),
      providerPayload: action.metadata.verifiedMediaOverride ?? {
        title: action.metadata.matchedTitle,
      },
      providerUrl: `https://myanimelist.net/anime/${action.metadata.malId}`,
    });
  }

  const fileStat = await stat(absolutePath);
  const parsedFile = withNumericEpisodeFallback(
    parseTargetFile(action),
    entityKey,
    episodeFallbacksByEntity,
  );

  await repository.upsertFile({
    absolutePath,
    canonicalRelativePath: action.targetRelativePath,
    category: action.category,
    episodeNumber: parsedFile.episodeNumber,
    episodeTitle: parsedFile.episodeTitle,
    extension: extname(action.targetRelativePath).toLowerCase(),
    fileKind: action.fileKind,
    filename: basename(action.targetRelativePath),
    guessedTitle: entityRecord.displayTitle,
    hostProvider: 'local-library',
    importRunId,
    issues: action.issues,
    mediaContext: {
      category: action.category,
      displayTitle: entityRecord.displayTitle,
      elysiumId: entityRecord.elysiumId,
      episodeNumber: parsedFile.episodeNumber,
      episodeTitle: parsedFile.episodeTitle,
      localEpisodeOverride: action.metadata?.localEpisodeOverride,
      sourceSearchTitle: action.metadata?.matchedTitle ?? entityRecord.displayTitle,
      verifiedMediaOverride: action.metadata?.verifiedMediaOverride,
    },
    mediaEntityId,
    mediaRootId,
    metadata: {
      ...action.metadata,
      sourceRelativePath: action.sourceRelativePath,
      targetRelativePath: action.targetRelativePath,
    },
    modifiedAt: fileStat.mtime.toISOString(),
    parsedEpisodeNumber: parsedFile.parsedEpisodeNumber,
    parsedQuality: parsedFile.quality,
    quality: parsedFile.quality ?? 'Local',
    relativePath: action.targetRelativePath,
    sizeBytes: fileStat.size,
    sortOrder: parsedFile.sortOrder,
    status: 'imported',
  });

  return entityCreated ? 'entity-created' : 'file-imported';
}

async function importNoteAction({
  action,
  entityRecordsByHint,
  importRunId,
  mediaRootId,
  repository,
  rootPath,
}: {
  action: MediaLibraryRenamePlanAction;
  entityRecordsByHint: Map<string, EntityCacheRecord>;
  importRunId: string;
  mediaRootId: string;
  repository: MediaLibraryRepository;
  rootPath: string;
}) {
  const relativePath = existingNoteRelativePath(rootPath, action);

  if (!relativePath) {
    return false;
  }

  const absolutePath = resolve(rootPath, relativePath);
  const fileStat = await stat(absolutePath);
  const title = basename(relativePath, extname(relativePath));
  const hint = noteEntityHint(relativePath);
  const entityRecord = hint
    ? findEntityRecordByHint(entityRecordsByHint, hint)
    : undefined;
  const entity = entityRecord
    ? await repository.findEntityByElysiumId(entityRecord.elysiumId)
    : undefined;

  await repository.upsertNote({
    content: await readFile(absolutePath, 'utf8'),
    editable: true,
    importRunId,
    mediaEntityId: entity?.id,
    mediaRootId,
    noteKind: inferNoteKind(title),
    originalModifiedAt: fileStat.mtime.toISOString(),
    relativePath,
    title,
  });

  return true;
}

function entityRecordFromAction(
  action: MediaLibraryRenamePlanAction,
): EntityCacheRecord {
  const target = action.targetRelativePath ?? action.sourceRelativePath;
  const folderPath = dirname(target);
  const folderName = basename(folderPath);
  const match = folderName.match(/^(e\d{6}) - (.+)$/u);
  const displayTitle =
    match?.[2] ?? action.metadata?.matchedTitle ?? titleFromFilename(target);

  return {
    action,
    displayTitle,
    elysiumId: action.elysiumId ?? match?.[1] ?? 'e000000',
    folderName,
    mediaKind: mediaKindFromCategory(action.category),
    relativeFolderPath: folderPath,
  };
}

function parseTargetFile(action: MediaLibraryRenamePlanAction) {
  const target = action.targetRelativePath ?? action.sourceRelativePath;
  const filename = basename(target);
  const extension = extname(filename);
  const base = filename.slice(0, -extension.length);
  const entityTitle = entityRecordFromAction(action).displayTitle;
  const quality = parseQuality(base);
  const descriptor = stripTitleAndQuality(base, entityTitle, quality);
  const episode = episodeDescriptorFromText(
    descriptor,
    action.metadata?.localEpisodeOverride?.sortOrder,
  );
  const parsedEpisodeNumber = parseFirstNumber(episode.episodeNumber);

  return {
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.episodeTitle,
    parsedEpisodeNumber,
    quality,
    sortOrder: episode.sortOrder,
  };
}

function withNumericEpisodeFallback(
  parsedFile: ReturnType<typeof parseTargetFile>,
  entityKey: string,
  episodeFallbacksByEntity: Map<string, number>,
) {
  if (
    !parsedFile.episodeNumber ||
    /^\d+(?:\.\d+)?$/u.test(parsedFile.episodeNumber)
  ) {
    return parsedFile;
  }

  const next = (episodeFallbacksByEntity.get(entityKey) ?? 0) + 1;
  episodeFallbacksByEntity.set(entityKey, next);

  return {
    ...parsedFile,
    episodeNumber: pad2(next),
    parsedEpisodeNumber: next,
    sortOrder: parsedFile.sortOrder === 20_000 ? next : parsedFile.sortOrder,
  };
}

function episodeDescriptorFromText(
  descriptor: string,
  overrideSortOrder?: number,
): EpisodeDescriptor {
  const clean = descriptor.trim();

  if (!clean) {
    return {};
  }

  const episodeMatch = clean.match(/^EP\s+(\d{1,4})([A-Z])?$/iu);

  if (episodeMatch) {
    const baseNumber = Number(episodeMatch[1]);
    const suffix = episodeMatch[2]?.toUpperCase();
    const sortOrder =
      overrideSortOrder ??
      (suffix
        ? baseNumber + (suffix.charCodeAt(0) - 'A'.charCodeAt(0) + 1) / 10
        : baseNumber);

    return {
      episodeNumber: suffix
        ? `${baseNumber}.${suffix.charCodeAt(0) - 'A'.charCodeAt(0) + 1}`
        : pad2(baseNumber),
      episodeTitle: clean,
      sortOrder,
    };
  }

  const specialMatch = clean.match(/^Special\s+(\d{1,4})(?:\s+-\s+(.+))?$/iu);

  if (specialMatch) {
    const number = Number(specialMatch[1]);

    return {
      episodeNumber: overrideSortOrder ? String(overrideSortOrder) : `S${pad2(number)}`,
      episodeTitle: clean,
      sortOrder: overrideSortOrder ?? 10_000 + number,
    };
  }

  const seriesMatch = clean.match(/^S(\d{1,2})E(\d{1,4})$/iu);

  if (seriesMatch) {
    const season = Number(seriesMatch[1]);
    const episode = Number(seriesMatch[2]);

    return {
      episodeNumber: `S${pad2(season)}E${pad2(episode)}`,
      episodeTitle: clean,
      sortOrder: season * 10_000 + episode,
    };
  }

  if (/^movie$/iu.test(clean)) {
    return {
      episodeNumber: 'movie',
      episodeTitle: 'Movie',
      sortOrder: 0,
    };
  }

  return {
    episodeNumber: slugToken(clean),
    episodeTitle: clean,
    sortOrder: 20_000,
  };
}

function stripTitleAndQuality(base: string, entityTitle: string, quality?: string) {
  let descriptor = base;
  const titlePrefix = `${entityTitle} - `;

  if (descriptor.startsWith(titlePrefix)) {
    descriptor = descriptor.slice(titlePrefix.length);
  }

  if (quality && descriptor.endsWith(` - ${quality}`)) {
    descriptor = descriptor.slice(0, -` - ${quality}`.length);
  }

  return descriptor;
}

function parseQuality(value: string) {
  const matches = Array.from(
    value.matchAll(/(?:^|[\s._-])(FHD|HD|SD|UHD|4K|2160P|1080P|720P|480P)(?=$|[\s._-])/giu),
  );
  const quality = matches.at(-1)?.[1]?.toUpperCase();

  if (!quality) {
    return undefined;
  }

  if (quality === '1080P') {
    return 'FHD';
  }

  if (quality === '720P') {
    return 'HD';
  }

  if (quality === '480P') {
    return 'SD';
  }

  return quality;
}

function parseFirstNumber(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.match(/\d+(?:\.\d+)?/u)?.[0]);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function existingNoteRelativePath(
  rootPath: string,
  action: MediaLibraryRenamePlanAction,
) {
  const candidates = [action.targetRelativePath, action.sourceRelativePath].filter(
    Boolean,
  ) as string[];

  return candidates.find((relativePath) =>
    existsSync(resolve(rootPath, relativePath)),
  );
}

function noteEntityHint(relativePath: string) {
  const segments = relativePath.split('/');
  const notesIndex = segments.findIndex((segment) => segment === '_Notes');

  if (notesIndex >= 0) {
    return segments[notesIndex + 1];
  }

  if (segments[0] === 'Anime' && segments[1] === 'Series') {
    return segments[2];
  }

  return undefined;
}

function findEntityRecordByHint(
  records: Map<string, EntityCacheRecord>,
  hint: string,
) {
  const normalizedHint = hint.toLowerCase();
  const direct = records.get(normalizedHint);

  if (direct) {
    return direct;
  }

  for (const [key, record] of records) {
    if (key.includes(normalizedHint) || normalizedHint.includes(key)) {
      return record;
    }
  }

  return undefined;
}

function inferNoteKind(title: string) {
  return /watch\s*order/iu.test(title) ? 'watch-order' : 'note';
}

function mediaKindFromCategory(category: MediaLibraryCategory) {
  switch (category) {
    case 'anime-movie':
    case 'anime-series':
      return 'anime';
    case 'movie':
      return 'movie';
    case 'series':
      return 'series';
    default:
      return 'unknown';
  }
}

async function readPlan(planPath: string) {
  return JSON.parse(await readFile(planPath, 'utf8')) as MediaLibraryRenamePlan;
}

async function writeImportReport({
  reportDir,
  summary,
}: {
  reportDir: string;
  summary: Omit<ImportRenamedMediaLibrarySummary, 'reportPath'>;
}) {
  await mkdir(reportDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `media-library-import-${stamp}.json`);
  const markdownPath = join(reportDir, `media-library-import-${stamp}.md`);
  const lines = [
    '# Media Library Import',
    '',
    `- Plan: \`${summary.planPath}\``,
    `- Root: \`${summary.rootPath}\``,
    `- Import run: \`${summary.importRunId}\``,
    `- Entities touched: \`${summary.entities}\``,
    `- Files imported: \`${summary.files}\``,
    `- Notes imported: \`${summary.notes}\``,
    `- Missing files: \`${summary.missingFiles}\``,
    `- Skipped: \`${summary.skipped}\``,
    '',
  ];

  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(markdownPath, `${lines.join('\n')}\n`);

  return markdownPath;
}

function titleFromFilename(value: string) {
  return basename(value, extname(value)).replace(/\s+-\s+.+$/u, '').trim();
}

function slugToken(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'extra'
  );
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function resolveImportPath(value: string, repoRoot: string) {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}
