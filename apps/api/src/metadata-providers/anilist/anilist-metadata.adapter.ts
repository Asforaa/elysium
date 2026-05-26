import type {
  AnimeAiringEpisode,
  AnimeAiringScheduleOptions,
  AnimeAiringSchedulePage,
  AnimeCharacter,
  AnimeImage,
  AnimeMetadataDetails,
  AnimeMetadataSearchOptions,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
  AnimeRelation,
  AnimeTitle,
  AnimeVoiceActor,
  FuzzyDate,
  MetadataProvider,
  NextAiringEpisode,
} from '@elysium/shared';
import type { MetadataProviderAdapter } from '../metadata-provider-adapter';

interface AniListTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
  userPreferred: string | null;
}

interface AniListImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
  color?: string | null;
}

interface AniListDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

interface AniListStudioNode {
  id: number;
  name: string;
  siteUrl?: string | null;
}

interface AniListTag {
  name: string;
  rank?: number | null;
  isMediaSpoiler?: boolean | null;
}

interface AniListPerson {
  id: number;
  name?: {
    full?: string | null;
    userPreferred?: string | null;
    native?: string | null;
  } | null;
  image?: {
    large?: string | null;
    medium?: string | null;
  } | null;
  siteUrl?: string | null;
}

interface AniListCharacterEdge {
  role?: string | null;
  node?: AniListPerson | null;
  voiceActors?: AniListPerson[] | null;
}

interface AniListMediaBase {
  id: number;
  idMal?: number | null;
  type?: string | null;
  title?: AniListTitle | null;
  description?: string | null;
  coverImage?: AniListImage | null;
  bannerImage?: string | null;
  episodes?: number | null;
  duration?: number | null;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: AniListDate | null;
  genres?: string[] | null;
  synonyms?: string[] | null;
  averageScore?: number | null;
  favourites?: number | null;
  popularity?: number | null;
  trending?: number | null;
  updatedAt?: number | null;
  siteUrl?: string | null;
}

interface AniListMediaDetails extends AniListMediaBase {
  meanScore?: number | null;
  source?: string | null;
  countryOfOrigin?: string | null;
  endDate?: AniListDate | null;
  studios?: {
    nodes?: AniListStudioNode[] | null;
  } | null;
  tags?: AniListTag[] | null;
  characters?: {
    edges?: AniListCharacterEdge[] | null;
  } | null;
  relations?: {
    edges?: AniListRelationEdge[] | null;
  } | null;
  trailer?: {
    id?: string | null;
    site?: string | null;
    thumbnail?: string | null;
  } | null;
  nextAiringEpisode?: {
    airingAt?: number | null;
    episode?: number | null;
    timeUntilAiring?: number | null;
  } | null;
}

interface AniListRelationEdge {
  relationType?: string | null;
  node?: AniListMediaBase | null;
}

interface AniListPageInfo {
  currentPage?: number | null;
  hasNextPage?: boolean | null;
  perPage?: number | null;
  total?: number | null;
}

interface AniListAiringSchedule {
  id: number;
  episode?: number | null;
  airingAt?: number | null;
  media?: AniListMediaBase | null;
}

interface AniListGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const ANILIST_SEARCH_SORTS: Record<AnimeMetadataSearchSort, string[]> = {
  title: ['TITLE_ROMAJI'],
  popularity: ['POPULARITY_DESC'],
  'average-score': ['SCORE_DESC'],
  trending: ['TRENDING_DESC'],
  favorites: ['FAVOURITES_DESC'],
  'date-added': ['ID_DESC'],
  'release-date': ['START_DATE_DESC'],
};

const SEARCH_QUERY = `
  query ElysiumAnimeSearch($search: String, $perPage: Int!, $season: MediaSeason, $seasonYear: Int, $sort: [MediaSort]) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, season: $season, seasonYear: $seasonYear, sort: $sort) {
        id
        idMal
        type
        title {
          romaji
          english
          native
          userPreferred
        }
        description(asHtml: false)
        coverImage {
          extraLarge
          large
          medium
          color
        }
        bannerImage
        episodes
        duration
        format
        status
        season
        seasonYear
        startDate {
          year
          month
          day
        }
        genres
        synonyms
        averageScore
        popularity
        favourites
        trending
        updatedAt
        siteUrl
      }
    }
  }
`;

const AIRING_SCHEDULE_QUERY = `
  query ElysiumAiringSchedule($page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
        total
      }
      airingSchedules(notYetAired: false, sort: TIME_DESC) {
        id
        episode
        airingAt
        media {
          id
          idMal
          type
          title {
            romaji
            english
            native
            userPreferred
          }
          description(asHtml: false)
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          episodes
          duration
          format
          status
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          genres
          synonyms
          averageScore
          popularity
          favourites
          trending
          updatedAt
          siteUrl
        }
      }
    }
  }
`;

const AIRING_SCHEDULE_BY_MEDIA_QUERY = `
  query ElysiumAiringScheduleByMedia($page: Int!, $perPage: Int!, $mediaIdIn: [Int]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        perPage
        total
      }
      airingSchedules(mediaId_in: $mediaIdIn, notYetAired: false, sort: TIME_DESC) {
        id
        episode
        airingAt
        media {
          id
          idMal
          type
          title {
            romaji
            english
            native
            userPreferred
          }
          description(asHtml: false)
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          episodes
          duration
          format
          status
          season
          seasonYear
          startDate {
            year
            month
            day
          }
          genres
          synonyms
          averageScore
          popularity
          favourites
          trending
          updatedAt
          siteUrl
        }
      }
    }
  }
`;

const DETAILS_QUERY = `
  query ElysiumAnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      type
      title {
        romaji
        english
        native
        userPreferred
      }
      description(asHtml: false)
      coverImage {
        extraLarge
        large
        medium
        color
      }
      bannerImage
      episodes
      duration
      format
      status
      season
      seasonYear
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      genres
      synonyms
      averageScore
      meanScore
      popularity
      favourites
      trending
      updatedAt
      source
      countryOfOrigin
      siteUrl
      studios(isMain: true) {
        nodes {
          id
          name
          siteUrl
        }
      }
      tags {
        name
        rank
        isMediaSpoiler
      }
      characters(page: 1, perPage: 12) {
        edges {
          role
          node {
            id
            name {
              full
              native
              userPreferred
            }
            image {
              large
              medium
            }
            siteUrl
          }
          voiceActors {
            id
            name {
              full
              userPreferred
            }
            image {
              medium
            }
            siteUrl
          }
        }
      }
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            idMal
            type
            title {
              romaji
              english
              native
              userPreferred
            }
            description(asHtml: false)
            coverImage {
              extraLarge
              large
              medium
              color
            }
            bannerImage
            episodes
            duration
            format
            status
            season
            seasonYear
            startDate {
              year
              month
              day
            }
            genres
            synonyms
            averageScore
            popularity
            favourites
            trending
            updatedAt
            siteUrl
          }
        }
      }
      trailer {
        id
        site
        thumbnail
      }
      nextAiringEpisode {
        airingAt
        episode
        timeUntilAiring
      }
    }
  }
`;

export class AniListMetadataAdapter implements MetadataProviderAdapter {
  readonly provider: MetadataProvider = {
    id: 'anilist',
    name: 'AniList',
    baseUrl: 'https://anilist.co',
    enabled: true,
  };

  async searchAnime(
    query: string,
    options: AnimeMetadataSearchOptions = {},
  ): Promise<AnimeMetadataSearchResult[]> {
    const data = await this.postGraphql<{
      Page?: { media?: AniListMediaBase[] | null } | null;
    }>(SEARCH_QUERY, {
      search: query.trim() || null,
      perPage: 12,
      season: options.season ?? null,
      seasonYear: options.seasonYear ?? null,
      sort: ANILIST_SEARCH_SORTS[options.sort ?? 'popularity'],
    });

    return (data.Page?.media ?? []).map((media) => this.toSearchResult(media));
  }

  async getAnimeDetails(id: number): Promise<AnimeMetadataDetails> {
    const data = await this.postGraphql<{ Media?: AniListMediaDetails | null }>(
      DETAILS_QUERY,
      { id },
    );

    if (!data.Media) {
      throw new Error(`AniList anime not found: ${id}`);
    }

    return this.toDetails(data.Media);
  }

  async listAiringSchedule(
    options: AnimeAiringScheduleOptions = {},
  ): Promise<AnimeAiringSchedulePage> {
    const page = normalizePositiveInteger(options.page, 1);
    const perPage = Math.min(normalizePositiveInteger(options.perPage, 24), 50);
    const mediaIds = normalizeMediaIds(options.mediaIds);
    const data = await this.postGraphql<{
      Page?: {
        airingSchedules?: AniListAiringSchedule[] | null;
        pageInfo?: AniListPageInfo | null;
      } | null;
    }>(
      mediaIds.length ? AIRING_SCHEDULE_BY_MEDIA_QUERY : AIRING_SCHEDULE_QUERY,
      {
        page,
        perPage,
        ...(mediaIds.length ? { mediaIdIn: mediaIds } : {}),
      },
    );
    const pageInfo = data.Page?.pageInfo;

    return {
      hasNextPage: Boolean(pageInfo?.hasNextPage),
      items: (data.Page?.airingSchedules ?? [])
        .map((item) => this.toAiringEpisode(item))
        .filter((item): item is AnimeAiringEpisode => Boolean(item)),
      page: pageInfo?.currentPage ?? page,
      perPage: pageInfo?.perPage ?? perPage,
      total: pageInfo?.total ?? undefined,
    };
  }

  private async postGraphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const payload = (await response.json()) as
      | AniListGraphqlResponse<T>
      | undefined;

    if (!response.ok || payload?.errors?.length) {
      const message =
        payload?.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join('; ') || `${response.status} ${response.statusText}`;

      throw new Error(`AniList request failed: ${message}`);
    }

    if (!payload?.data) {
      throw new Error('AniList response did not include data');
    }

    return payload.data;
  }

  private toSearchResult(media: AniListMediaBase): AnimeMetadataSearchResult {
    const title = normalizeTitle(media.title);

    return {
      metadataProvider: this.provider.id,
      id: media.id,
      idMal: media.idMal ?? undefined,
      title,
      displayTitle: title.userPreferred,
      sourceSearchTitle: title.romaji ?? title.english ?? title.userPreferred,
      description: cleanDescription(media.description),
      coverImage: normalizeImage(media.coverImage),
      bannerImage: media.bannerImage ?? undefined,
      episodes: media.episodes ?? undefined,
      durationMinutes: media.duration ?? undefined,
      format: media.format ?? undefined,
      status: media.status ?? undefined,
      season: media.season ?? undefined,
      seasonYear: media.seasonYear ?? undefined,
      startDate: normalizeDate(media.startDate),
      genres: media.genres ?? [],
      synonyms: media.synonyms ?? [],
      averageScore: media.averageScore ?? undefined,
      favourites: media.favourites ?? undefined,
      popularity: media.popularity ?? undefined,
      trending: media.trending ?? undefined,
      updatedAt: media.updatedAt ?? undefined,
      siteUrl: media.siteUrl ?? undefined,
    };
  }

  private toAiringEpisode(
    item: AniListAiringSchedule,
  ): AnimeAiringEpisode | undefined {
    if (!item.id || !item.episode || !item.airingAt || !item.media) {
      return undefined;
    }

    return {
      id: item.id,
      episode: item.episode,
      airingAt: new Date(item.airingAt * 1000).toISOString(),
      anime: this.toSearchResult(item.media),
    };
  }

  private toDetails(media: AniListMediaDetails): AnimeMetadataDetails {
    return {
      ...this.toSearchResult(media),
      meanScore: media.meanScore ?? undefined,
      favourites: media.favourites ?? undefined,
      source: media.source ?? undefined,
      countryOfOrigin: media.countryOfOrigin ?? undefined,
      endDate: normalizeDate(media.endDate),
      studios:
        media.studios?.nodes?.map((studio) => ({
          id: studio.id,
          name: studio.name,
          siteUrl: studio.siteUrl ?? undefined,
        })) ?? [],
      tags:
        media.tags?.slice(0, 12).map((tag) => ({
          name: tag.name,
          rank: tag.rank ?? undefined,
          spoiler: tag.isMediaSpoiler ?? undefined,
        })) ?? [],
      characters: normalizeCharacters(media.characters?.edges),
      relations: normalizeRelations(media.relations?.edges, (relatedAnime) =>
        this.toSearchResult(relatedAnime),
      ),
      trailer: media.trailer
        ? {
            id: media.trailer.id ?? undefined,
            site: media.trailer.site ?? undefined,
            siteUrl: toTrailerUrl(media.trailer.id, media.trailer.site),
            thumbnail: media.trailer.thumbnail ?? undefined,
          }
        : undefined,
      nextAiringEpisode: normalizeNextAiringEpisode(media.nextAiringEpisode),
    };
  }
}

function normalizeTitle(title: AniListTitle | null | undefined): AnimeTitle {
  const userPreferred =
    title?.userPreferred ?? title?.romaji ?? title?.english ?? title?.native;

  return {
    romaji: title?.romaji ?? undefined,
    english: title?.english ?? undefined,
    native: title?.native ?? undefined,
    userPreferred: userPreferred ?? 'Untitled anime',
  };
}

function normalizeImage(
  image: AniListImage | null | undefined,
): AnimeImage | undefined {
  if (!image) {
    return undefined;
  }

  return {
    extraLarge: image.extraLarge ?? undefined,
    large: image.large ?? undefined,
    medium: image.medium ?? undefined,
    color: image.color ?? undefined,
  };
}

function normalizeDate(
  date: AniListDate | null | undefined,
): FuzzyDate | undefined {
  if (!date?.year && !date?.month && !date?.day) {
    return undefined;
  }

  return {
    year: date.year ?? undefined,
    month: date.month ?? undefined,
    day: date.day ?? undefined,
  };
}

function normalizeCharacters(
  edges: AniListCharacterEdge[] | null | undefined,
): AnimeCharacter[] {
  return (edges ?? [])
    .map((edge): AnimeCharacter | null => {
      const node = edge.node;
      const name = node?.name?.userPreferred ?? node?.name?.full;

      if (!node || !name) {
        return null;
      }

      const character: AnimeCharacter = {
        id: node.id,
        name,
        voiceActors: normalizeVoiceActors(edge.voiceActors),
      };

      if (node.name?.native) {
        character.nativeName = node.name.native;
      }

      if (edge.role) {
        character.role = edge.role;
      }

      if (node.image?.large ?? node.image?.medium) {
        character.imageUrl = node.image.large ?? node.image.medium ?? undefined;
      }

      if (node.siteUrl) {
        character.siteUrl = node.siteUrl;
      }

      return character;
    })
    .filter((character): character is AnimeCharacter => Boolean(character));
}

function normalizeVoiceActors(
  actors: AniListPerson[] | null | undefined,
): AnimeVoiceActor[] {
  return (actors ?? [])
    .slice(0, 3)
    .map((actor): AnimeVoiceActor | null => {
      const name = actor.name?.userPreferred ?? actor.name?.full;

      if (!name) {
        return null;
      }

      const voiceActor: AnimeVoiceActor = {
        id: actor.id,
        name,
      };

      if (actor.image?.medium) {
        voiceActor.imageUrl = actor.image.medium;
      }

      if (actor.siteUrl) {
        voiceActor.siteUrl = actor.siteUrl;
      }

      return voiceActor;
    })
    .filter((actor): actor is AnimeVoiceActor => Boolean(actor));
}

function normalizeRelations(
  edges: AniListRelationEdge[] | null | undefined,
  toSearchResult: (media: AniListMediaBase) => AnimeMetadataSearchResult,
): AnimeRelation[] {
  return (edges ?? [])
    .map((edge): AnimeRelation | null => {
      if (!edge.node || edge.node.type !== 'ANIME') {
        return null;
      }

      if (edge.relationType === 'PREQUEL') {
        return {
          kind: 'prequel',
          label: 'Previous',
          anime: toSearchResult(edge.node),
        };
      }

      if (edge.relationType === 'SEQUEL') {
        return {
          kind: 'sequel',
          label: 'Next',
          anime: toSearchResult(edge.node),
        };
      }

      return null;
    })
    .filter((relation): relation is AnimeRelation => Boolean(relation));
}

function normalizeNextAiringEpisode(
  nextAiringEpisode:
    | AniListMediaDetails['nextAiringEpisode']
    | null
    | undefined,
): NextAiringEpisode | undefined {
  if (
    !nextAiringEpisode?.airingAt ||
    !nextAiringEpisode.episode ||
    !nextAiringEpisode.timeUntilAiring
  ) {
    return undefined;
  }

  return {
    airingAt: new Date(nextAiringEpisode.airingAt * 1000).toISOString(),
    episode: nextAiringEpisode.episode,
    timeUntilAiringSeconds: nextAiringEpisode.timeUntilAiring,
  };
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function normalizeMediaIds(mediaIds: number[] | undefined) {
  return Array.from(
    new Set(
      (mediaIds ?? []).filter(
        (mediaId) => Number.isInteger(mediaId) && mediaId > 0,
      ),
    ),
  );
}

function cleanDescription(
  value: string | null | undefined,
): string | undefined {
  const cleaned = (value ?? '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&quot;/gu, '"')
    .replace(/&#039;/gu, "'")
    .replace(/&amp;/gu, '&')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  return cleaned || undefined;
}

function toTrailerUrl(
  id: string | null | undefined,
  site: string | null | undefined,
) {
  if (!id || site?.toLowerCase() !== 'youtube') {
    return undefined;
  }

  return `https://www.youtube.com/watch?v=${id}`;
}
