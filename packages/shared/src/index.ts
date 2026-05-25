export type SourceProviderId = "witanime" | (string & {});

export type MetadataProviderId = "anilist" | (string & {});

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

export type DownloadJobEngine = "local-http" | "local-segmented" | "local-mega";

export interface SourceProvider {
  id: SourceProviderId;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export interface MetadataProvider {
  id: MetadataProviderId;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export interface AnimeTitle {
  romaji?: string;
  english?: string;
  native?: string;
  userPreferred: string;
}

export type AnimeMetadataSearchSort =
  | "title"
  | "popularity"
  | "average-score"
  | "trending"
  | "favorites"
  | "date-added"
  | "release-date";

export interface AnimeMetadataSearchOptions {
  sort?: AnimeMetadataSearchSort;
}

export interface AnimeImage {
  extraLarge?: string;
  large?: string;
  medium?: string;
  color?: string;
}

export interface FuzzyDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface AnimeMetadataSearchResult {
  metadataProvider: MetadataProviderId;
  id: number;
  idMal?: number;
  title: AnimeTitle;
  displayTitle: string;
  sourceSearchTitle: string;
  description?: string;
  coverImage?: AnimeImage;
  bannerImage?: string;
  episodes?: number;
  durationMinutes?: number;
  format?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  startDate?: FuzzyDate;
  genres: string[];
  synonyms: string[];
  averageScore?: number;
  favourites?: number;
  popularity?: number;
  trending?: number;
  updatedAt?: number;
  siteUrl?: string;
}

export interface AnimeCharacter {
  id: number;
  name: string;
  nativeName?: string;
  role?: string;
  imageUrl?: string;
  siteUrl?: string;
  voiceActors: AnimeVoiceActor[];
}

export interface AnimeVoiceActor {
  id: number;
  name: string;
  imageUrl?: string;
  siteUrl?: string;
}

export interface AnimeStudio {
  id: number;
  name: string;
  siteUrl?: string;
}

export interface AnimeTag {
  name: string;
  rank?: number;
  spoiler?: boolean;
}

export interface AnimeTrailer {
  id?: string;
  site?: string;
  siteUrl?: string;
  thumbnail?: string;
}

export interface NextAiringEpisode {
  airingAt: string;
  episode: number;
  timeUntilAiringSeconds: number;
}

export type AnimeRelationKind = "prequel" | "sequel";

export type AnimeRelationLabel = "Previous" | "Next";

export interface AnimeRelation {
  kind: AnimeRelationKind;
  label: AnimeRelationLabel;
  anime: AnimeMetadataSearchResult;
}

export interface AnimeMetadataDetails extends AnimeMetadataSearchResult {
  meanScore?: number;
  source?: string;
  countryOfOrigin?: string;
  endDate?: FuzzyDate;
  studios: AnimeStudio[];
  tags: AnimeTag[];
  characters: AnimeCharacter[];
  relations: AnimeRelation[];
  trailer?: AnimeTrailer;
  nextAiringEpisode?: NextAiringEpisode;
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

export interface StreamingOption {
  sourceProvider: SourceProviderId;
  mediaTitle?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  providerLabel: string;
  hostProvider: HostProviderId;
  embedUrl: string;
  embeddable?: boolean;
  unsupportedReason?: string;
  sourcePageUrl: string;
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

export interface DownloadMediaContext {
  metadataProvider?: MetadataProviderId;
  metadataId?: number;
  displayTitle?: string;
  sourceSearchTitle?: string;
  coverImageUrl?: string;
  bannerImageUrl?: string;
  sourceProvider?: SourceProviderId;
  sourceMediaTitle?: string;
  sourceMediaUrl?: string;
  episodeTitle?: string;
  episodeNumber?: string;
}

export interface CreateDownloadJobRequest {
  option: DownloadOption;
  mediaContext?: DownloadMediaContext;
}

export interface ResolvedDownload {
  provider: HostProviderId;
  sourceUrl: string;
  directUrl?: string;
  filename?: string;
  sizeBytes?: number;
  expiresAt?: string;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  engine: "http" | "provider-cli" | "custom";
}

export interface DownloadJob {
  id: string;
  option: DownloadOption;
  mediaContext?: DownloadMediaContext;
  status: DownloadJobStatus;
  engine?: DownloadJobEngine;
  resolved?: ResolvedDownload;
  destinationPath?: string;
  filename?: string;
  progressBytes: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  errorMessage?: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface LocalMediaFile {
  id: string;
  downloadJobId: string;
  mediaContext?: DownloadMediaContext;
  metadataProvider?: MetadataProviderId;
  metadataId?: number;
  displayTitle?: string;
  sourceSearchTitle?: string;
  coverImageUrl?: string;
  bannerImageUrl?: string;
  sourceProvider?: SourceProviderId;
  sourceMediaTitle?: string;
  sourceMediaUrl?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  quality: DownloadQuality;
  hostProvider: HostProviderId;
  filePath: string;
  filename: string;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DownloadedAnime {
  key: string;
  metadataProvider?: MetadataProviderId;
  metadataId?: number;
  displayTitle: string;
  sourceSearchTitle?: string;
  coverImageUrl?: string;
  bannerImageUrl?: string;
  sourceProvider?: SourceProviderId;
  sourceMediaTitle?: string;
  sourceMediaUrl?: string;
  files: LocalMediaFile[];
  updatedAt: string;
}

export interface PlaybackProgress {
  id: string;
  localMediaFileId?: string;
  metadataProvider?: MetadataProviderId;
  metadataId?: number;
  sourceProvider?: SourceProviderId;
  sourceMediaUrl?: string;
  episodeUrl?: string;
  mediaTitle?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  positionSeconds: number;
  durationSeconds?: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavePlaybackProgressRequest {
  localMediaFileId?: string;
  metadataProvider?: MetadataProviderId;
  metadataId?: number;
  sourceProvider?: SourceProviderId;
  sourceMediaUrl?: string;
  episodeUrl?: string;
  mediaTitle?: string;
  episodeTitle?: string;
  episodeNumber?: string;
  positionSeconds: number;
  durationSeconds?: number;
  completed?: boolean;
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
