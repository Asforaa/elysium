import type { AnimeMetadataSearchSort } from '@elysium/shared';

export const DEFAULT_ANIME_SEARCH_SORT: AnimeMetadataSearchSort = 'popularity';

export const ANIME_SEARCH_SORT_OPTIONS: Array<{
  id: AnimeMetadataSearchSort;
  label: string;
  urlValue: string;
}> = [
  { id: 'title', label: 'Title', urlValue: 'TITLE_ROMAJI' },
  { id: 'popularity', label: 'Popularity', urlValue: 'POPULARITY_DESC' },
  { id: 'average-score', label: 'Average Score', urlValue: 'SCORE_DESC' },
  { id: 'trending', label: 'Trending', urlValue: 'TRENDING_DESC' },
  { id: 'favorites', label: 'Favorites', urlValue: 'FAVOURITES_DESC' },
  { id: 'date-added', label: 'Date Added', urlValue: 'ID_DESC' },
  { id: 'release-date', label: 'Release Date', urlValue: 'START_DATE_DESC' },
];

export function toAnimeSearchSortUrlValue(sort: AnimeMetadataSearchSort) {
  return (
    ANIME_SEARCH_SORT_OPTIONS.find((option) => option.id === sort)?.urlValue ??
    'POPULARITY_DESC'
  );
}

export function fromAnimeSearchSortUrlValue(
  value: unknown,
): AnimeMetadataSearchSort {
  if (typeof value !== 'string') {
    return DEFAULT_ANIME_SEARCH_SORT;
  }

  const normalized = value.trim().toUpperCase();
  const match = ANIME_SEARCH_SORT_OPTIONS.find(
    (option) =>
      option.urlValue === normalized || option.id.toUpperCase() === normalized,
  );

  return match?.id ?? DEFAULT_ANIME_SEARCH_SORT;
}
