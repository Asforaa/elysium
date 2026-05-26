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

interface ManualAniListMatchHint {
  expectedAniListId?: number;
  expectedMalId?: number;
  match: RegExp;
  queries: string[];
  titleAliases?: string[];
}

const DEFAULT_DELAY_MS = 850;
const MANUAL_MATCH_HINTS: ManualAniListMatchHint[] = [
  {
    expectedAniListId: 114121,
    expectedMalId: 41094,
    match: /xian wang de richang shenghuo\s+s?1\b/iu,
    queries: ['Xian Wang De Richang Shenghuo'],
  },
  {
    expectedAniListId: 126357,
    expectedMalId: 44069,
    match: /xian wang de richang shenghuo\s+s?2\b/iu,
    queries: ['Xian Wang De Richang Shenghuo 2'],
  },
  {
    expectedAniListId: 141852,
    expectedMalId: 50404,
    match: /xian wang de richang shenghuo\s+s?3\b/iu,
    queries: ['Xian Wang De Richang Shenghuo 3'],
  },
  {
    expectedAniListId: 20850,
    expectedMalId: 27899,
    match: /tokyo\s+ghoul\s+s?2\b/iu,
    queries: ['Tokyo Ghoul Root A', 'Tokyo Ghoul √A'],
    titleAliases: ['Tokyo Ghoul Root A', 'Tokyo Ghoul √A'],
  },
  {
    expectedAniListId: 169927,
    expectedMalId: 56838,
    match: /one\s+room.*hi(?:\s|-)?atari.*tenshi/iu,
    queries: [
      'One Room, Hi Atari Futsuu, Tenshi Tsuki.',
      'One Room, Hiatari Futsuu, Tenshi-tsuki.',
    ],
  },
  {
    expectedAniListId: 147864,
    expectedMalId: 51678,
    match: /(?:onnichan|onii-?chan)\s+wa\s+oshimai/iu,
    queries: ['Onii-chan wa Oshimai!'],
  },
  {
    expectedAniListId: 170130,
    expectedMalId: 56923,
    match: /lv2\s+kara\s+cheat/iu,
    queries: [
      'Lv2 Kara Cheat datta Moto Yuusha Kouho no Mattari Isekai Life',
      "Chillin' in Another World with Level 2 Super Cheat Powers",
    ],
  },
  {
    expectedAniListId: 142984,
    expectedMalId: 50631,
    match: /komi-?san.*(?:comyushou|komyushou).*s?2\b/iu,
    queries: [
      'Komi-san wa, Komyushou desu. 2',
      "Komi Can't Communicate Part 2",
    ],
  },
  {
    expectedAniListId: 146210,
    expectedMalId: 51213,
    match: /kinsou\s+no\s+vermeil/iu,
    queries: [
      'Kinsou no Vermeil: Gakeppuchi Majutsushi wa Saikyou no Yakusai to Mahou Sekai wo Tsuki Susumu',
      'Vermeil in Gold',
    ],
  },
  {
    expectedAniListId: 168138,
    expectedMalId: 56230,
    match: /(?:jiisan|jii-?san).*baasan|baa-?san.*wakagaeru/iu,
    queries: [
      'Jii-san Baa-san Wakagaeru',
      'Grandpa and Grandma Turn Young Again',
    ],
  },
  {
    expectedAniListId: 101166,
    expectedMalId: 37348,
    match: /(?:dungeon.*movie|orion\s+no\s+ya|arrow\s+of\s+the\s+orion)/iu,
    queries: [
      'Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka: Orion no Ya',
      'Is It Wrong to Try to Pick Up Girls in a Dungeon?: Arrow of the Orion',
    ],
  },
  {
    expectedAniListId: 142193,
    expectedMalId: 50481,
    match: /eiyuu-?ou.*bu\s+wo\s+kiwameru|hero-king.*squire/iu,
    queries: [
      'Eiyuu-ou, Bu wo Kiwameru Tame Tenseisu: Soshite, Sekai Saikyou no Minarai Kishi',
      'Reborn to Master the Blade: From Hero-King to Extraordinary Squire',
    ],
  },
  {
    expectedAniListId: 142769,
    expectedMalId: 50593,
    match: /^nentsnd$/iu,
    queries: [
      'Natsu e no Tunnel, Sayonara no Deguchi',
      'The Tunnel to Summer, the Exit of Goodbyes',
    ],
  },
  {
    expectedAniListId: 156111,
    expectedMalId: 54846,
    match: /(?:the\s+girl\s+downstairs|aishang\s+ta\s+de\s+liyou)/iu,
    queries: ['Aishang Ta De Liyou', 'The Girl Downstairs'],
  },
  {
    expectedAniListId: 21861,
    expectedMalId: 33506,
    match: /ao\s+no\s+exorcist\s+season\s+2/iu,
    queries: ['Ao no Exorcist: Kyoto Fujouou-hen', 'Blue Exorcist Kyoto Saga'],
  },
  {
    expectedAniListId: 101291,
    expectedMalId: 37450,
    match: /bunny\s+girl\s+senpai/iu,
    queries: ['Seishun Buta Yarou wa Bunny Girl Senpai no Yume wo Minai'],
  },
  {
    expectedAniListId: 1943,
    expectedMalId: 1943,
    match: /^paprika(?:\s*\(2006\))?$/iu,
    queries: ['Paprika'],
  },
  {
    expectedAniListId: 124845,
    expectedMalId: 43299,
    match: /wonder\s+egg/iu,
    queries: ['Wonder Egg Priority'],
  },
];

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
  const manualHints = manualMatchHintsForTitle(group.localTitle);
  const canonicalTitle =
    result.title.romaji ?? result.title.english ?? result.title.userPreferred;
  const titleScore = bestTitleScore(group.localTitle, result, manualHints);
  const formatScore = formatCompatibilityScore(group.category, result.format);
  const episodeScore = episodeCompatibilityScore(group, result);
  const sequence = sequenceCompatibility(group, result, manualHints);
  let score = clamp(
    titleScore * 0.72 +
      formatScore * 0.08 +
      episodeScore * 0.08 +
      sequence.score * 0.12,
  );

  if (manualHints.length) {
    if (manualHints.some((hint) => matchesExpectedHint(result, hint))) {
      score = Math.max(score, 0.96);
    } else if (
      manualHints.some((hint) => hint.expectedAniListId || hint.expectedMalId)
    ) {
      score *= 0.55;
    }
  }

  if (
    sequence.localSeason &&
    sequence.localSeason > 1 &&
    !sequence.hasCandidateSeason
  ) {
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
  manualHints: ManualAniListMatchHint[] = [],
) {
  const localNames = [
    localTitle,
    ...manualHints.flatMap((hint) => [
      ...hint.queries,
      ...(hint.titleAliases ?? []),
    ]),
  ].filter((value): value is string => Boolean(value));
  const candidateNames = [
    result.title.romaji,
    result.title.english,
    result.title.userPreferred,
    ...result.synonyms,
  ].filter((value): value is string => Boolean(value));

  return Math.max(
    ...localNames.flatMap((localName) =>
      candidateNames.map((candidateName) =>
        Math.max(
          diceCoefficient(
            normalizeForCompare(localName),
            normalizeForCompare(candidateName),
          ),
          tokenScore(localName, candidateName),
        ),
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

  if (
    format === 'TV' ||
    format === 'ONA' ||
    format === 'OVA' ||
    format === 'SPECIAL'
  ) {
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
  const manualQueries = manualMatchHintsForTitle(localTitle).flatMap(
    (hint) => hint.queries,
  );
  const primary = localTitle
    .replace(/\(\s*\d+(?:[.\s]\d+)?\s*\)/gu, ' ')
    .replace(/\bseason\s*0?1\b/giu, '')
    .replace(/\bs0?1\b/giu, '')
    .replace(/\bs0?([2-9])\b/giu, ' $1')
    .replace(/\bpart\s*\d+\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const noSeason = localTitle
    .replace(/\(\s*\d+(?:[.\s]\d+)?\s*\)/gu, ' ')
    .replace(/\bseason\s*\d+\b/giu, '')
    .replace(/\bs\d{1,2}\b/giu, '')
    .replace(/\bpart\s*\d+\b/giu, '')
    .replace(/\bmovie\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();

  return Array.from(
    new Set([...manualQueries, primary, noSeason, localTitle]),
  ).filter(Boolean);
}

function manualMatchHintsForTitle(localTitle: string) {
  return MANUAL_MATCH_HINTS.filter((hint) => hint.match.test(localTitle));
}

function matchesExpectedHint(
  result: AnimeMetadataSearchResult,
  hint: ManualAniListMatchHint,
) {
  return (
    result.id === hint.expectedAniListId ||
    (hint.expectedMalId !== undefined && result.idMal === hint.expectedMalId)
  );
}

function sequenceCompatibility(
  group: LocalAnimeGroup,
  result: AnimeMetadataSearchResult,
  manualHints: ManualAniListMatchHint[] = [],
) {
  const localSeason = parseSequenceNumber(group.localTitle, 'season');

  if (manualHints.some((hint) => matchesExpectedHint(result, hint))) {
    return {
      hasCandidateSeason: true,
      localSeason,
      score: 1,
    };
  }

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
  const firstTokens = new Set(
    normalizeForCompare(first).split(' ').filter(Boolean),
  );
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
