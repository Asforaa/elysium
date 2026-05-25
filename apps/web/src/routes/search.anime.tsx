import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';
import {
  DEFAULT_ANIME_SEARCH_SORT,
  fromAnimeSearchSortUrlValue,
  toAnimeSearchSortUrlValue,
} from '@/lib/anime-search';

export const Route = createFileRoute('/search/anime')({
  component: AnimeSearchRoute,
  validateSearch: (search) => ({
    search: typeof search.search === 'string' ? search.search : '',
    sort: search.sort
      ? String(search.sort)
      : toAnimeSearchSortUrlValue(DEFAULT_ANIME_SEARCH_SORT),
  }),
});

function AnimeSearchRoute() {
  const search = Route.useSearch();

  return (
    <App
      animeSearchQuery={search.search}
      animeSearchRoute
      animeSearchSort={fromAnimeSearchSortUrlValue(search.sort)}
    />
  );
}
