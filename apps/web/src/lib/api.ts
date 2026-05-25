import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  MediaSearchResult,
  SourceProvider,
  SourceProviderId,
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
  return getJson(`/providers/search?q=${encodeURIComponent(query)}`);
}

export async function getEpisodes(
  providerId: SourceProviderId,
  mediaUrl: string,
): Promise<EpisodeSummary[]> {
  return getJson(`/providers/${providerId}/episodes?url=${encodeURIComponent(mediaUrl)}`);
}

export async function getDownloadOptions(
  providerId: SourceProviderId,
  episodeUrl: string,
): Promise<DownloadOption[]> {
  return getJson(`/providers/${providerId}/download-options?url=${encodeURIComponent(episodeUrl)}`);
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  return getJson('/downloads');
}

export async function startDownload(option: DownloadOption): Promise<DownloadJob> {
  return sendJson('/downloads', { option });
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

async function sendJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });

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
