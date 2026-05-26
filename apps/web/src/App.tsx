import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  PlaybackProgress,
} from "@elysium/shared";
import {
  DEFAULT_ANIME_SEARCH_SORT,
  toAnimeSearchSortUrlValue,
} from "@/lib/anime-search";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { BRAND_MARK_SRC, HOME_NEW_POPULAR_TITLE } from "@/app/constants";
import type {
  FocusedImage,
  MediaHomeRoute,
  SidebarItemTitle,
} from "@/app/types";
import {
  AccountControls,
  AppBreadcrumbs,
  ElysiumSidebar,
} from "@/components/layout/app-frame";
import { ImageLightbox } from "@/components/media/image-lightbox";
import {
  AnimeSearchBar,
  AnimeSearchResults,
} from "@/routes/search/anime/-search-page-components";
import {
  DownloadHistoryDrawer,
  DownloadsPage,
} from "@/routes/downloads/-downloads-page";
import { EmptyRoutePage } from "@/components/layout/empty-route-page";
import {
  DownloadOptionsStepper,
  EpisodeWatchPanel,
} from "@/routes/anime/$animeId/$slug/episode/-episode-watch-page";
import {
  AnimeDetailPanel,
  EpisodeButton,
  RelatedAnimeSection,
} from "@/routes/anime/$animeId/$slug/-anime-detail-page";
import {
  AnimeAiringEpisodeSection,
  CurrentlyWatchingPage,
  HomePage,
} from "@/routes/home/-home-page";
import {
  ErrorText,
  ResultSkeleton,
  createDownloadMediaContext,
  getCurrentAnimeSeason,
  getCurrentlyWatchingAnimeIds,
  getLocalFilesForEpisode,
  normalizeEpisodeNumber,
  slugFromTitle,
  toAnimeSlug,
} from "@/lib/media-ui";
import { useAnimeDetails } from "@/features/anime/use-anime-details";
import { useAnimeHome } from "@/features/anime/use-anime-home";
import { useAnimeSearch } from "@/features/anime/use-anime-search";
import { useDownloads } from "@/features/downloads/use-downloads";
import { useLocalLibrary } from "@/features/library/use-local-library";
import { useContinueWatching } from "@/features/player/use-continue-watching";
import { useSourceEpisodeData } from "@/features/source-adapters/use-source-episode-data";

function App({
  animeSearchQuery: routeAnimeSearchQuery = "",
  animeSearchRoute = false,
  animeSearchSeason: routeAnimeSearchSeason,
  animeSearchSeasonYear: routeAnimeSearchSeasonYear,
  animeSearchSort: routeAnimeSearchSort = DEFAULT_ANIME_SEARCH_SORT,
  animeSearchTitle: routeAnimeSearchTitle,
  currentlyWatchingRoute = false,
  downloadsRoute = false,
  mediaHomeRoute,
  placeholderRoute,
  routeAnimeId,
  routeEpisodeNumber,
}: {
  animeSearchQuery?: string;
  animeSearchRoute?: boolean;
  animeSearchSeason?: AnimeMetadataSeason;
  animeSearchSeasonYear?: number;
  animeSearchSort?: AnimeMetadataSearchSort;
  animeSearchTitle?: string;
  currentlyWatchingRoute?: boolean;
  downloadsRoute?: boolean;
  mediaHomeRoute?: MediaHomeRoute;
  placeholderRoute?: SidebarItemTitle;
  routeAnimeId?: number;
  routeEpisodeNumber?: string;
  routeAnimeSlug?: string;
}) {
  const navigate = useNavigate();
  const [animeQuery, setAnimeQuery] = useState(routeAnimeSearchQuery);
  const [animeSearchSort, setAnimeSearchSort] =
    useState<AnimeMetadataSearchSort>(routeAnimeSearchSort);
  const [animeSearchFocusTick, setAnimeSearchFocusTick] = useState(0);
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = useState<string | null>(
    null,
  );
  const [focusedImage, setFocusedImage] = useState<FocusedImage | null>(null);
  const selectedAnimeId = Number.isFinite(routeAnimeId)
    ? routeAnimeId
    : undefined;
  const trimmedAnimeQuery = animeQuery.trim();
  const showingAnimeSearch = animeSearchRoute || trimmedAnimeQuery.length > 0;
  const showingEpisodeRoute = Boolean(routeEpisodeNumber);
  const [sidebarOpen, setSidebarOpen] = useState(!showingEpisodeRoute);
  const currentAnimeSeason = useMemo(() => getCurrentAnimeSeason(), []);
  const showingMediaHomeRoute = Boolean(mediaHomeRoute);
  const animeHomeEnabled = mediaHomeRoute === "anime";
  const showingHomeRoute =
    !currentlyWatchingRoute &&
    !downloadsRoute &&
    !showingMediaHomeRoute &&
    !placeholderRoute &&
    !showingAnimeSearch &&
    !selectedAnimeId;

  useEffect(() => {
    setAnimeQuery(routeAnimeSearchQuery);
  }, [routeAnimeSearchQuery]);

  useEffect(() => {
    setAnimeSearchSort(routeAnimeSearchSort);
  }, [routeAnimeSearchSort]);

  useEffect(() => {
    if (showingEpisodeRoute) {
      setSidebarOpen(false);
    }
  }, [showingEpisodeRoute]);

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();
      setAnimeSearchFocusTick((tick) => tick + 1);
    },
    {
      meta: {
        description: "Focus anime search",
        name: "Focus search",
      },
      preventDefault: true,
      stopPropagation: true,
    },
  );

  const { results: animeResults, searchQuery: animeMetadataSearchQuery } =
    useAnimeSearch({
      enabled: showingAnimeSearch,
      query: trimmedAnimeQuery,
      season: routeAnimeSearchSeason,
      seasonYear: routeAnimeSearchSeasonYear,
      sort: animeSearchSort,
    });
  const {
    anime: animeDetails,
    detailsQuery: animeDetailsQuery,
    relations: animeRelations,
    sourceSearchTerm,
  } = useAnimeDetails(selectedAnimeId);
  const {
    downloadOptions,
    downloadOptionsQuery,
    episodes,
    episodesLoading,
    episodesQuery,
    searchQuery,
    selectedEpisode,
    selectedMedia,
    streamingOptions,
    streamingOptionsQuery,
  } = useSourceEpisodeData({
    routeEpisodeNumber,
    selectedEpisodeUrl,
    sourceSearchTerm,
  });
  const {
    deleteDownloadJobMutation,
    downloadJobByUrl,
    downloadJobs,
    downloadJobsQuery,
    retryDownloadMutation,
    startDownloadMutation,
  } = useDownloads();
  const { downloadedAnime, downloadedAnimeQuery, localMediaFiles } =
    useLocalLibrary();
  const { continueWatching, continueWatchingQuery } = useContinueWatching();
  const currentlyWatchingAnimeIds = useMemo(
    () => getCurrentlyWatchingAnimeIds(continueWatching, localMediaFiles),
    [continueWatching, localMediaFiles],
  );
  const {
    currentlyWatchingAiringEpisodes,
    currentlyWatchingAiringQuery,
    latestAiringEpisodes,
    latestAiringQuery,
    newPopularAnime,
    newPopularQuery,
  } = useAnimeHome({
    animeHomeEnabled,
    currentSeason: currentAnimeSeason,
    currentlyWatchingAnimeIds,
    homeEnabled: showingHomeRoute,
  });
  const selectedEpisodeFiles = useMemo(
    () =>
      getLocalFilesForEpisode({
        animeId: selectedAnimeId,
        episode: selectedEpisode,
        episodeNumber: routeEpisodeNumber,
        files: localMediaFiles,
      }),
    [localMediaFiles, routeEpisodeNumber, selectedAnimeId, selectedEpisode],
  );
  function handleAnimeQueryChange(value: string) {
    setAnimeSearchFocusTick((tick) => tick + 1);
    setAnimeQuery(value);
    navigateToAnimeSearch(value, animeSearchSort, {
      replace: animeSearchRoute,
      season: routeAnimeSearchSeason,
      seasonYear: routeAnimeSearchSeasonYear,
      title: routeAnimeSearchTitle,
    });
  }

  function handleAnimeSearchSortChange(sort: AnimeMetadataSearchSort) {
    setAnimeSearchSort(sort);

    if (showingAnimeSearch) {
      navigateToAnimeSearch(trimmedAnimeQuery, sort, {
        replace: true,
        season: routeAnimeSearchSeason,
        seasonYear: routeAnimeSearchSeasonYear,
        title: routeAnimeSearchTitle,
      });
    }
  }

  function navigateToAnimeSearch(
    query: string,
    sort: AnimeMetadataSearchSort,
    options: {
      replace?: boolean;
      season?: AnimeMetadataSeason;
      seasonYear?: number;
      title?: string;
    } = {},
  ) {
    const nextQuery = query.trim();
    const nextSearch = {
      search: nextQuery,
      season: options.season,
      sort: toAnimeSearchSortUrlValue(sort),
      title: options.title,
      year: options.seasonYear,
    };

    if (!nextQuery) {
      void navigate({
        replace: options.replace ?? true,
        search: nextSearch,
        to: "/search/anime",
      });

      return;
    }

    void navigate({
      replace: options.replace ?? animeSearchRoute,
      search: nextSearch,
      to: "/search/anime",
    });
  }

  function handleNewPopularOpen() {
    navigateToAnimeSearch("", "popularity", {
      replace: false,
      season: currentAnimeSeason.season,
      seasonYear: currentAnimeSeason.year,
      title: HOME_NEW_POPULAR_TITLE,
    });
  }

  function handleContinueWatchingOpen() {
    void navigate({ to: "/currently-watching" });
  }

  function handleAnimeSelect(item: AnimeMetadataSearchResult) {
    setAnimeQuery("");
    setSelectedEpisodeUrl(null);
    void navigate({
      params: {
        animeId: String(item.id),
        slug: toAnimeSlug(item),
      },
      to: "/anime/$animeId/$slug",
    });
  }

  function handleEpisodeSelect(episode: EpisodeSummary) {
    setSelectedEpisodeUrl(episode.url);

    if (!selectedAnimeId || !animeDetails) {
      return;
    }

    void navigate({
      params: {
        animeId: String(selectedAnimeId),
        episodeNumber: normalizeEpisodeNumber(episode.number) ?? episode.number,
        slug: toAnimeSlug(animeDetails),
      },
      to: "/anime/$animeId/$slug/episode/$episodeNumber",
    });
  }

  function handleDownload(option: DownloadOption, job?: DownloadJob) {
    if (job?.status === "failed" || job?.status === "cancelled") {
      retryDownloadMutation.mutate(job.id);
      return;
    }

    startDownloadMutation.mutate({
      mediaContext: createDownloadMediaContext(
        animeDetails,
        selectedMedia,
        selectedEpisode,
      ),
      option,
    });
  }

  function handleContinueWatchingSelect(progress: PlaybackProgress) {
    const file = progress.localMediaFileId
      ? localMediaFiles.find(
          (candidate) => candidate.id === progress.localMediaFileId,
        )
      : undefined;
    const metadataId = file?.metadataId ?? progress.metadataId;
    const episodeNumber = file?.episodeNumber ?? progress.episodeNumber;

    if (!metadataId || !episodeNumber) {
      return;
    }

    void navigate({
      params: {
        animeId: String(metadataId),
        episodeNumber,
        slug: slugFromTitle(
          file?.displayTitle ??
            file?.sourceMediaTitle ??
            progress.mediaTitle ??
            "anime",
        ),
      },
      to: "/anime/$animeId/$slug/episode/$episodeNumber",
    });
  }

  const handleDownloadedAnimeLoadMore = useCallback(() => {
    void downloadedAnimeQuery.fetchNextPage();
  }, [downloadedAnimeQuery.fetchNextPage]);

  return (
    <SidebarProvider
      defaultOpen={!showingEpisodeRoute}
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
    >
      <ElysiumSidebar
        activeItem={
          downloadsRoute
            ? "Downloads"
            : mediaHomeRoute === "anime"
              ? "Anime"
              : mediaHomeRoute === "tv-shows"
                ? "TV Shows"
                : mediaHomeRoute === "movies"
                  ? "Movies"
                  : (placeholderRoute ??
                    (selectedAnimeId || showingAnimeSearch || animeSearchRoute
                      ? "Anime"
                      : "Home"))
        }
        onNavigate={(path) => {
          void navigate({ to: path });
        }}
        overlay={showingEpisodeRoute}
      />
      <SidebarInset className="min-h-svh min-w-0 bg-background text-foreground">
        <div
          className={cn(
            "min-w-0 overflow-x-hidden",
            showingEpisodeRoute ? "p-3 md:px-6 md:py-4" : "p-4 md:p-8",
          )}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <header
              className={cn(
                "grid gap-3 md:items-center",
                showingEpisodeRoute
                  ? "md:grid-cols-[minmax(0,1fr)_auto_auto]"
                  : "md:grid-cols-[minmax(0,1fr)_minmax(18rem,36rem)_minmax(0,1fr)]",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {showingEpisodeRoute ? (
                  <button
                    aria-label="Go to home"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => {
                      void navigate({ to: "/home" });
                    }}
                  >
                    <img
                      alt=""
                      className="size-7 object-contain"
                      src={BRAND_MARK_SRC}
                    />
                  </button>
                ) : null}
                <SidebarTrigger
                  className={cn(
                    "-ml-2",
                    showingEpisodeRoute ? "md:inline-flex" : "md:hidden",
                  )}
                />
                <AppBreadcrumbs
                  anime={animeDetails}
                  animeSearchRoute={animeSearchRoute || showingAnimeSearch}
                  currentlyWatchingRoute={currentlyWatchingRoute}
                  downloadsRoute={downloadsRoute}
                  mediaHomeRoute={mediaHomeRoute}
                  placeholderRoute={placeholderRoute}
                  routeEpisodeNumber={routeEpisodeNumber}
                  selectedEpisode={selectedEpisode}
                  selectedAnimeId={selectedAnimeId}
                />
              </div>
              <div className="flex min-w-0 items-center justify-center md:col-start-2 md:row-start-1">
                <AnimeSearchBar
                  compact={showingEpisodeRoute}
                  focusTick={animeSearchFocusTick}
                  query={animeQuery}
                  onQueryChange={handleAnimeQueryChange}
                />
              </div>
              <div className="flex items-center justify-end gap-2 md:col-start-3 md:row-start-1">
                <DownloadHistoryDrawer
                  jobs={downloadJobs}
                  loading={downloadJobsQuery.isFetching}
                  mutating={
                    deleteDownloadJobMutation.isPending ||
                    retryDownloadMutation.isPending
                  }
                  onDelete={(job) => deleteDownloadJobMutation.mutate(job.id)}
                  onRetry={(job) => retryDownloadMutation.mutate(job.id)}
                />
                <AccountControls />
              </div>
            </header>

            {downloadsRoute ? (
              <DownloadsPage
                anime={downloadedAnime}
                fetchingNextPage={downloadedAnimeQuery.isFetchingNextPage}
                hasNextPage={Boolean(downloadedAnimeQuery.hasNextPage)}
                loading={downloadedAnimeQuery.isFetching}
                onAnimeSelect={handleAnimeSelect}
                onLoadMore={handleDownloadedAnimeLoadMore}
              />
            ) : null}

            {!downloadsRoute && placeholderRoute ? (
              <EmptyRoutePage title={placeholderRoute} />
            ) : null}

            {!downloadsRoute && currentlyWatchingRoute ? (
              <CurrentlyWatchingPage
                files={localMediaFiles}
                items={continueWatching}
                loading={continueWatchingQuery.isFetching}
                onResume={handleContinueWatchingSelect}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            showingAnimeSearch ? (
              <AnimeSearchResults
                fetchingNextPage={animeMetadataSearchQuery.isFetchingNextPage}
                hasNextPage={Boolean(animeMetadataSearchQuery.hasNextPage)}
                loading={animeMetadataSearchQuery.isLoading}
                results={animeResults}
                routeTitle={routeAnimeSearchTitle}
                season={routeAnimeSearchSeason}
                seasonYear={routeAnimeSearchSeasonYear}
                selectedId={selectedAnimeId}
                sort={animeSearchSort}
                error={animeMetadataSearchQuery.error}
                onLoadMore={() => void animeMetadataSearchQuery.fetchNextPage()}
                onSortChange={handleAnimeSearchSortChange}
                onSelect={handleAnimeSelect}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingEpisodeRoute &&
            !showingAnimeSearch &&
            animeDetails ? (
              <AnimeDetailPanel
                anime={animeDetails}
                loading={animeDetailsQuery.isFetching}
                onImageFocus={setFocusedImage}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingAnimeSearch &&
            animeDetails &&
            showingEpisodeRoute ? (
              <EpisodeWatchPanel
                anime={animeDetails}
                episode={selectedEpisode}
                episodes={episodes}
                episodesLoading={episodesLoading}
                localFiles={selectedEpisodeFiles}
                routeEpisodeNumber={routeEpisodeNumber}
                streamingOptions={streamingOptions}
                streamingOptionsLoading={streamingOptionsQuery.isFetching}
                onEpisodeSelect={handleEpisodeSelect}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingEpisodeRoute &&
            !showingAnimeSearch &&
            animeDetails ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Episodes</CardTitle>
                    <CardDescription>
                      {selectedMedia ? selectedMedia.title : "Pick an anime"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {episodesLoading ? <ResultSkeleton compact /> : null}
                    {!episodesLoading && episodes.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {episodes.map((episode) => (
                          <EpisodeButton
                            episode={episode}
                            key={episode.url}
                            selected={selectedEpisode?.url === episode.url}
                            onSelect={() => handleEpisodeSelect(episode)}
                          />
                        ))}
                      </div>
                    ) : null}
                    {!episodesLoading &&
                    sourceSearchTerm &&
                    !episodes.length ? (
                      <p className="text-sm text-muted-foreground">
                        No episodes found yet.
                      </p>
                    ) : null}
                    {searchQuery.isError ? (
                      <ErrorText error={searchQuery.error} />
                    ) : null}
                    {episodesQuery.isError ? (
                      <ErrorText error={episodesQuery.error} />
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingEpisodeRoute &&
            !showingAnimeSearch &&
            animeDetails ? (
              <RelatedAnimeSection
                relations={animeRelations}
                selectedAnimeId={selectedAnimeId}
                onAnimeSelect={handleAnimeSelect}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            showingEpisodeRoute &&
            !showingAnimeSearch &&
            animeDetails ? (
              <DownloadOptionsStepper
                anime={animeDetails}
                downloadOptions={downloadOptions}
                downloadOptionsError={downloadOptionsQuery.error}
                downloadOptionsLoading={downloadOptionsQuery.isLoading}
                episode={selectedEpisode}
                downloadJobByUrl={downloadJobByUrl}
                mutating={
                  startDownloadMutation.isPending ||
                  retryDownloadMutation.isPending
                }
                routeEpisodeNumber={routeEpisodeNumber}
                retryError={retryDownloadMutation.error}
                startError={startDownloadMutation.error}
                onDownload={handleDownload}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingAnimeSearch &&
            mediaHomeRoute ? (
              <HomePage
                afterContinueWatching={
                  animeHomeEnabled ? (
                    <>
                      <AnimeAiringEpisodeSection
                        emptyText={
                          currentlyWatchingAnimeIds.length
                            ? "No published episodes found yet for currently watched anime."
                            : "Start watching anime locally to see new episode releases here."
                        }
                        error={currentlyWatchingAiringQuery.error}
                        fetchingNextPage={
                          currentlyWatchingAiringQuery.isFetchingNextPage
                        }
                        hasNextPage={Boolean(
                          currentlyWatchingAiringQuery.hasNextPage,
                        )}
                        items={currentlyWatchingAiringEpisodes}
                        loading={currentlyWatchingAiringQuery.isLoading}
                        title="Latest From Currently Watching"
                        onAnimeSelect={handleAnimeSelect}
                        onLoadMore={() =>
                          void currentlyWatchingAiringQuery.fetchNextPage()
                        }
                      />
                      <AnimeAiringEpisodeSection
                        emptyText="No published anime episodes found yet."
                        error={latestAiringQuery.error}
                        fetchingNextPage={latestAiringQuery.isFetchingNextPage}
                        hasNextPage={Boolean(latestAiringQuery.hasNextPage)}
                        items={latestAiringEpisodes}
                        loading={latestAiringQuery.isLoading}
                        title="Latest Published Episodes"
                        onAnimeSelect={handleAnimeSelect}
                        onLoadMore={() =>
                          void latestAiringQuery.fetchNextPage()
                        }
                      />
                    </>
                  ) : null
                }
                continueWatching={animeHomeEnabled ? continueWatching : []}
                continueWatchingLoading={
                  animeHomeEnabled && continueWatchingQuery.isFetching
                }
                files={animeHomeEnabled ? localMediaFiles : []}
                newPopular={animeHomeEnabled ? newPopularAnime : []}
                newPopularError={
                  animeHomeEnabled ? newPopularQuery.error : null
                }
                newPopularLoading={
                  animeHomeEnabled && newPopularQuery.isFetching
                }
                onAnimeSelect={handleAnimeSelect}
                onContinueWatchingOpen={
                  animeHomeEnabled ? handleContinueWatchingOpen : undefined
                }
                onNewPopularOpen={
                  animeHomeEnabled ? handleNewPopularOpen : undefined
                }
                onResume={handleContinueWatchingSelect}
              />
            ) : null}

            {!downloadsRoute &&
            !currentlyWatchingRoute &&
            !placeholderRoute &&
            !showingMediaHomeRoute &&
            !showingAnimeSearch &&
            showingHomeRoute ? (
              <HomePage
                continueWatching={continueWatching}
                files={localMediaFiles}
                newPopular={newPopularAnime}
                newPopularError={newPopularQuery.error}
                newPopularLoading={newPopularQuery.isFetching}
                continueWatchingLoading={continueWatchingQuery.isFetching}
                onAnimeSelect={handleAnimeSelect}
                onContinueWatchingOpen={handleContinueWatchingOpen}
                onNewPopularOpen={handleNewPopularOpen}
                onResume={handleContinueWatchingSelect}
              />
            ) : null}
          </div>
        </div>
        {focusedImage ? (
          <ImageLightbox
            image={focusedImage}
            onClose={() => setFocusedImage(null)}
          />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
