import type {
  AnimeAiringScheduleOptions,
  AnimeAiringSchedulePage,
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
  listAiringSchedule(
    options?: AnimeAiringScheduleOptions,
  ): Promise<AnimeAiringSchedulePage>;
  getAnimeDetails(id: number): Promise<AnimeMetadataDetails>;
}
