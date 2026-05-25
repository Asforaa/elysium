import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  DownloadOption,
  EpisodeSummary,
  MediaSearchResult,
  SourceProvider,
} from '@elysium/shared';

const API_BASE_URL = resolveApiBaseUrl();

export async function listProviders(): Promise<SourceProvider[]> {
  return getJson('/providers');
}

export async function searchAnimeMetadata(query: string): Promise<AnimeMetadataSearchResult[]> {
  return getJson(`/metadata/anilist/search?q=${encodeURIComponent(query)}`);
}

export async function getAnimeMetadata(id: number): Promise<AnimeMetadataDetails> {
  return getJson(`/metadata/anilist/anime/${id}`);
}

export async function searchMedia(query: string): Promise<MediaSearchResult[]> {
  return getJson(`/providers/witanime/search?q=${encodeURIComponent(query)}`);
}

export async function getEpisodes(mediaUrl: string): Promise<EpisodeSummary[]> {
  return getJson(`/providers/witanime/episodes?url=${encodeURIComponent(mediaUrl)}`);
}

export async function getDownloadOptions(episodeUrl: string): Promise<DownloadOption[]> {
  return getJson(`/providers/witanime/download-options?url=${encodeURIComponent(episodeUrl)}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function resolveApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('elysium.localhost')
  ) {
    const port = window.location.port ? `:${window.location.port}` : '';
    const apiHost =
      window.location.hostname === 'elysium.localhost'
        ? 'api.elysium.localhost'
        : window.location.hostname.replace(
            '.elysium.localhost',
            '.api.elysium.localhost',
          );

    return `${window.location.protocol}//${apiHost}${port}`;
  }

  return 'http://localhost:3000';
}
