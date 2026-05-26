import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
} from "@elysium/shared";
import { searchAnimeMetadataPage } from "@/lib/api";

const EMPTY_ANIME_RESULTS: AnimeMetadataSearchResult[] = [];

export function useAnimeSearch({
  enabled,
  query,
  season,
  seasonYear,
  sort,
}: {
  enabled: boolean;
  query: string;
  season?: AnimeMetadataSeason;
  seasonYear?: number;
  sort: AnimeMetadataSearchSort;
}) {
  const searchQuery = useInfiniteQuery({
    queryKey: [
      "metadata",
      "anilist",
      "search",
      query,
      sort,
      season,
      seasonYear,
    ],
    queryFn: ({ pageParam }) =>
      searchAnimeMetadataPage(query, {
        page: Number(pageParam),
        perPage: 24,
        season,
        seasonYear,
        sort,
      }),
    enabled,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const results = useMemo(
    () =>
      searchQuery.data?.pages.flatMap((page) => page.items) ??
      EMPTY_ANIME_RESULTS,
    [searchQuery.data],
  );

  return {
    results,
    searchQuery,
  };
}
