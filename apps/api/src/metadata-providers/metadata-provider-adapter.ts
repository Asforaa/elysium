import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchOptions,
  AnimeMetadataSearchResult,
  MetadataProvider,
} from '@elysium/shared';

export interface MetadataProviderAdapter {
  readonly provider: MetadataProvider;
  searchAnime(
    query: string,
    options?: AnimeMetadataSearchOptions,
  ): Promise<AnimeMetadataSearchResult[]>;
  getAnimeDetails(id: number): Promise<AnimeMetadataDetails>;
}
