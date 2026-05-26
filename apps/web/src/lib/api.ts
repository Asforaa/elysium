import type {
  AnimeAiringScheduleOptions,
  AnimeAiringSchedulePage,
  AnimeMetadataDetails,
  AnimeMetadataSearchOptions,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
  DownloadedAnime,
  DownloadMediaContext,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  LocalMediaFile,
  MediaSearchResult,
  PlaybackProgress,
  SavePlaybackProgressRequest,
  SourceProvider,
  SourceProviderId,
  StreamingOption,
} from '@elysium/shared';

const API_BASE_URL = resolveApiBaseUrl();

export interface AuthUser {
  id: string;
  email: string;
  initials: string;
  name: string;
  profilePhotoDataUrl?: string;
}

export interface AuthSession {
  authenticated: boolean;
  user?: AuthUser;
}

export interface AuthCredentials {
  email?: string;
  name?: string;
  password?: string;
  profilePhotoDataUrl?: string;
}

export async function getAuthSession(): Promise<AuthSession> {
  return getJson('/auth/session');
}

export async function loginUser(credentials: AuthCredentials = {}): Promise<AuthSession> {
  return sendJson('/auth/login', credentials);
}

export async function signupUser(credentials: AuthCredentials = {}): Promise<AuthSession> {
  return sendJson('/auth/signup', credentials);
}

export async function logoutUser(): Promise<AuthSession> {
  return sendJson('/auth/logout', {});
}

export async function listProviders(): Promise<SourceProvider[]> {
  return getJson('/providers');
}

export async function searchAnimeMetadata(
  query: string,
  options: AnimeMetadataSearchOptions | AnimeMetadataSearchSort = 'popularity',
): Promise<AnimeMetadataSearchResult[]> {
  const normalizedOptions =
    typeof options === 'string' ? { sort: options } : options;
  const params = new URLSearchParams({
    q: query,
    sort: normalizedOptions.sort ?? 'popularity',
  });

  if (normalizedOptions.season) {
    params.set('season', normalizedOptions.season);
  }

  if (normalizedOptions.seasonYear) {
    params.set('year', String(normalizedOptions.seasonYear));
  }

  return getJson(`/metadata/anilist/search?${params.toString()}`);
}

export async function getAnimeMetadata(id: number): Promise<AnimeMetadataDetails> {
  return getJson(`/metadata/anilist/anime/${id}`);
}

export async function listAnimeAiringSchedule({
  mediaIds,
  page = 1,
  perPage = 24,
}: AnimeAiringScheduleOptions = {}): Promise<AnimeAiringSchedulePage> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });

  if (mediaIds?.length) {
    params.set('mediaIds', mediaIds.join(','));
  }

  return getJson(`/metadata/anilist/airing-schedule?${params.toString()}`);
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

export async function getStreamingOptions(
  providerId: SourceProviderId,
  episodeUrl: string,
): Promise<StreamingOption[]> {
  return getJson(`/providers/${providerId}/streaming-options?url=${encodeURIComponent(episodeUrl)}`);
}

export async function listDownloadJobs(): Promise<DownloadJob[]> {
  return getJson('/downloads');
}

export async function startDownload(
  option: DownloadOption,
  mediaContext?: DownloadMediaContext,
): Promise<DownloadJob> {
  return sendJson('/downloads', { mediaContext, option });
}

export async function retryDownload(id: string): Promise<DownloadJob> {
  return sendJson(`/downloads/${id}/retry`, {});
}

export async function deleteDownloadJob(id: string): Promise<DownloadJob> {
  return deleteJson(`/downloads/${id}`);
}

export async function listLocalMediaFiles(): Promise<LocalMediaFile[]> {
  return getJson('/library/files');
}

export async function listDownloadedAnime(): Promise<DownloadedAnime[]> {
  return getJson('/library/anime');
}

export async function deleteLocalMediaFile(id: string): Promise<DownloadJob> {
  return deleteJson(`/library/files/${id}`);
}

export function getLocalMediaStreamUrl(id: string): string {
  return `${API_BASE_URL}/library/files/${encodeURIComponent(id)}/stream`;
}

export async function getPlaybackProgress(
  query: Partial<SavePlaybackProgressRequest>,
): Promise<PlaybackProgress | undefined> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  return (await getJson<PlaybackProgress | null>(
    `/playback/progress?${params.toString()}`,
  )) ?? undefined;
}

export async function savePlaybackProgress(
  progress: SavePlaybackProgressRequest,
): Promise<PlaybackProgress> {
  return sendJson('/playback/progress', progress);
}

export async function listContinueWatching(): Promise<PlaybackProgress[]> {
  return getJson('/playback/continue-watching');
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const text = await response.text();

  return (text ? JSON.parse(text) : undefined) as T;
}

async function sendJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function getApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(payload.message)
      ? payload.message.join(', ')
      : payload.message;

    return message ?? `API request failed: ${response.status} ${response.statusText}`;
  } catch {
    return `API request failed: ${response.status} ${response.statusText}`;
  }
}

function resolveApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== 'undefined' && isLoopbackHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
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

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
