import { useEffect, useRef } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
} from "@elysium/shared";
import { ANIME_SEARCH_SORT_OPTIONS } from "@/lib/anime-search";
import { SEARCH_FILTERS } from "@/app/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErrorText, formatAnimeSeason, hideBrokenImage } from "@/lib/media-ui";

export function AnimeSearchBar({
  compact = false,
  focusTick,
  query,
  onQueryChange,
}: {
  compact?: boolean;
  focusTick: number;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query && !focusTick) {
      return;
    }

    const input = inputRef.current;

    if (!input || document.activeElement === input) {
      return;
    }

    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [focusTick, query]);

  return (
    <div
      className={cn(
        "relative w-full transition-[width,max-width] duration-200",
        compact
          ? "sm:w-56 sm:max-w-56 sm:focus-within:w-80 sm:focus-within:max-w-80"
          : "max-w-xl",
      )}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-label="Search"
        className="h-10 pl-9 pr-10"
        placeholder="search"
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query ? (
        <Button
          aria-label="Clear search"
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => onQueryChange("")}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

export function AnimeSearchResults({
  error,
  fetchingNextPage,
  hasNextPage,
  loading,
  results,
  routeTitle,
  season,
  seasonYear,
  selectedId,
  sort,
  onLoadMore,
  onSortChange,
  onSelect,
}: {
  error: Error | null;
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  loading: boolean;
  results: AnimeMetadataSearchResult[];
  routeTitle?: string;
  season?: AnimeMetadataSeason;
  seasonYear?: number;
  selectedId?: number;
  sort: AnimeMetadataSearchSort;
  onLoadMore: () => void;
  onSortChange: (sort: AnimeMetadataSearchSort) => void;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const selectedSort =
    ANIME_SEARCH_SORT_OPTIONS.find((option) => option.id === sort) ??
    ANIME_SEARCH_SORT_OPTIONS[1];
  const filterValues = SEARCH_FILTERS.map((filter) => {
    if (filter.label === "Year" && seasonYear) {
      return { ...filter, value: String(seasonYear) };
    }

    if (filter.label === "Season" && season) {
      return { ...filter, value: formatAnimeSeason(season) };
    }

    return filter;
  });
  const title =
    routeTitle ??
    (season && seasonYear
      ? `${formatAnimeSeason(season)} ${seasonYear} Anime`
      : undefined);
  const activeFilters = [
    seasonYear ? String(seasonYear) : undefined,
    season ? formatAnimeSeason(season) : undefined,
  ].filter((value): value is string => Boolean(value));

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || loading || fetchingNextPage || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "640px 0px" },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchingNextPage, hasNextPage, loading, onLoadMore]);

  return (
    <section className="space-y-6 py-2">
      <Dialog>
        <div className="flex flex-wrap items-center gap-3">
          {title ? (
            <h1 className="mr-1 text-3xl font-semibold">{title}</h1>
          ) : null}
          {activeFilters.map((filter) => (
            <Badge key={filter}>{filter}</Badge>
          ))}
          <DialogTrigger asChild>
            <Button
              aria-label="Open search filters"
              className="ml-auto size-11"
              size="icon"
              type="button"
              variant="secondary"
            >
              <SlidersHorizontal />
            </Button>
          </DialogTrigger>
        </div>
        <DialogContent aria-describedby={undefined} className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filterValues.map((filter) => (
              <div className="space-y-2" key={filter.label}>
                <p className="text-sm font-medium">{filter.label}</p>
                <Button
                  className="h-11 w-full justify-between px-3 text-muted-foreground"
                  disabled
                  type="button"
                  variant="secondary"
                >
                  {filter.value}
                  <ChevronDown />
                </Button>
              </div>
            ))}
            <div className="space-y-2">
              <p className="text-sm font-medium">Sort By</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="h-11 w-full justify-between px-3 text-muted-foreground"
                    type="button"
                    variant="secondary"
                  >
                    {selectedSort.label}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {ANIME_SEARCH_SORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      className={cn(
                        sort === option.id && "font-medium text-foreground",
                      )}
                      key={option.id}
                      onSelect={() => onSortChange(option.id)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <AnimeSearchSkeletonGrid />
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {results.map((item) => (
            <AnimeSearchResultCard
              item={item}
              key={item.id}
              selected={selectedId === item.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      <div ref={loadMoreRef} />
      {fetchingNextPage ? <AnimeSearchSkeletonGrid compact /> : null}

      {!loading && results.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          No AniList results found.
        </p>
      ) : null}
      {error ? <ErrorText error={error} /> : null}
    </section>
  );
}

export function AnimeSearchSkeletonGrid({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: compact ? 6 : 12 }, (_, index) => (
        <div className="space-y-3" key={index}>
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function AnimeSearchResultCard({
  item,
  selected,
  onSelect,
}: {
  item: AnimeMetadataSearchResult;
  selected: boolean;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const coverUrl =
    item.coverImage?.extraLarge ??
    item.coverImage?.large ??
    item.coverImage?.medium;

  return (
    <button
      className="group/search-result min-w-0 space-y-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={() => onSelect(item)}
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-md bg-muted">
        {coverUrl ? (
          <img
            alt={`${item.displayTitle} cover`}
            className="h-full w-full object-cover transition-transform group-hover/search-result:scale-[1.02]"
            src={coverUrl}
            onError={hideBrokenImage}
          />
        ) : null}
        {selected ? (
          <Badge className="absolute left-2 top-2 shadow-sm">Selected</Badge>
        ) : null}
      </span>
      <span className="block min-w-0 space-y-1">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {item.displayTitle}
        </span>
        {item.seasonYear ? (
          <span className="block text-xs text-muted-foreground">
            {item.seasonYear}
          </span>
        ) : null}
      </span>
    </button>
  );
}
