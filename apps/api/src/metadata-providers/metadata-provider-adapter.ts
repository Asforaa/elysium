import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  MetadataProvider,
} from '@elysium/shared';

export interface MetadataProviderAdapter {
  readonly provider: MetadataProvider;
  searchAnime(query: string): Promise<AnimeMetadataSearchResult[]>;
  getAnimeDetails(id: number): Promise<AnimeMetadataDetails>;
}
