import type {
  AnimeCharacter,
  AnimeImage,
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
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
  popularity?: number | null;
  siteUrl?: string | null;
}

interface AniListMediaDetails extends AniListMediaBase {
  meanScore?: number | null;
  favourites?: number | null;
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

interface AniListGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

const SEARCH_QUERY = `
  query ElysiumAnimeSearch($search: String!, $perPage: Int!) {
    Page(page: 1, perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        idMal
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
        siteUrl
      }
    }
  }
`;

const DETAILS_QUERY = `
  query ElysiumAnimeDetails($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      idMal
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

  async searchAnime(query: string): Promise<AnimeMetadataSearchResult[]> {
    const data = await this.postGraphql<{
      Page?: { media?: AniListMediaBase[] | null } | null;
    }>(SEARCH_QUERY, { search: query, perPage: 8 });

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
      popularity: media.popularity ?? undefined,
      siteUrl: media.siteUrl ?? undefined,
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
