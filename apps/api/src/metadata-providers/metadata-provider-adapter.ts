import type {
  AnimeAiringScheduleOptions,
  AnimeAiringSchedulePage,
  AnimeMetadataDetails,
  AnimeMetadataSearchPage,
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
  searchAnimePage(
    query: string,
    options?: AnimeMetadataSearchOptions,
  ): Promise<AnimeMetadataSearchPage>;
  listAiringSchedule(
    options?: AnimeAiringScheduleOptions,
  ): Promise<AnimeAiringSchedulePage>;
  getAnimeDetails(id: number): Promise<AnimeMetadataDetails>;
}
