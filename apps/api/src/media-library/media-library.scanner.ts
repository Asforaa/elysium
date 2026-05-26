import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import type {
  LowCountCandidate,
  MediaLibraryCategory,
  MediaLibraryFileKind,
  MediaLibraryNoteCandidate,
  MediaLibraryScanFile,
  MediaLibraryScanSummary,
} from './media-library.types';

const VIDEO_EXTENSIONS = new Set(['.m4v', '.mkv', '.mov', '.mp4', '.webm']);
const NOTE_EXTENSIONS = new Set(['.md', '.txt']);
const LOW_COUNT_REVIEW_LIMIT = 8;

export async function scanMediaLibrary(rootPath: string) {
  const absoluteFiles = await walkFiles(rootPath);
  const files: MediaLibraryScanFile[] = [];
  const notes: MediaLibraryNoteCandidate[] = [];

  for (const absolutePath of absoluteFiles) {
    const fileStat = await stat(absolutePath);
    const candidate = parseMediaFile(rootPath, absolutePath, fileStat);

    files.push(candidate);

    if (candidate.fileKind === 'note') {
      notes.push({
        absolutePath,
        content: await readFile(absolutePath, 'utf8'),
        kind: inferNoteKind(candidate.filename),
        modifiedAt: candidate.modifiedAt,
        relativePath: candidate.relativePath,
        title: titleFromFilename(candidate.filename),
      });
    }
  }

  return summarizeScan(rootPath, files, notes);
}

export async function writeMediaLibraryReports({
  reportDir,
  summary,
}: {
  reportDir: string;
  summary: MediaLibraryScanSummary;
}) {
  await mkdir(reportDir, { recursive: true });

  const stamp = summary.scannedAt.replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `media-scan-${stamp}.json`);
  const markdownPath = join(reportDir, `media-scan-${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(markdownPath, buildMarkdownReport(summary));

  return { jsonPath, markdownPath };
}

function parseMediaFile(
  rootPath: string,
  absolutePath: string,
  fileStat: { mtime: Date; size: number },
): MediaLibraryScanFile {
  const relativePath = toPosixPath(relative(rootPath, absolutePath));
  const filename = basename(absolutePath);
  const extension = extname(filename).toLowerCase();
  const fileKind = getFileKind(extension);
  const segments = relativePath.split('/');
  const category = inferCategory(segments);
  const parsedSource = parseSource(filename);
  const parsedQuality = parseQuality(filename);
  const parsedSeasonNumber =
    parseSeasonNumber(segments.join(' ')) ?? parseSeasonNumber(filename);
  const parsedPartNumber =
    parsePartNumber(segments.join(' ')) ?? parsePartNumber(filename);
  const parsedEpisodeNumber = parseEpisodeNumber(filename);
  const entityTitleGuess = inferEntityTitle({
    category,
    filename,
    parsedPartNumber,
    parsedSeasonNumber,
    segments,
  });
  const issues = inferIssues({
    category,
    entityTitleGuess,
    fileKind,
    parsedEpisodeNumber,
    relativePath,
    segments,
  });
  const canonicalFolderGuess = entityTitleGuess
    ? join(canonicalCategoryFolder(category), `${sanitizePathPart(entityTitleGuess)} [unmatched]`)
    : undefined;
  const canonicalFilenameGuess =
    entityTitleGuess && fileKind === 'video'
      ? buildCanonicalFilename({
          category,
          entityTitleGuess,
          extension,
          parsedEpisodeNumber,
          parsedPartNumber,
          parsedQuality,
          parsedSeasonNumber,
        })
      : undefined;

  return {
    absolutePath,
    canonicalFilenameGuess,
    canonicalFolderGuess: canonicalFolderGuess
      ? toPosixPath(canonicalFolderGuess)
      : undefined,
    canonicalRelativePathGuess:
      canonicalFolderGuess && canonicalFilenameGuess
        ? toPosixPath(join(canonicalFolderGuess, canonicalFilenameGuess))
        : undefined,
    category,
    entityTitleGuess,
    extension,
    fileKind,
    filename,
    issues,
    modifiedAt: fileStat.mtime.toISOString(),
    parsedEpisodeNumber,
    parsedPartNumber,
    parsedQuality,
    parsedSeasonNumber,
    parsedSource,
    relativePath,
    sizeBytes: fileStat.size,
  };
}

function summarizeScan(
  rootPath: string,
  files: MediaLibraryScanFile[],
  notes: MediaLibraryNoteCandidate[],
): MediaLibraryScanSummary {
  const categoryCounts: Record<string, number> = {};
  const issueCounts: Record<string, number> = {};
  const qualityCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  const entityCounts = new Map<string, LowCountCandidate>();
  const totals = { bytes: 0, notes: 0, other: 0, videos: 0 };

  for (const file of files) {
    totals.bytes += file.sizeBytes;
    categoryCounts[file.category] = (categoryCounts[file.category] ?? 0) + 1;

    if (file.fileKind === 'video') {
      totals.videos += 1;
    } else if (file.fileKind === 'note') {
      totals.notes += 1;
    } else {
      totals.other += 1;
    }

    for (const issue of file.issues) {
      issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }

    if (file.parsedQuality) {
      qualityCounts[file.parsedQuality] =
        (qualityCounts[file.parsedQuality] ?? 0) + 1;
    }

    if (file.parsedSource) {
      sourceCounts[file.parsedSource] =
        (sourceCounts[file.parsedSource] ?? 0) + 1;
    }

    if (file.fileKind === 'video' && file.entityTitleGuess) {
      const key = `${file.category}:${file.entityTitleGuess}`;
      const existing = entityCounts.get(key);

      if (existing) {
        existing.fileCount += 1;
      } else {
        entityCounts.set(key, {
          category: file.category,
          fileCount: 1,
          title: file.entityTitleGuess,
        });
      }
    }
  }

  return {
    categoryCounts: sortRecord(categoryCounts),
    files: files.sort((first, second) =>
      first.relativePath.localeCompare(second.relativePath),
    ),
    issueCounts: sortRecord(issueCounts),
    lowCountCandidates: Array.from(entityCounts.values())
      .filter(
        (candidate) =>
          candidate.category === 'anime-series' &&
          candidate.fileCount <= LOW_COUNT_REVIEW_LIMIT,
      )
      .sort((first, second) => first.title.localeCompare(second.title)),
    notes: notes.sort((first, second) =>
      first.relativePath.localeCompare(second.relativePath),
    ),
    qualityCounts: sortRecord(qualityCounts),
    rootPath,
    scannedAt: new Date().toISOString(),
    sourceCounts: sortRecord(sourceCounts),
    totals,
  };
}

export function buildMarkdownReport(summary: MediaLibraryScanSummary) {
  const lines = [
    '# Elysium Media Scan',
    '',
    `- Root: \`${summary.rootPath}\``,
    `- Scanned at: \`${summary.scannedAt}\``,
    `- Videos: \`${summary.totals.videos}\``,
    `- Notes: \`${summary.totals.notes}\``,
    `- Other files: \`${summary.totals.other}\``,
    `- Size: \`${formatBytes(summary.totals.bytes)}\``,
    '',
    '## Categories',
    '',
    ...recordLines(summary.categoryCounts),
    '',
    '## Qualities',
    '',
    ...recordLines(summary.qualityCounts),
    '',
    '## Sources',
    '',
    ...recordLines(summary.sourceCounts),
    '',
    '## Issues',
    '',
    ...recordLines(summary.issueCounts),
    '',
    '## Notes',
    '',
    ...summary.notes.map((note) => `- \`${note.relativePath}\` (${note.kind})`),
    '',
    '## Low Count Anime Candidates',
    '',
    ...summary.lowCountCandidates.map(
      (candidate) =>
        `- ${candidate.title} - ${candidate.fileCount} video file(s)`,
    ),
    '',
    '## Canonical Path Samples',
    '',
    ...summary.files
      .filter((file) => file.canonicalRelativePathGuess)
      .slice(0, 80)
      .map(
        (file) =>
          `- \`${file.relativePath}\` -> \`${file.canonicalRelativePathGuess}\``,
      ),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

async function walkFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((first, second) =>
    first.name.localeCompare(second.name),
  )) {
    const absolutePath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function getFileKind(extension: string): MediaLibraryFileKind {
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }

  if (NOTE_EXTENSIONS.has(extension)) {
    return 'note';
  }

  return 'other';
}

function inferCategory(segments: string[]): MediaLibraryCategory {
  const first = segments[0]?.toLowerCase();
  const second = segments[1]?.toLowerCase();

  if (first === 'anime' && second === 'movies') {
    return 'anime-movie';
  }

  if (first === 'anime' && second === 'series') {
    return 'anime-series';
  }

  if (first === 'movies') {
    return 'movie';
  }

  if (first === 'series') {
    return 'series';
  }

  return 'unknown';
}

function inferEntityTitle({
  category,
  filename,
  parsedPartNumber,
  parsedSeasonNumber,
  segments,
}: {
  category: MediaLibraryCategory;
  filename: string;
  parsedPartNumber?: number;
  parsedSeasonNumber?: number;
  segments: string[];
}) {
  if (category === 'anime-movie') {
    return cleanupTitle(titleFromFilename(filename));
  }

  if (category === 'movie') {
    return cleanupTitle(titleFromFilename(filename));
  }

  if (category === 'series') {
    const folder = segments[1] ?? titleFromFilename(filename);
    return cleanupTitle(expandSeasonShorthand(folder));
  }

  if (category !== 'anime-series') {
    return cleanupTitle(titleFromFilename(filename));
  }

  const folders = segments.slice(2, -1);

  if (!folders.length) {
    return cleanupTitle(titleFromFilename(filename));
  }

  const firstFolder = folders[0] ?? '';
  const entityFolder = folders.find((folder) => {
    const normalized = folder.toLowerCase();
    return (
      normalized.includes('movie') ||
      normalized.includes('ova') ||
      normalized.includes('special') ||
      (!isSeasonFolder(folder) && folder !== firstFolder)
    );
  });

  if (entityFolder && !isSeasonFolder(entityFolder)) {
    const normalized = entityFolder.toLowerCase();
    const genericRelatedFolder =
      normalized.startsWith('movie') ||
      normalized.startsWith('ova') ||
      normalized.startsWith('special');

    return cleanupTitle(
      genericRelatedFolder ? `${firstFolder} ${entityFolder}` : entityFolder,
    );
  }

  const titleParts = [firstFolder];

  if (
    parsedSeasonNumber !== undefined &&
    !hasSeasonToken(firstFolder, parsedSeasonNumber)
  ) {
    titleParts.push(`Season ${parsedSeasonNumber}`);
  }

  if (
    parsedPartNumber !== undefined &&
    !hasPartToken(firstFolder, parsedPartNumber)
  ) {
    titleParts.push(`Part ${parsedPartNumber}`);
  }

  return cleanupTitle(titleParts.join(' '));
}

function inferIssues({
  category,
  entityTitleGuess,
  fileKind,
  parsedEpisodeNumber,
  relativePath,
  segments,
}: {
  category: MediaLibraryCategory;
  entityTitleGuess?: string;
  fileKind: MediaLibraryFileKind;
  parsedEpisodeNumber?: number;
  relativePath: string;
  segments: string[];
}) {
  const issues: string[] = [];

  if (!entityTitleGuess) {
    issues.push('missing-title-guess');
  }

  if (
    fileKind === 'video' &&
    (category === 'anime-series' || category === 'series') &&
    parsedEpisodeNumber === undefined &&
    !isStandaloneSpecialPath(relativePath)
  ) {
    issues.push('missing-episode-number');
  }

  if (category === 'anime-series' && segments.length > 4) {
    issues.push('nested-franchise-structure');
  }

  if (segments.some((segment) => /^season\s+\d+/iu.test(segment))) {
    issues.push('non-canonical-season-case');
  }

  if (relativePath.includes('  ')) {
    issues.push('double-space-in-path');
  }

  return issues;
}

function buildCanonicalFilename({
  category,
  entityTitleGuess,
  extension,
  parsedEpisodeNumber,
  parsedPartNumber,
  parsedQuality,
  parsedSeasonNumber,
}: {
  category: MediaLibraryCategory;
  entityTitleGuess: string;
  extension: string;
  parsedEpisodeNumber?: number;
  parsedPartNumber?: number;
  parsedQuality?: string;
  parsedSeasonNumber?: number;
}) {
  const safeTitle = sanitizePathPart(entityTitleGuess);
  const qualitySuffix = parsedQuality ? ` - ${parsedQuality}` : '';

  if (category === 'anime-movie' || category === 'movie') {
    return `${safeTitle} - Movie${qualitySuffix}${extension}`;
  }

  const episodeToken =
    parsedEpisodeNumber === undefined
      ? 'Episode Unknown'
      : `E${pad2(parsedEpisodeNumber)}`;
  const seasonToken =
    parsedSeasonNumber === undefined ? undefined : `S${pad2(parsedSeasonNumber)}`;
  const partToken =
    parsedPartNumber === undefined ? undefined : `P${pad2(parsedPartNumber)}`;
  const numbering = [seasonToken, partToken, episodeToken]
    .filter(Boolean)
    .join('');

  return `${safeTitle} - ${numbering}${qualitySuffix}${extension}`;
}

function canonicalCategoryFolder(category: MediaLibraryCategory) {
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

function parseEpisodeNumber(value: string) {
  const patterns = [
    /(?:^|[^A-Za-z0-9])S\d{1,2}[_\s.-]*E0?(\d{1,3})(?=$|[^A-Za-z0-9])/iu,
    /(?:^|[^A-Za-z0-9])EP[_\s.-]*0?(\d{1,3})(?=$|[^A-Za-z0-9])/iu,
    /(?:^|[^A-Za-z0-9])E0?(\d{1,3})(?=$|[^A-Za-z0-9])/iu,
    /(?:^|[^A-Za-z0-9])TV[_\s.-]*0?(\d{1,3})(?=$|[^A-Za-z0-9])/iu,
    /الحلقة\s+0?(\d{1,3})/u,
    /اوفا\s+0?(\d{1,3})/u,
    /(?:^|[^A-Za-z0-9])0?(\d{1,3})\s*(?:\[|\(|$)/u,
    /(?:^|[^A-Za-z0-9])0?(\d{1,3})(?:[_\s.-]*(?:END|الأخيرة))?(?=\.[A-Za-z0-9]+$|$)/iu,
  ];

  return parseFirstNumber(value, patterns);
}

function parseSeasonNumber(value: string) {
  return parseFirstNumber(value, [
    /\bSeason\s*0?(\d{1,2})\b/iu,
    /\bS(\d{1,2})\b/iu,
  ]);
}

function parsePartNumber(value: string) {
  return parseFirstNumber(value, [/\bPart\s*0?(\d{1,2})\b/iu]);
}

function parseFirstNumber(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const parsed = match?.[1] ? Number(match[1]) : undefined;

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseQuality(value: string) {
  const upper = value.toUpperCase();

  if (upper.includes('FHD') || upper.includes('1080P')) {
    return 'FHD';
  }

  if (upper.includes('HD') || upper.includes('720P')) {
    return 'HD';
  }

  if (upper.includes('SD') || upper.includes('480P')) {
    return 'SD';
  }

  return undefined;
}

function parseSource(filename: string) {
  const bracketed = filename.match(/^\[([^\]]+)\]/u)?.[1];

  if (bracketed) {
    return bracketed;
  }

  return undefined;
}

function inferNoteKind(filename: string) {
  const normalized = filename.toLowerCase();

  if (normalized.includes('watch') && normalized.includes('order')) {
    return 'watch-order';
  }

  return 'note';
}

function expandSeasonShorthand(value: string) {
  return value.replace(/\bS(\d{1,2})\b/giu, 'Season $1');
}

function isSeasonFolder(value: string) {
  return /\b(season|part)\s*\d{1,2}\b/iu.test(value);
}

function isStandaloneSpecialPath(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes('movie') ||
    normalized.includes('ova') ||
    normalized.includes('special') ||
    normalized.includes('اوفا')
  );
}

function hasSeasonToken(value: string, seasonNumber: number) {
  return new RegExp(`\\b(?:season\\s*0?${seasonNumber}|s0?${seasonNumber})\\b`, 'iu').test(
    value,
  );
}

function hasPartToken(value: string, partNumber: number) {
  return new RegExp(`\\bpart\\s*0?${partNumber}\\b`, 'iu').test(value);
}

function cleanupTitle(value: string) {
  return value
    .replace(/\[[^\]]+\]/gu, ' ')
    .replace(/\bBD[-\s]?(?:FHD|HD|SD)\b/giu, ' ')
    .replace(/\b(?:FHD|HD|SD|1080p|720p|480p)\b/giu, ' ')
    .replace(/\b(?:Movie|الفيلم|الفلم|فيلم)\b/giu, 'Movie')
    .replace(/\s+/gu, ' ')
    .trim();
}

function titleFromFilename(filename: string) {
  return basename(filename, extname(filename))
    .replace(/\./gu, ' ')
    .replace(/_/gu, ' ');
}

function sanitizePathPart(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(record).sort(([firstKey], [secondKey]) =>
      firstKey.localeCompare(secondKey),
    ),
  );
}

function recordLines(record: Record<string, number>) {
  const entries = Object.entries(record);

  if (!entries.length) {
    return ['- none'];
  }

  return entries.map(([key, value]) => `- ${key}: \`${value}\``);
}

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toPosixPath(value: string) {
  return value.split(sep).join('/');
}
