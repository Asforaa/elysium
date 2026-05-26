import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import type {
  LocalAnimeMatch,
  LocalAnimeMatchReport,
} from './anilist-library.matcher';
import { scanMediaLibrary } from './media-library.scanner';
import type {
  MediaLibraryCategory,
  MediaLibraryScanFile,
} from './media-library.types';

export interface MediaLibraryRenamePlanAction {
  action: 'move-file' | 'review-only';
  category: MediaLibraryCategory;
  elysiumId?: string;
  entityKey?: string;
  fileKind: string;
  issues: string[];
  metadata?: {
    anilistId?: number;
    malId?: number;
    matchedTitle?: string;
    matchConfidence?: LocalAnimeMatch['confidence'];
    matchScore?: number;
  };
  sourceRelativePath: string;
  targetRelativePath?: string;
}

export interface MediaLibraryRenamePlan {
  generatedAt: string;
  matchReportPath?: string;
  rootPath: string;
  summary: {
    animeMatchedFiles: number;
    existingTargetConflicts: number;
    files: number;
    moves: number;
    notes: number;
    reviewOnly: number;
    targetCollisions: number;
    unchanged: number;
    videos: number;
  };
  actions: MediaLibraryRenamePlanAction[];
}

interface RenamePlannerInput {
  matchReportPath?: string;
  reportDir: string;
  rootPath: string;
}

interface PlannedEntity {
  category: MediaLibraryCategory;
  elysiumId: string;
  key: string;
  matchedTitle?: string;
  title: string;
}

interface ReadMatchReportResult {
  matchReport?: LocalAnimeMatchReport;
  matchReportPath?: string;
}

const VIDEO_LIKE_KINDS = new Set(['video']);

export async function planMediaLibraryRenames({
  matchReportPath,
  reportDir,
  rootPath,
}: RenamePlannerInput) {
  const scan = await scanMediaLibrary(rootPath);
  const matchReportResult = await readMatchReport(matchReportPath);
  const planner = new RenamePlanner(matchReportResult.matchReport);
  const actions = scan.files.map((file) => planner.planFile(file));
  const finalizedActions = markTargetProblems(rootPath, actions);
  const plan = summarizePlan({
    actions: finalizedActions,
    matchReportPath: matchReportResult.matchReportPath,
    rootPath,
  });
  const reports = await writeRenamePlanReports({ plan, reportDir });

  return { plan, reports };
}

export async function findLatestAniListMatchReport(repoRoot: string) {
  const reportDir = join(repoRoot, 'docs/match-reports');

  if (!existsSync(reportDir)) {
    return undefined;
  }

  const entries = await readdir(reportDir);
  const candidates = await Promise.all(
    entries
      .filter((entry) => /^anilist-match-.+\.json$/u.test(entry))
      .map(async (entry) => {
        const path = join(reportDir, entry);
        const fileStat = await stat(path);

        return { mtimeMs: fileStat.mtimeMs, path };
      }),
  );

  return candidates.sort((first, second) => second.mtimeMs - first.mtimeMs)[0]
    ?.path;
}

async function readMatchReport(
  matchReportPath?: string,
): Promise<ReadMatchReportResult> {
  if (!matchReportPath) {
    return {};
  }

  const content = await readFile(matchReportPath, 'utf8');

  return {
    matchReport: JSON.parse(content) as LocalAnimeMatchReport,
    matchReportPath,
  };
}

async function writeRenamePlanReports({
  plan,
  reportDir,
}: {
  plan: MediaLibraryRenamePlan;
  reportDir: string;
}) {
  await mkdir(reportDir, { recursive: true });

  const stamp = plan.generatedAt.replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `media-rename-plan-${stamp}.json`);
  const markdownPath = join(reportDir, `media-rename-plan-${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(markdownPath, buildRenamePlanMarkdown(plan));

  return { jsonPath, markdownPath };
}

class RenamePlanner {
  private readonly entities = new Map<string, PlannedEntity>();
  private readonly matchByLocalKey = new Map<string, LocalAnimeMatch>();

  constructor(matchReport?: LocalAnimeMatchReport) {
    for (const match of matchReport?.matches ?? []) {
      const matchKey = localMatchKey(
        match.local.category,
        match.local.localTitle,
      );

      this.matchByLocalKey.set(matchKey, match);

      if (match.bestMatch) {
        this.getOrCreateMatchedEntity(match);
      }
    }
  }

  planFile(file: MediaLibraryScanFile): MediaLibraryRenamePlanAction {
    if (file.fileKind === 'note') {
      return this.planNote(file);
    }

    if (!VIDEO_LIKE_KINDS.has(file.fileKind)) {
      return {
        action: 'review-only',
        category: file.category,
        fileKind: file.fileKind,
        issues: ['unsupported-file-kind'],
        sourceRelativePath: file.relativePath,
      };
    }

    const match =
      file.entityTitleGuess && isAnimeCategory(file.category)
        ? this.matchByLocalKey.get(
            localMatchKey(file.category, file.entityTitleGuess),
          )
        : undefined;
    const entity = match?.bestMatch
      ? this.getOrCreateMatchedEntity(match)
      : this.getOrCreateLocalEntity(file);
    const targetRelativePath = toPosixPath(
      join(entityFolder(entity), this.buildTargetFilename(file, entity, match)),
    );
    const issues = [
      ...file.issues,
      ...(match && match.confidence !== 'high'
        ? ['metadata-match-needs-review']
        : []),
      ...(!match && isAnimeCategory(file.category)
        ? ['missing-anilist-match']
        : []),
      ...(!isAnimeCategory(file.category)
        ? ['metadata-provider-not-yet-linked']
        : []),
    ];

    return {
      action:
        targetRelativePath === file.relativePath ? 'review-only' : 'move-file',
      category: file.category,
      elysiumId: entity.elysiumId,
      entityKey: entity.key,
      fileKind: file.fileKind,
      issues,
      metadata: match?.bestMatch
        ? {
            anilistId: match.bestMatch.id,
            malId: match.bestMatch.idMal,
            matchedTitle:
              match.bestMatch.romajiTitle ?? match.bestMatch.canonicalTitle,
            matchConfidence: match.confidence,
            matchScore: match.bestMatch.score,
          }
        : undefined,
      sourceRelativePath: file.relativePath,
      targetRelativePath,
    };
  }

  private planNote(file: MediaLibraryScanFile): MediaLibraryRenamePlanAction {
    const noteFolder = toPosixPath(
      join(
        categoryFolder(file.category),
        '_Notes',
        filesystemTitle(noteBucketName(file)),
      ),
    );
    const targetRelativePath = toPosixPath(
      join(
        noteFolder,
        filesystemTitle(basename(file.filename, file.extension)) +
          file.extension,
      ),
    );

    return {
      action:
        targetRelativePath === file.relativePath ? 'review-only' : 'move-file',
      category: file.category,
      fileKind: file.fileKind,
      issues: [...file.issues, 'note-needs-db-import'],
      sourceRelativePath: file.relativePath,
      targetRelativePath,
    };
  }

  private getOrCreateMatchedEntity(match: LocalAnimeMatch) {
    const bestMatch = match.bestMatch;
    const key = bestMatch
      ? `anilist:${bestMatch.id}`
      : localMatchKey(match.local.category, match.local.localTitle);
    const existing = this.entities.get(key);

    if (existing) {
      return existing;
    }

    const title = filesystemTitle(
      bestMatch?.romajiTitle ??
        bestMatch?.canonicalTitle ??
        match.local.localTitle,
    );
    const entity: PlannedEntity = {
      category: match.local.category,
      elysiumId: formatElysiumId(this.entities.size + 1),
      key,
      matchedTitle: bestMatch?.romajiTitle ?? bestMatch?.canonicalTitle,
      title,
    };

    this.entities.set(key, entity);

    return entity;
  }

  private getOrCreateLocalEntity(file: MediaLibraryScanFile) {
    const title = filesystemTitle(
      file.entityTitleGuess ?? titleFromPath(file.relativePath),
    );
    const key = localMatchKey(file.category, title);
    const existing = this.entities.get(key);

    if (existing) {
      return existing;
    }

    const entity: PlannedEntity = {
      category: file.category,
      elysiumId: formatElysiumId(this.entities.size + 1),
      key,
      title,
    };

    this.entities.set(key, entity);

    return entity;
  }

  private buildTargetFilename(
    file: MediaLibraryScanFile,
    entity: PlannedEntity,
    match?: LocalAnimeMatch,
  ) {
    const title = entity.title;
    const qualitySuffix = file.parsedQuality ? ` - ${file.parsedQuality}` : '';
    const extension = file.extension || extname(file.filename);

    if (file.category === 'series') {
      const season = file.parsedSeasonNumber ?? 1;
      const episodeToken =
        file.parsedEpisodeNumber === undefined
          ? 'Episode Unknown'
          : `S${pad2(season)}E${pad2(file.parsedEpisodeNumber)}`;

      return `${title} - ${episodeToken}${qualitySuffix}${extension}`;
    }

    const specialToken = specialEpisodeToken(file);

    if (specialToken) {
      return `${title} - ${specialToken}${qualitySuffix}${extension}`;
    }

    const fractionalEpisodeToken = decimalEpisodeToken(file);

    if (fractionalEpisodeToken) {
      return `${title} - ${fractionalEpisodeToken}${qualitySuffix}${extension}`;
    }

    if (isEpisodeLike(file, match)) {
      const episodeToken =
        file.parsedEpisodeNumber === undefined
          ? 'Episode Unknown'
          : `EP ${pad2(file.parsedEpisodeNumber)}`;

      return `${title} - ${episodeToken}${qualitySuffix}${extension}`;
    }

    const qualifier = standaloneQualifier(file, entity, match);

    return `${title} - ${qualifier}${qualitySuffix}${extension}`;
  }
}

function markTargetProblems(
  rootPath: string,
  actions: MediaLibraryRenamePlanAction[],
) {
  const targets = new Map<string, MediaLibraryRenamePlanAction[]>();

  for (const action of actions) {
    if (!action.targetRelativePath) {
      continue;
    }

    const existing = targets.get(action.targetRelativePath) ?? [];
    existing.push(action);
    targets.set(action.targetRelativePath, existing);
  }

  for (const [targetRelativePath, targetActions] of targets) {
    if (targetActions.length > 1) {
      for (const action of targetActions) {
        addIssue(action, 'target-collision');
      }
    }

    const absoluteTarget = resolve(rootPath, targetRelativePath);

    if (
      existsSync(absoluteTarget) &&
      !targetActions.some(
        (action) =>
          resolve(rootPath, action.sourceRelativePath) === absoluteTarget,
      )
    ) {
      for (const action of targetActions) {
        addIssue(action, 'target-already-exists');
      }
    }
  }

  return actions;
}

function summarizePlan({
  actions,
  matchReportPath,
  rootPath,
}: {
  actions: MediaLibraryRenamePlanAction[];
  matchReportPath?: string;
  rootPath: string;
}): MediaLibraryRenamePlan {
  return {
    actions,
    generatedAt: new Date().toISOString(),
    matchReportPath,
    rootPath,
    summary: {
      animeMatchedFiles: actions.filter((action) => action.metadata?.anilistId)
        .length,
      existingTargetConflicts: actions.filter((action) =>
        action.issues.includes('target-already-exists'),
      ).length,
      files: actions.length,
      moves: actions.filter((action) => action.action === 'move-file').length,
      notes: actions.filter((action) => action.fileKind === 'note').length,
      reviewOnly: actions.filter((action) => action.action === 'review-only')
        .length,
      targetCollisions: actions.filter((action) =>
        action.issues.includes('target-collision'),
      ).length,
      unchanged: actions.filter(
        (action) => action.targetRelativePath === action.sourceRelativePath,
      ).length,
      videos: actions.filter((action) => action.fileKind === 'video').length,
    },
  };
}

function buildRenamePlanMarkdown(plan: MediaLibraryRenamePlan) {
  const issueActions = plan.actions.filter((action) => action.issues.length);
  const sampleActions = plan.actions
    .filter((action) => action.action === 'move-file')
    .slice(0, 160);
  const lines = [
    '# Elysium Media Rename Plan',
    '',
    `- Root: \`${plan.rootPath}\``,
    `- Generated at: \`${plan.generatedAt}\``,
    `- Match report: \`${plan.matchReportPath ?? 'none'}\``,
    `- Files: \`${plan.summary.files}\``,
    `- Videos: \`${plan.summary.videos}\``,
    `- Notes: \`${plan.summary.notes}\``,
    `- Planned moves: \`${plan.summary.moves}\``,
    `- Review-only files: \`${plan.summary.reviewOnly}\``,
    `- AniList matched files: \`${plan.summary.animeMatchedFiles}\``,
    `- Target collisions: \`${plan.summary.targetCollisions}\``,
    `- Existing target conflicts: \`${plan.summary.existingTargetConflicts}\``,
    '',
    '## Safety',
    '',
    'This is a dry-run manifest. It does not move, rename, or delete media files.',
    '',
    '## Issue Summary',
    '',
    ...issueSummaryLines(issueActions),
    '',
    '## Planned Move Samples',
    '',
    ...sampleActions.map(
      (action) =>
        `- \`${action.sourceRelativePath}\` -> \`${action.targetRelativePath}\``,
    ),
    '',
    '## Review Items',
    '',
    ...issueActions
      .slice(0, 160)
      .map(
        (action) =>
          `- \`${action.sourceRelativePath}\`: ${action.issues.join(', ')}`,
      ),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function issueSummaryLines(actions: MediaLibraryRenamePlanAction[]) {
  const counts = new Map<string, number>();

  for (const action of actions) {
    for (const issue of action.issues) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }

  if (!counts.size) {
    return ['- none'];
  }

  return Array.from(counts.entries())
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([issue, count]) => `- ${issue}: \`${count}\``);
}

function isEpisodeLike(file: MediaLibraryScanFile, match?: LocalAnimeMatch) {
  if (file.parsedEpisodeNumber !== undefined) {
    return true;
  }

  if (file.category !== 'anime-series') {
    return false;
  }

  const format = match?.bestMatch?.format;

  return format === 'TV' || format === 'ONA';
}

function standaloneQualifier(
  file: MediaLibraryScanFile,
  entity: PlannedEntity,
  match?: LocalAnimeMatch,
) {
  if (file.category === 'anime-movie' || file.category === 'movie') {
    return 'Movie';
  }

  const localQualifier = localStandaloneQualifier(
    file.entityTitleGuess,
    entity.title,
  );

  if (localQualifier) {
    return localQualifier;
  }

  if (
    match?.bestMatch?.format === 'OVA' ||
    match?.bestMatch?.format === 'SPECIAL'
  ) {
    return match.bestMatch.format;
  }

  if (file.category === 'anime-series') {
    return 'Special';
  }

  return 'Movie';
}

function localStandaloneQualifier(
  localTitle: string | undefined,
  entityTitle: string,
) {
  if (!localTitle) {
    return undefined;
  }

  const cleanedLocal = filesystemTitle(localTitle)
    .replace(/\bmovie\b/giu, ' ')
    .replace(/[()[\]-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const normalizedEntity = normalizeForCompare(entityTitle);
  const entityTokens = normalizedEntity.split(' ');
  const localTokens = cleanedLocal.split(/\s+/u);
  const remainingTokens = localTokens.filter(
    (token) => !entityTokens.includes(normalizeForCompare(token)),
  );
  const qualifier = remainingTokens.join(' ').replace(/\s+/gu, ' ').trim();

  return qualifier && qualifier.length >= 3 ? qualifier : undefined;
}

function specialEpisodeToken(file: MediaLibraryScanFile) {
  const path = file.relativePath.toLowerCase();

  if (file.parsedEpisodeNumber === undefined) {
    return undefined;
  }

  if (/\b(?:ova|special)\b/iu.test(path) || path.includes('اوفا')) {
    return `OVA ${pad2(file.parsedEpisodeNumber)}`;
  }

  if (path.includes('حلقة خاصة')) {
    return `Special ${pad2(file.parsedEpisodeNumber)}`;
  }

  return undefined;
}

function decimalEpisodeToken(file: MediaLibraryScanFile) {
  const match = file.filename.match(
    /(?:^|[^A-Za-z0-9])(?:EP|E)[_\s.-]*0?(\d{1,3})\.(\d{1,2})(?=$|[^A-Za-z0-9])/iu,
  );

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return `EP ${pad2(Number(match[1]))}.${match[2]}`;
}

function noteBucketName(file: MediaLibraryScanFile) {
  const segments = file.relativePath.split('/');

  if (file.category === 'anime-series') {
    return segments[2] ?? file.entityTitleGuess ?? 'Anime Notes';
  }

  if (file.category === 'anime-movie') {
    return 'Anime Movies';
  }

  return file.entityTitleGuess ?? dirname(file.relativePath) ?? 'Notes';
}

function entityFolder(entity: PlannedEntity) {
  return toPosixPath(
    join(
      categoryFolder(entity.category),
      `${entity.elysiumId} - ${entity.title}`,
    ),
  );
}

function categoryFolder(category: MediaLibraryCategory) {
  switch (category) {
    case 'anime-movie':
    case 'anime-series':
      return 'Anime';
    case 'movie':
      return 'Movies';
    case 'series':
      return 'Series';
    default:
      return 'Unsorted';
  }
}

function isAnimeCategory(category: MediaLibraryCategory) {
  return category === 'anime-movie' || category === 'anime-series';
}

function localMatchKey(category: MediaLibraryCategory, title: string) {
  return `${category}:${normalizeForCompare(title)}`;
}

function normalizeForCompare(value: string) {
  return stripNonEnglishNoise(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/&/gu, ' and ')
    .replace(/\b(?:the|a|an|tv|movie|season|part|2nd|3rd|4th)\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function filesystemTitle(value: string) {
  return stripNonEnglishNoise(value)
    .normalize('NFKD')
    .replace(/√/gu, ' Root ')
    .replace(/×/gu, ' x ')
    .replace(/[♀♂]/gu, '')
    .replace(/[’‘]/gu, "'")
    .replace(/[“”]/gu, '"')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\x20-\x7e]/gu, ' ')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[ .]+$/gu, '')
    .trim();
}

function stripNonEnglishNoise(value: string) {
  return value
    .replace(/[\u0600-\u06ff]+/gu, ' ')
    .replace(/\b(?:الحلقة|فيلم|الفيلم|الفلم|اوفا|مترجمة)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function titleFromPath(relativePath: string) {
  return basename(relativePath, extname(relativePath))
    .replace(/\./gu, ' ')
    .replace(/_/gu, ' ');
}

function formatElysiumId(index: number) {
  return `e${String(index).padStart(6, '0')}`;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function addIssue(action: MediaLibraryRenamePlanAction, issue: string) {
  if (!action.issues.includes(issue)) {
    action.issues.push(issue);
  }
}

function toPosixPath(value: string) {
  return value.split(sep).join('/');
}
