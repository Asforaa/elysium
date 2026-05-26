import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
} from "@elysium/shared";
import { listAnimeAiringSchedule, searchAnimeMetadata } from "@/lib/api";

const EMPTY_ANIME_RESULTS: AnimeMetadataSearchResult[] = [];

export function useAnimeHome({
  animeHomeEnabled,
  currentSeason,
  currentlyWatchingAnimeIds,
  homeEnabled,
}: {
  animeHomeEnabled: boolean;
  currentSeason: {
    season: AnimeMetadataSeason;
    year: number;
  };
  currentlyWatchingAnimeIds: number[];
  homeEnabled: boolean;
}) {
  const newPopularQuery = useQuery({
    queryKey: [
      "metadata",
      "anilist",
      "home",
      "new-popular",
      currentSeason.season,
      currentSeason.year,
    ],
    queryFn: () =>
      searchAnimeMetadata("", {
        season: currentSeason.season,
        seasonYear: currentSeason.year,
        sort: "popularity",
      }),
    enabled: homeEnabled || animeHomeEnabled,
    staleTime: 5 * 60_000,
  });

  const latestAiringQuery = useInfiniteQuery({
    queryKey: ["metadata", "anilist", "airing-schedule", "latest"],
    queryFn: ({ pageParam }) =>
      listAnimeAiringSchedule({
        page: Number(pageParam),
        perPage: 24,
      }),
    enabled: animeHomeEnabled,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const currentlyWatchingAiringQuery = useInfiniteQuery({
    queryKey: [
      "metadata",
      "anilist",
      "airing-schedule",
      "currently-watching",
      currentlyWatchingAnimeIds.join(","),
    ],
    queryFn: ({ pageParam }) =>
      listAnimeAiringSchedule({
        mediaIds: currentlyWatchingAnimeIds,
        page: Number(pageParam),
        perPage: 12,
      }),
    enabled: animeHomeEnabled && currentlyWatchingAnimeIds.length > 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const newPopularAnime = newPopularQuery.data ?? EMPTY_ANIME_RESULTS;
  const latestAiringEpisodes = useMemo(
    () => latestAiringQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [latestAiringQuery.data],
  );
  const currentlyWatchingAiringEpisodes = useMemo(
    () =>
      currentlyWatchingAiringQuery.data?.pages.flatMap((page) => page.items) ??
      [],
    [currentlyWatchingAiringQuery.data],
  );

  return {
    currentlyWatchingAiringEpisodes,
    currentlyWatchingAiringQuery,
    latestAiringEpisodes,
    latestAiringQuery,
    newPopularAnime,
    newPopularQuery,
  };
}
