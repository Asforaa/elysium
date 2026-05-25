export type SourceProviderId = "witanime" | (string & {});

export type HostProviderId =
  | "mediafire"
  | "gofile"
  | "workupload"
  | "mp4upload"
  | (string & {});

export type MediaKind = "anime" | "movie" | "series" | "episode" | "unknown";

export type MediaStatus = "airing" | "completed" | "unknown" | (string & {});

export type DownloadQuality = "SD" | "HD" | "FHD" | (string & {});

export type DownloadJobStatus =
  | "queued"
  | "resolving"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface SourceProvider {
  id: SourceProviderId;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export interface MediaSearchResult {
  sourceProvider: SourceProviderId;
  title: string;
  url: string;
  kind: MediaKind;
  posterUrl?: string;
  status?: MediaStatus;
  description?: string;
}

export interface MediaDetails extends MediaSearchResult {
  genres: string[];
  releaseYear?: string;
  season?: string;
  episodeCount?: string;
  episodeDuration?: string;
  externalUrls: ExternalUrl[];
}

export interface ExternalUrl {
  label: string;
  url: string;
}

export interface EpisodeSummary {
  sourceProvider: SourceProviderId;
  mediaTitle: string;
  title: string;
  number: string;
  url: string;
  posterUrl?: string;
  airedAt?: string;
}

export interface DownloadOption {
  sourceProvider: SourceProviderId;
  mediaTitle?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  quality: DownloadQuality;
  qualityLabel: string;
  hostProvider: HostProviderId;
  providerLabel: string;
  providerUrl: string;
  sourcePageUrl: string;
}

export interface ResolvedDownload {
  provider: HostProviderId;
  sourceUrl: string;
  directUrl?: string;
  filename?: string;
  sizeBytes?: number;
  expiresAt?: string;
  headers?: Record<string, string>;
  engine: "http" | "provider-cli" | "custom";
}

export interface DownloadJob {
  id: string;
  option: DownloadOption;
  status: DownloadJobStatus;
  destinationPath?: string;
  filename?: string;
  progressBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackProgress {
  id: string;
  sourceProvider?: SourceProviderId;
  mediaTitle: string;
  mediaUrl?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  filePath?: string;
  positionSeconds: number;
  durationSeconds?: number;
  completed: boolean;
  updatedAt: string;
}

export interface ProviderSmokeResult {
  provider: SourceProviderId;
  query: string;
  selectedMedia?: MediaSearchResult;
  selectedEpisode?: EpisodeSummary;
  resultCount: number;
  episodeCount: number;
  downloadOptionCount: number;
  downloadOptions: DownloadOption[];
}

export interface DatabaseHealth {
  ok: boolean;
  database?: string;
  version?: string;
  error?: string;
}
