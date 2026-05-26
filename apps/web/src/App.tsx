import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
  DownloadedAnime,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  LocalMediaFile,
  MediaSearchResult,
  PlaybackProgress,
  StreamingOption,
} from "@elysium/shared";
import {
  deleteDownloadJob,
  deleteLocalMediaFile,
  getAnimeMetadata,
  getDownloadOptions,
  getEpisodes,
  listAnimeAiringSchedule,
  getStreamingOptions,
  listDownloadedAnime,
  listContinueWatching,
  listLocalMediaFiles,
  listDownloadJobs,
  retryDownload,
  searchAnimeMetadata,
  searchAnimeMetadataPage,
  searchMedia,
  startDownload,
} from "@/lib/api";
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
  StartDownloadInput,
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
  hasDetails,
  normalizeEpisodeNumber,
  refetchLocalLibraryQueries,
  slugFromTitle,
  toAnimeSlug,
} from "@/lib/media-ui";

const EMPTY_ANIME_RESULTS: AnimeMetadataSearchResult[] = [];
const EMPTY_SEARCH_RESULTS: MediaSearchResult[] = [];
const EMPTY_EPISODES: EpisodeSummary[] = [];
const EMPTY_DOWNLOAD_JOBS: DownloadJob[] = [];
const EMPTY_LOCAL_MEDIA_FILES: LocalMediaFile[] = [];
const EMPTY_DOWNLOADED_ANIME: DownloadedAnime[] = [];
const EMPTY_STREAMING_OPTIONS: StreamingOption[] = [];
const EMPTY_PLAYBACK_PROGRESS: PlaybackProgress[] = [];
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
  const queryClient = useQueryClient();
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

  const animeMetadataSearchQuery = useInfiniteQuery({
    queryKey: [
      "metadata",
      "anilist",
      "search",
      trimmedAnimeQuery,
      animeSearchSort,
      routeAnimeSearchSeason,
      routeAnimeSearchSeasonYear,
    ],
    queryFn: ({ pageParam }) =>
      searchAnimeMetadataPage(trimmedAnimeQuery, {
        page: Number(pageParam),
        perPage: 24,
        season: routeAnimeSearchSeason,
        seasonYear: routeAnimeSearchSeasonYear,
        sort: animeSearchSort,
      }),
    enabled: showingAnimeSearch,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const animeResults = useMemo(
    () =>
      animeMetadataSearchQuery.data?.pages.flatMap((page) => page.items) ??
      EMPTY_ANIME_RESULTS,
    [animeMetadataSearchQuery.data],
  );
  const activeAnimeId = selectedAnimeId;

  const animeDetailsQuery = useQuery({
    queryKey: ["metadata", "anilist", "anime", activeAnimeId],
    queryFn: () => getAnimeMetadata(activeAnimeId ?? 0),
    enabled: Boolean(activeAnimeId),
    staleTime: 5 * 60_000,
  });

  const animeDetails = animeDetailsQuery.data;
  const sourceSearchTerm =
    selectedAnimeId && animeDetails ? animeDetails.sourceSearchTitle : "";
  const animeRelations =
    animeDetails && hasDetails(animeDetails)
      ? (animeDetails.relations ?? [])
      : [];

  const searchQuery = useQuery({
    queryKey: ["search", sourceSearchTerm],
    queryFn: () => searchMedia(sourceSearchTerm),
    enabled: Boolean(sourceSearchTerm),
  });

  const searchResults = searchQuery.data ?? EMPTY_SEARCH_RESULTS;
  const selectedMedia = searchResults[0];

  const episodesQuery = useQuery({
    queryKey: ["episodes", selectedMedia?.sourceProvider, selectedMedia?.url],
    queryFn: () => {
      if (!selectedMedia) {
        throw new Error("Missing selected media");
      }

      return getEpisodes(selectedMedia.sourceProvider, selectedMedia.url);
    },
    enabled: Boolean(selectedMedia?.url),
  });

  const episodes = episodesQuery.data ?? EMPTY_EPISODES;
  const selectedEpisode = useMemo(() => {
    if (routeEpisodeNumber) {
      return episodes.find(
        (episode) =>
          normalizeEpisodeNumber(episode.number) ===
          normalizeEpisodeNumber(routeEpisodeNumber),
      );
    }

    return selectedEpisodeUrl
      ? episodes.find((episode) => episode.url === selectedEpisodeUrl)
      : undefined;
  }, [episodes, selectedEpisodeUrl, routeEpisodeNumber]);

  const downloadOptionsQuery = useQuery({
    queryKey: [
      "download-options",
      selectedEpisode?.sourceProvider,
      selectedEpisode?.url,
    ],
    queryFn: () => {
      if (!selectedEpisode) {
        throw new Error("Missing selected episode");
      }

      return getDownloadOptions(
        selectedEpisode.sourceProvider,
        selectedEpisode.url,
      );
    },
    enabled: Boolean(selectedEpisode?.url),
  });

  const downloadOptions = downloadOptionsQuery.data ?? [];
  const streamingOptionsQuery = useQuery({
    queryKey: [
      "streaming-options",
      selectedEpisode?.sourceProvider,
      selectedEpisode?.url,
    ],
    queryFn: () => {
      if (!selectedEpisode) {
        throw new Error("Missing selected episode");
      }

      return getStreamingOptions(
        selectedEpisode.sourceProvider,
        selectedEpisode.url,
      );
    },
    enabled: Boolean(selectedEpisode?.url),
  });
  const streamingOptions =
    streamingOptionsQuery.data ?? EMPTY_STREAMING_OPTIONS;
  const episodesLoading = searchQuery.isLoading || episodesQuery.isLoading;
  const downloadJobsQuery = useQuery({
    queryKey: ["downloads"],
    queryFn: listDownloadJobs,
    refetchInterval: 1_000,
  });
  const localMediaFilesQuery = useQuery({
    queryKey: ["library", "files"],
    queryFn: listLocalMediaFiles,
    refetchInterval: 5_000,
  });
  const downloadJobs = downloadJobsQuery.data ?? EMPTY_DOWNLOAD_JOBS;
  const localMediaFiles = localMediaFilesQuery.data ?? EMPTY_LOCAL_MEDIA_FILES;
  const downloadedAnimeQuery = useQuery({
    queryKey: ["library", "anime"],
    queryFn: listDownloadedAnime,
    refetchInterval: 5_000,
  });
  const downloadedAnime = downloadedAnimeQuery.data ?? EMPTY_DOWNLOADED_ANIME;
  const continueWatchingQuery = useQuery({
    queryKey: ["playback", "continue-watching"],
    queryFn: listContinueWatching,
    refetchInterval: 10_000,
  });
  const continueWatching =
    continueWatchingQuery.data ?? EMPTY_PLAYBACK_PROGRESS;
  const currentlyWatchingAnimeIds = useMemo(
    () => getCurrentlyWatchingAnimeIds(continueWatching, localMediaFiles),
    [continueWatching, localMediaFiles],
  );
  const newPopularQuery = useQuery({
    queryKey: [
      "metadata",
      "anilist",
      "home",
      "new-popular",
      currentAnimeSeason.season,
      currentAnimeSeason.year,
    ],
    queryFn: () =>
      searchAnimeMetadata("", {
        season: currentAnimeSeason.season,
        seasonYear: currentAnimeSeason.year,
        sort: "popularity",
      }),
    enabled: showingHomeRoute || animeHomeEnabled,
    staleTime: 5 * 60_000,
  });
  const newPopularAnime = newPopularQuery.data ?? EMPTY_ANIME_RESULTS;
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
  const downloadJobByUrl = useMemo(() => {
    const jobs = new Map<string, DownloadJob>();

    for (const job of downloadJobs) {
      if (!jobs.has(job.option.providerUrl)) {
        jobs.set(job.option.providerUrl, job);
      }
    }

    return jobs;
  }, [downloadJobs]);
  const startDownloadMutation = useMutation({
    mutationFn: ({ mediaContext, option }: StartDownloadInput) =>
      startDownload(option, mediaContext),
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });
  const retryDownloadMutation = useMutation({
    mutationFn: retryDownload,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });
  const deleteDownloadJobMutation = useMutation({
    mutationFn: deleteDownloadJob,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });
  const deleteLocalFileMutation = useMutation({
    mutationFn: deleteLocalMediaFile,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

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

  function handleLocalEpisodeSelect(file: LocalMediaFile) {
    if (!file.metadataId || !file.episodeNumber) {
      return;
    }

    void navigate({
      params: {
        animeId: String(file.metadataId),
        episodeNumber: file.episodeNumber,
        slug: slugFromTitle(
          file.displayTitle ?? file.sourceMediaTitle ?? file.filename,
        ),
      },
      to: "/anime/$animeId/$slug/episode/$episodeNumber",
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
                jobs={downloadJobs}
                loading={downloadedAnimeQuery.isFetching}
                mutating={
                  deleteDownloadJobMutation.isPending ||
                  deleteLocalFileMutation.isPending ||
                  retryDownloadMutation.isPending
                }
                onDeleteFile={(file) => deleteLocalFileMutation.mutate(file.id)}
                onDeleteJob={(job) => deleteDownloadJobMutation.mutate(job.id)}
                onEpisodeSelect={(_anime, file) =>
                  handleLocalEpisodeSelect(file)
                }
                onRetryJob={(job) => retryDownloadMutation.mutate(job.id)}
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
