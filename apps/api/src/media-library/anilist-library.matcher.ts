import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AniListMetadataAdapter } from '../metadata-providers/anilist/anilist-metadata.adapter';
import type { AnimeMetadataSearchResult } from '@elysium/shared';
import type {
  MediaLibraryCategory,
  MediaLibraryScanFile,
  MediaLibraryScanSummary,
} from './media-library.types';

export interface LocalAnimeGroup {
  category: MediaLibraryCategory;
  fileCount: number;
  key: string;
  localTitle: string;
  maxEpisode?: number;
  qualities: string[];
  samplePaths: string[];
  sources: string[];
}

export interface AniListMatchCandidate {
  averageScore?: number;
  canonicalTitle: string;
  englishTitle?: string;
  episodes?: number;
  format?: string;
  id: number;
  idMal?: number;
  nativeTitle?: string;
  romajiTitle?: string;
  score: number;
  siteUrl?: string;
  status?: string;
  synonyms: string[];
}

export interface LocalAnimeMatch {
  bestMatch?: AniListMatchCandidate;
  candidates: AniListMatchCandidate[];
  confidence: 'high' | 'medium' | 'review';
  local: LocalAnimeGroup;
  proposedElysiumId: string;
  searchQuery: string;
}

export interface LocalAnimeMatchReport {
  generatedAt: string;
  matches: LocalAnimeMatch[];
  rootPath: string;
  summary: {
    highConfidence: number;
    mediumConfidence: number;
    review: number;
    totalGroups: number;
  };
}

const DEFAULT_DELAY_MS = 850;

export async function matchLocalAnimeToAniList({
  delayMs = DEFAULT_DELAY_MS,
  filter,
  limit,
  scan,
}: {
  delayMs?: number;
  filter?: string;
  limit?: number;
  scan: MediaLibraryScanSummary;
}): Promise<LocalAnimeMatchReport> {
  const adapter = new AniListMetadataAdapter();
  const normalizedFilter = filter?.toLowerCase();
  const groups = groupLocalAnime(scan.files)
    .filter((group) =>
      normalizedFilter
        ? group.localTitle.toLowerCase().includes(normalizedFilter)
        : true,
    )
    .slice(0, limit);
  const matches: LocalAnimeMatch[] = [];
  const searchCache = new Map<string, AnimeMetadataSearchResult[]>();

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const searchQueries = toAniListSearchQueries(group.localTitle);

    console.error(
      `AniList match ${index + 1}/${groups.length}: ${searchQueries[0]}`,
    );

    const { query: searchQuery, results } = await searchFirstSuccessfulQuery({
      adapter,
      queries: searchQueries,
      searchCache,
    });
    const candidates = results
      .map((result) => toMatchCandidate(group, result))
      .sort((first, second) => second.score - first.score);
    const bestMatch = candidates[0];

    matches.push({
      bestMatch,
      candidates: candidates.slice(0, 5),
      confidence: confidenceFromScore(bestMatch?.score ?? 0),
      local: group,
      proposedElysiumId: formatElysiumId(index + 1),
      searchQuery,
    });

    if (index < groups.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return summarizeReport(scan.rootPath, matches);
}

async function searchAnimeWithRetry(
  adapter: AniListMetadataAdapter,
  searchQuery: string,
) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await adapter.searchAnime(searchQuery, { sort: 'popularity' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = message.toLowerCase().includes('too many requests');

      if (!rateLimited || attempt === maxAttempts) {
        console.warn(`AniList search failed for "${searchQuery}": ${message}`);
        return [];
      }

      const waitMs = 65_000 * attempt;
      console.warn(
        `AniList rate-limited "${searchQuery}", waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxAttempts}`,
      );
      await sleep(waitMs);
    }
  }

  return [];
}

async function searchFirstSuccessfulQuery({
  adapter,
  queries,
  searchCache,
}: {
  adapter: AniListMetadataAdapter;
  queries: string[];
  searchCache: Map<string, AnimeMetadataSearchResult[]>;
}) {
  let lastQuery = queries[0] ?? '';
  let lastResults: AnimeMetadataSearchResult[] = [];

  for (const query of queries) {
    lastQuery = query;

    if (searchCache.has(query)) {
      lastResults = searchCache.get(query) ?? [];
    } else {
      lastResults = await searchAnimeWithRetry(adapter, query);
      searchCache.set(query, lastResults);
    }

    if (lastResults.length) {
      break;
    }
  }

  return { query: lastQuery, results: lastResults };
}

export async function writeLocalAnimeMatchReports({
  report,
  reportDir,
}: {
  report: LocalAnimeMatchReport;
  reportDir: string;
}) {
  await mkdir(reportDir, { recursive: true });

  const stamp = report.generatedAt.replace(/[:.]/gu, '-');
  const jsonPath = join(reportDir, `anilist-match-${stamp}.json`);
  const markdownPath = join(reportDir, `anilist-match-${stamp}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, buildAniListMatchMarkdown(report));

  return { jsonPath, markdownPath };
}

function groupLocalAnime(files: MediaLibraryScanFile[]) {
  const groups = new Map<string, LocalAnimeGroup>();

  for (const file of files) {
    if (
      file.fileKind !== 'video' ||
      !file.entityTitleGuess ||
      (file.category !== 'anime-series' && file.category !== 'anime-movie')
    ) {
      continue;
    }

    const localTitle = stripNonEnglishNoise(file.entityTitleGuess);
    const key = `${file.category}:${normalizeForCompare(localTitle)}`;
    const existing = groups.get(key);

    if (existing) {
      existing.fileCount += 1;
      existing.maxEpisode = maxDefined(
        existing.maxEpisode,
        file.parsedEpisodeNumber,
      );
      addUnique(existing.qualities, file.parsedQuality);
      addUnique(existing.sources, file.parsedSource);

      if (existing.samplePaths.length < 3) {
        existing.samplePaths.push(file.relativePath);
      }

      continue;
    }

    groups.set(key, {
      category: file.category,
      fileCount: 1,
      key,
      localTitle,
      maxEpisode: file.parsedEpisodeNumber,
      qualities: file.parsedQuality ? [file.parsedQuality] : [],
      samplePaths: [file.relativePath],
      sources: file.parsedSource ? [file.parsedSource] : [],
    });
  }

  return Array.from(groups.values()).sort((first, second) =>
    first.localTitle.localeCompare(second.localTitle),
  );
}

function toMatchCandidate(
  group: LocalAnimeGroup,
  result: AnimeMetadataSearchResult,
): AniListMatchCandidate {
  const canonicalTitle =
    result.title.romaji ?? result.title.english ?? result.title.userPreferred;
  const titleScore = bestTitleScore(group.localTitle, result);
  const formatScore = formatCompatibilityScore(group.category, result.format);
  const episodeScore = episodeCompatibilityScore(group, result);
  const sequence = sequenceCompatibility(group, result);
  let score = clamp(
    titleScore * 0.72 +
      formatScore * 0.08 +
      episodeScore * 0.08 +
      sequence.score * 0.12,
  );

  if (sequence.localSeason && sequence.localSeason > 1 && !sequence.hasCandidateSeason) {
    score *= 0.72;
  }

  return {
    averageScore: result.averageScore,
    canonicalTitle,
    englishTitle: result.title.english,
    episodes: result.episodes,
    format: result.format,
    id: result.id,
    idMal: result.idMal,
    nativeTitle: result.title.native,
    romajiTitle: result.title.romaji,
    score: roundScore(score),
    siteUrl: result.siteUrl,
    status: result.status,
    synonyms: result.synonyms,
  };
}

function bestTitleScore(
  localTitle: string,
  result: AnimeMetadataSearchResult,
) {
  const names = [
    result.title.romaji,
    result.title.english,
    result.title.userPreferred,
    ...result.synonyms,
  ].filter((value): value is string => Boolean(value));

  return Math.max(
    ...names.map((name) =>
      Math.max(
        diceCoefficient(normalizeForCompare(localTitle), normalizeForCompare(name)),
        tokenScore(localTitle, name),
      ),
    ),
    0,
  );
}

function formatCompatibilityScore(
  category: MediaLibraryCategory,
  format: string | undefined,
) {
  if (!format) {
    return 0.4;
  }

  if (category === 'anime-movie') {
    return format === 'MOVIE' ? 1 : 0;
  }

  if (format === 'TV' || format === 'ONA' || format === 'OVA' || format === 'SPECIAL') {
    return 1;
  }

  return 0.25;
}

function episodeCompatibilityScore(
  group: LocalAnimeGroup,
  result: AnimeMetadataSearchResult,
) {
  if (group.category === 'anime-movie') {
    return result.format === 'MOVIE' ? 1 : 0.25;
  }

  if (!group.maxEpisode || !result.episodes) {
    return 0.5;
  }

  if (group.maxEpisode === result.episodes) {
    return 1;
  }

  if (group.maxEpisode < result.episodes) {
    return 0.7;
  }

  return 0.15;
}

function confidenceFromScore(score: number): LocalAnimeMatch['confidence'] {
  if (score >= 0.78) {
    return 'high';
  }

  if (score >= 0.62) {
    return 'medium';
  }

  return 'review';
}

function summarizeReport(rootPath: string, matches: LocalAnimeMatch[]) {
  return {
    generatedAt: new Date().toISOString(),
    matches,
    rootPath,
    summary: {
      highConfidence: matches.filter((match) => match.confidence === 'high')
        .length,
      mediumConfidence: matches.filter((match) => match.confidence === 'medium')
        .length,
      review: matches.filter((match) => match.confidence === 'review').length,
      totalGroups: matches.length,
    },
  };
}

function buildAniListMatchMarkdown(report: LocalAnimeMatchReport) {
  const lines = [
    '# Local Anime to AniList Match Report',
    '',
    `- Root: \`${report.rootPath}\``,
    `- Generated at: \`${report.generatedAt}\``,
    `- Total local anime groups: \`${report.summary.totalGroups}\``,
    `- High confidence: \`${report.summary.highConfidence}\``,
    `- Medium confidence: \`${report.summary.mediumConfidence}\``,
    `- Needs review: \`${report.summary.review}\``,
    '',
    '## Matches',
    '',
    '| Elysium ID | Confidence | Local title | Files | Local max ep | AniList romaji | AniList English | AniList ID | MAL ID | Format | AniList eps | Score |',
    '| --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | --- | ---: | ---: |',
    ...report.matches.map((match) => {
      const best = match.bestMatch;

      return `| ${[
        match.proposedElysiumId,
        match.confidence,
        escapeTable(match.local.localTitle),
        String(match.local.fileCount),
        match.local.maxEpisode?.toString() ?? '',
        escapeTable(best?.romajiTitle ?? best?.canonicalTitle ?? ''),
        escapeTable(best?.englishTitle ?? ''),
        best?.id.toString() ?? '',
        best?.idMal?.toString() ?? '',
        best?.format ?? '',
        best?.episodes?.toString() ?? '',
        best?.score.toFixed(3) ?? '',
      ].join(' | ')} |`;
    }),
    '',
    '## Review Details',
    '',
    ...report.matches
      .filter((match) => match.confidence !== 'high')
      .flatMap((match) => buildReviewLines(match)),
  ];

  return `${lines.join('\n')}\n`;
}

function buildReviewLines(match: LocalAnimeMatch) {
  const lines = [
    `### ${match.proposedElysiumId} - ${match.local.localTitle}`,
    '',
    `- Search query: \`${match.searchQuery}\``,
    `- Local files: \`${match.local.fileCount}\``,
    `- Local max episode: \`${match.local.maxEpisode ?? 'unknown'}\``,
    `- Sample path: \`${match.local.samplePaths[0] ?? 'none'}\``,
    '- Candidates:',
    ...match.candidates.map(
      (candidate) =>
        `  - ${candidate.romajiTitle ?? candidate.canonicalTitle} | AniList ${candidate.id} | MAL ${candidate.idMal ?? 'none'} | ${candidate.format ?? 'unknown'} | eps ${candidate.episodes ?? 'unknown'} | score ${candidate.score.toFixed(3)}`,
    ),
    '',
  ];

  return lines;
}

function toAniListSearchQueries(localTitle: string) {
  const primary = localTitle
    .replace(/\(\s*\d+(?:[.\s]\d+)?\s*\)/gu, ' ')
    .replace(/\bseason\s*0?1\b/giu, '')
    .replace(/\bpart\s*\d+\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const noSeason = localTitle
    .replace(/\(\s*\d+(?:[.\s]\d+)?\s*\)/gu, ' ')
    .replace(/\bseason\s*\d+\b/giu, '')
    .replace(/\bpart\s*\d+\b/giu, '')
    .replace(/\bmovie\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return Array.from(new Set([primary, noSeason, localTitle])).filter(Boolean);
}

function sequenceCompatibility(
  group: LocalAnimeGroup,
  result: AnimeMetadataSearchResult,
) {
  const localSeason = parseSequenceNumber(group.localTitle, 'season');

  if (!localSeason) {
    return {
      hasCandidateSeason: false,
      localSeason,
      score: 0.7,
    };
  }

  const candidateTitles = [
    result.title.romaji,
    result.title.english,
    result.title.userPreferred,
    ...result.synonyms,
  ].filter((value): value is string => Boolean(value));
  const candidateSeasons = candidateTitles
    .map((title) => parseSequenceNumber(title, 'season'))
    .filter((value): value is number => value !== undefined);

  if (!candidateSeasons.length) {
    return {
      hasCandidateSeason: false,
      localSeason,
      score: localSeason === 1 ? 1 : 0.2,
    };
  }

  return {
    hasCandidateSeason: true,
    localSeason,
    score: candidateSeasons.includes(localSeason) ? 1 : 0,
  };
}

function parseSequenceNumber(value: string, kind: 'season') {
  void kind;

  const normalized = value.toLowerCase();
  const patterns: RegExp[] = [
    /\bseason\s*(\d{1,2})\b/iu,
    /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/iu,
    /\bs(\d{1,2})\b/iu,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const parsed = match?.[1] ? Number(match[1]) : undefined;

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  if (/\bii\b/iu.test(value)) {
    return 2;
  }

  if (/\biii\b/iu.test(value)) {
    return 3;
  }

  if (/\biv\b/iu.test(value)) {
    return 4;
  }

  const trailingNumber = normalized.match(/(?:^|[^0-9])([2-9])\s*$/u)?.[1];

  return trailingNumber ? Number(trailingNumber) : undefined;
}

function stripNonEnglishNoise(value: string) {
  return value
    .replace(/[\u0600-\u06ff]+/gu, ' ')
    .replace(/\b(?:الحلقة|فيلم|الفيلم|الفلم|اوفا|مترجمة)\b/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
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

function tokenScore(first: string, second: string) {
  const firstTokens = new Set(normalizeForCompare(first).split(' ').filter(Boolean));
  const secondTokens = new Set(
    normalizeForCompare(second).split(' ').filter(Boolean),
  );
  const union = new Set([...firstTokens, ...secondTokens]);

  if (!union.size) {
    return 0;
  }

  let intersection = 0;

  for (const token of firstTokens) {
    if (secondTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
}

function diceCoefficient(first: string, second: string) {
  if (first === second) {
    return 1;
  }

  if (first.length < 2 || second.length < 2) {
    return 0;
  }

  const firstBigrams = toBigrams(first);
  const secondBigrams = toBigrams(second);
  let intersection = 0;

  for (const [bigram, count] of firstBigrams) {
    const secondCount = secondBigrams.get(bigram) ?? 0;
    intersection += Math.min(count, secondCount);
  }

  return (2 * intersection) / (first.length - 1 + second.length - 1);
}

function toBigrams(value: string) {
  const bigrams = new Map<string, number>();

  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);
    bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
  }

  return bigrams;
}

function addUnique(values: string[], value: string | undefined) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

function maxDefined(first: number | undefined, second: number | undefined) {
  if (first === undefined) {
    return second;
  }

  if (second === undefined) {
    return first;
  }

  return Math.max(first, second);
}

function formatElysiumId(index: number) {
  return `e${String(index).padStart(6, '0')}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeTable(value: string) {
  return value.replace(/\|/gu, '\\|');
}
