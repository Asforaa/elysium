import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";
import {
  DEFAULT_ANIME_SEARCH_SORT,
  fromAnimeSearchSortUrlValue,
  toAnimeSearchSortUrlValue,
} from "@/lib/anime-search";
import type { AnimeMetadataSeason } from "@elysium/shared";

const ANIME_SEASONS: AnimeMetadataSeason[] = [
  "WINTER",
  "SPRING",
  "SUMMER",
  "FALL",
];

export const Route = createFileRoute("/search/anime/")({
  component: AnimeSearchRoute,
  validateSearch: (search) => ({
    search: typeof search.search === "string" ? search.search : "",
    season: normalizeSeason(search.season),
    sort: search.sort
      ? String(search.sort)
      : toAnimeSearchSortUrlValue(DEFAULT_ANIME_SEARCH_SORT),
    title: typeof search.title === "string" ? search.title : undefined,
    year: normalizeYear(search.year),
  }),
});

function AnimeSearchRoute() {
  const search = Route.useSearch();

  return (
    <App
      animeSearchQuery={search.search}
      animeSearchRoute
      animeSearchSeason={search.season}
      animeSearchSeasonYear={search.year}
      animeSearchSort={fromAnimeSearchSortUrlValue(search.sort)}
      animeSearchTitle={search.title}
    />
  );
}

function normalizeSeason(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  return ANIME_SEASONS.includes(normalized as AnimeMetadataSeason)
    ? (normalized as AnimeMetadataSeason)
    : undefined;
}

function normalizeYear(value: unknown) {
  const normalized = Number(value);

  return Number.isInteger(normalized) &&
    normalized >= 1900 &&
    normalized <= 3000
    ? normalized
    : undefined;
}
