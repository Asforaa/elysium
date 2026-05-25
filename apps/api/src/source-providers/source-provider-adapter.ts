import type {
  DownloadOption,
  EpisodeSummary,
  MediaDetails,
  MediaSearchResult,
  SourceProvider,
  StreamingOption,
} from '@elysium/shared';

export interface SourceProviderAdapter {
  readonly provider: SourceProvider;
  search(query: string): Promise<MediaSearchResult[]>;
  getMediaDetails(mediaUrl: string): Promise<MediaDetails>;
  getEpisodes(mediaUrl: string): Promise<EpisodeSummary[]>;
  getDownloadOptions(episodeUrl: string): Promise<DownloadOption[]>;
  getStreamingOptions?(episodeUrl: string): Promise<StreamingOption[]>;
}
