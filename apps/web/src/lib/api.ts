import type { DownloadOption, EpisodeSummary, MediaSearchResult, SourceProvider } from '@elysium/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function listProviders(): Promise<SourceProvider[]> {
  return getJson('/providers');
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
