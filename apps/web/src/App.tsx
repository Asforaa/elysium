import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent,
  ComponentProps,
  FormEvent,
  MouseEvent,
  SyntheticEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useHotkey } from '@tanstack/react-hotkeys';
import { Link, useNavigate } from '@tanstack/react-router';
import { createPlayer, selectControls, selectFullscreen } from '@videojs/react';
import { Video, VideoSkin, videoFeatures } from '@videojs/react/video';
import '@videojs/react/video/skin.css';
import {
  Clapperboard,
  ChevronDown,
  ChevronLeft,
  Clock,
  Download,
  Film,
  Heart,
  Home,
  LogOut,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  Tv,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  AnimeMetadataSearchSort,
  AnimeRelation,
  DownloadedAnime,
  DownloadMediaContext,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  LocalMediaFile,
  MediaSearchResult,
  PlaybackProgress,
  SavePlaybackProgressRequest,
  StreamingOption,
} from '@elysium/shared';
import {
  deleteDownloadJob,
  deleteLocalMediaFile,
  getAnimeMetadata,
  getAuthSession,
  getDownloadOptions,
  getEpisodes,
  getLocalMediaStreamUrl,
  getPlaybackProgress,
  getStreamingOptions,
  listDownloadedAnime,
  listContinueWatching,
  listLocalMediaFiles,
  listDownloadJobs,
  retryDownload,
  savePlaybackProgress,
  searchAnimeMetadata,
  searchMedia,
  startDownload,
  loginUser,
  logoutUser,
  signupUser,
} from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ANIME_SEARCH_SORT_OPTIONS,
  DEFAULT_ANIME_SEARCH_SORT,
  toAnimeSearchSortUrlValue,
} from '@/lib/anime-search';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

const EMPTY_ANIME_RESULTS: AnimeMetadataSearchResult[] = [];
const EMPTY_SEARCH_RESULTS: MediaSearchResult[] = [];
const EMPTY_EPISODES: EpisodeSummary[] = [];
const EMPTY_DOWNLOAD_JOBS: DownloadJob[] = [];
const EMPTY_LOCAL_MEDIA_FILES: LocalMediaFile[] = [];
const EMPTY_DOWNLOADED_ANIME: DownloadedAnime[] = [];
const EMPTY_STREAMING_OPTIONS: StreamingOption[] = [];
const EMPTY_PLAYBACK_PROGRESS: PlaybackProgress[] = [];
const ELYSIUM_VIDEO_PLAYER = createPlayer({ features: videoFeatures });
const SEEK_FEEDBACK_SECONDS = 10;
const SEEK_FEEDBACK_TIMEOUT_MS = 650;
const PLAYBACK_FEEDBACK_TIMEOUT_MS = 620;
const PROFILE_PHOTO_SIZE = 256;
const PROFILE_PHOTO_QUALITY = 0.82;
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 10 * 1024 * 1024;
const BRAND_MARK_SRC = '/brand/elysium-logo-mark.png';
const SEARCH_FILTERS = [
  { label: 'Genres', value: 'Any' },
  { label: 'Year', value: 'Any' },
  { label: 'Season', value: 'Any' },
  { label: 'Format', value: 'Any' },
  { label: 'Airing Status', value: 'Any' },
];
const MAIN_NAV_ITEMS: SidebarNavItem[] = [
  { title: 'Home', icon: Home, path: '/home' },
  { title: 'Anime', icon: Clapperboard, path: '/anime' },
  { title: 'TV Shows', icon: Tv, path: '/tv-shows' },
  { title: 'Movies', icon: Film, path: '/movies' },
  { title: 'My List', icon: Plus, path: '/my-list' },
];
const LIBRARY_NAV_ITEMS: SidebarNavItem[] = [
  { title: 'Favourites', icon: Heart, path: '/favourites' },
  { title: 'Watch Later', icon: Clock, path: '/watch-later' },
  { title: 'Downloads', icon: Download, path: '/downloads' },
  { title: 'My Account', icon: User, path: '/account' },
];

type SidebarItemTitle =
  | 'Home'
  | 'Anime'
  | 'TV Shows'
  | 'Movies'
  | 'My List'
  | 'Favourites'
  | 'Watch Later'
  | 'Downloads'
  | 'My Account';

type SidebarRoutePath =
  | '/home'
  | '/anime'
  | '/tv-shows'
  | '/movies'
  | '/my-list'
  | '/favourites'
  | '/watch-later'
  | '/downloads'
  | '/account';

type SidebarNavItem = {
  icon: LucideIcon;
  path: SidebarRoutePath;
  title: SidebarItemTitle;
};

type AuthDialogMode = 'login' | 'signup';

type FocusedImage = {
  alt: string;
  src: string;
};

type StartDownloadInput = {
  mediaContext?: DownloadMediaContext;
  option: DownloadOption;
};

type DownloadQualityGroup = {
  label: string;
  options: DownloadOption[];
  quality: DownloadOption['quality'];
};

function App({
  animeSearchQuery: routeAnimeSearchQuery = '',
  animeSearchRoute = false,
  animeSearchSort: routeAnimeSearchSort = DEFAULT_ANIME_SEARCH_SORT,
  downloadsRoute = false,
  placeholderRoute,
  routeAnimeId,
  routeEpisodeNumber,
}: {
  animeSearchQuery?: string;
  animeSearchRoute?: boolean;
  animeSearchSort?: AnimeMetadataSearchSort;
  downloadsRoute?: boolean;
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
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = useState<string | null>(null);
  const [focusedImage, setFocusedImage] = useState<FocusedImage | null>(null);
  const selectedAnimeId = Number.isFinite(routeAnimeId) ? routeAnimeId : undefined;
  const trimmedAnimeQuery = animeQuery.trim();
  const showingAnimeSearch = trimmedAnimeQuery.length > 0;
  const showingEpisodeRoute = Boolean(routeEpisodeNumber);
  const [sidebarOpen, setSidebarOpen] = useState(!showingEpisodeRoute);
  const showingHomeRoute =
    !downloadsRoute &&
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
    'Mod+K',
    (event) => {
      event.preventDefault();
      setAnimeSearchFocusTick((tick) => tick + 1);
    },
    {
      meta: {
        description: 'Focus anime search',
        name: 'Focus search',
      },
      preventDefault: true,
      stopPropagation: true,
    },
  );

  const animeMetadataSearchQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'search', trimmedAnimeQuery, animeSearchSort],
    queryFn: () => searchAnimeMetadata(trimmedAnimeQuery, animeSearchSort),
    enabled: showingAnimeSearch,
    staleTime: 60_000,
  });

  const animeResults = animeMetadataSearchQuery.data ?? EMPTY_ANIME_RESULTS;
  const activeAnimeId = selectedAnimeId;

  const animeDetailsQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'anime', activeAnimeId],
    queryFn: () => getAnimeMetadata(activeAnimeId ?? 0),
    enabled: Boolean(activeAnimeId),
    staleTime: 5 * 60_000,
  });

  const animeDetails = animeDetailsQuery.data;
  const sourceSearchTerm = selectedAnimeId && animeDetails ? animeDetails.sourceSearchTitle : '';
  const animeRelations =
    animeDetails && hasDetails(animeDetails) ? (animeDetails.relations ?? []) : [];

  const searchQuery = useQuery({
    queryKey: ['search', sourceSearchTerm],
    queryFn: () => searchMedia(sourceSearchTerm),
    enabled: Boolean(sourceSearchTerm),
  });

  const searchResults = searchQuery.data ?? EMPTY_SEARCH_RESULTS;
  const selectedMedia = searchResults[0];

  const episodesQuery = useQuery({
    queryKey: ['episodes', selectedMedia?.sourceProvider, selectedMedia?.url],
    queryFn: () => {
      if (!selectedMedia) {
        throw new Error('Missing selected media');
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

    return (
      selectedEpisodeUrl
        ? episodes.find((episode) => episode.url === selectedEpisodeUrl)
        : undefined
    );
  }, [episodes, selectedEpisodeUrl, routeEpisodeNumber]);

  const downloadOptionsQuery = useQuery({
    queryKey: ['download-options', selectedEpisode?.sourceProvider, selectedEpisode?.url],
    queryFn: () => {
      if (!selectedEpisode) {
        throw new Error('Missing selected episode');
      }

      return getDownloadOptions(selectedEpisode.sourceProvider, selectedEpisode.url);
    },
    enabled: Boolean(selectedEpisode?.url),
  });

  const downloadOptions = downloadOptionsQuery.data ?? [];
  const streamingOptionsQuery = useQuery({
    queryKey: [
      'streaming-options',
      selectedEpisode?.sourceProvider,
      selectedEpisode?.url,
    ],
    queryFn: () => {
      if (!selectedEpisode) {
        throw new Error('Missing selected episode');
      }

      return getStreamingOptions(selectedEpisode.sourceProvider, selectedEpisode.url);
    },
    enabled: Boolean(selectedEpisode?.url),
  });
  const streamingOptions =
    streamingOptionsQuery.data ?? EMPTY_STREAMING_OPTIONS;
  const episodesLoading = searchQuery.isLoading || episodesQuery.isLoading;
  const downloadJobsQuery = useQuery({
    queryKey: ['downloads'],
    queryFn: listDownloadJobs,
    refetchInterval: 1_000,
  });
  const localMediaFilesQuery = useQuery({
    queryKey: ['library', 'files'],
    queryFn: listLocalMediaFiles,
    refetchInterval: 5_000,
  });
  const downloadJobs = downloadJobsQuery.data ?? EMPTY_DOWNLOAD_JOBS;
  const localMediaFiles =
    localMediaFilesQuery.data ?? EMPTY_LOCAL_MEDIA_FILES;
  const downloadedAnimeQuery = useQuery({
    queryKey: ['library', 'anime'],
    queryFn: listDownloadedAnime,
    refetchInterval: 5_000,
  });
  const downloadedAnime =
    downloadedAnimeQuery.data ?? EMPTY_DOWNLOADED_ANIME;
  const continueWatchingQuery = useQuery({
    queryKey: ['playback', 'continue-watching'],
    queryFn: listContinueWatching,
    refetchInterval: 10_000,
  });
  const continueWatching =
    continueWatchingQuery.data ?? EMPTY_PLAYBACK_PROGRESS;
  const newPopularQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'home', 'new-popular'],
    queryFn: () => searchAnimeMetadata('', 'popularity'),
    enabled: showingHomeRoute,
    staleTime: 5 * 60_000,
  });
  const newPopularAnime = newPopularQuery.data ?? EMPTY_ANIME_RESULTS;
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
    navigateToAnimeSearch(value, animeSearchSort);
  }

  function handleAnimeSearchSortChange(sort: AnimeMetadataSearchSort) {
    setAnimeSearchSort(sort);

    if (trimmedAnimeQuery) {
      navigateToAnimeSearch(trimmedAnimeQuery, sort, true);
    }
  }

  function navigateToAnimeSearch(
    query: string,
    sort: AnimeMetadataSearchSort,
    replace = animeSearchRoute,
  ) {
    const nextQuery = query.trim();

    if (!nextQuery) {
      void navigate({
        replace: true,
        search: {
          search: '',
          sort: toAnimeSearchSortUrlValue(sort),
        },
        to: '/search/anime',
      });

      return;
    }

    void navigate({
      replace,
      search: {
        search: nextQuery,
        sort: toAnimeSearchSortUrlValue(sort),
      },
      to: '/search/anime',
    });
  }

  function handleAnimeSelect(item: AnimeMetadataSearchResult) {
    setAnimeQuery('');
    setSelectedEpisodeUrl(null);
    void navigate({
      params: {
        animeId: String(item.id),
        slug: toAnimeSlug(item),
      },
      to: '/anime/$animeId/$slug',
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
      to: '/anime/$animeId/$slug/episode/$episodeNumber',
    });
  }

  function handleDownload(option: DownloadOption, job?: DownloadJob) {
    if (job?.status === 'failed' || job?.status === 'cancelled') {
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
        slug: slugFromTitle(file.displayTitle ?? file.sourceMediaTitle ?? file.filename),
      },
      to: '/anime/$animeId/$slug/episode/$episodeNumber',
    });
  }

  function handleContinueWatchingSelect(progress: PlaybackProgress) {
    const file = progress.localMediaFileId
      ? localMediaFiles.find((candidate) => candidate.id === progress.localMediaFileId)
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
            'anime',
        ),
      },
      to: '/anime/$animeId/$slug/episode/$episodeNumber',
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
            ? 'Downloads'
            : placeholderRoute ??
              (selectedAnimeId || showingAnimeSearch || animeSearchRoute
                ? 'Anime'
                : 'Home')
        }
        onNavigate={(path) => {
          void navigate({ to: path });
        }}
        overlay={showingEpisodeRoute}
      />
      <SidebarInset className="min-h-svh min-w-0 bg-background text-foreground">
        <div
          className={cn(
            'min-w-0 overflow-x-hidden',
            showingEpisodeRoute ? 'p-3 md:px-6 md:py-4' : 'p-4 md:p-8',
          )}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <header
              className={cn(
                'grid gap-3 md:items-center',
                showingEpisodeRoute
                  ? 'md:grid-cols-[minmax(0,1fr)_auto_auto]'
                  : 'md:grid-cols-[minmax(0,1fr)_minmax(18rem,36rem)_minmax(0,1fr)]',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                {showingEpisodeRoute ? (
                  <button
                    aria-label="Go to home"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    type="button"
                    onClick={() => {
                      void navigate({ to: '/home' });
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
                    '-ml-2',
                    showingEpisodeRoute ? 'md:inline-flex' : 'md:hidden',
                  )}
                />
                <AppBreadcrumbs
                  anime={animeDetails}
                  animeSearchRoute={animeSearchRoute || showingAnimeSearch}
                  downloadsRoute={downloadsRoute}
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
                onEpisodeSelect={(_anime, file) => handleLocalEpisodeSelect(file)}
                onRetryJob={(job) => retryDownloadMutation.mutate(job.id)}
              />
            ) : null}

            {!downloadsRoute && placeholderRoute ? (
              <EmptyRoutePage title={placeholderRoute} />
            ) : null}

            {!downloadsRoute && !placeholderRoute && showingAnimeSearch ? (
              <AnimeSearchResults
                loading={animeMetadataSearchQuery.isFetching}
                results={animeResults}
                selectedId={selectedAnimeId}
                sort={animeSearchSort}
                error={animeMetadataSearchQuery.error}
                onSortChange={handleAnimeSearchSortChange}
                onSelect={handleAnimeSelect}
              />
            ) : null}

            {!downloadsRoute &&
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
            !placeholderRoute &&
            !showingEpisodeRoute &&
            !showingAnimeSearch &&
            animeDetails ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Episodes</CardTitle>
                    <CardDescription>{selectedMedia ? selectedMedia.title : 'Pick an anime'}</CardDescription>
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
                    {!episodesLoading && sourceSearchTerm && !episodes.length ? (
                      <p className="text-sm text-muted-foreground">No episodes found yet.</p>
                    ) : null}
                    {searchQuery.isError ? <ErrorText error={searchQuery.error} /> : null}
                    {episodesQuery.isError ? <ErrorText error={episodesQuery.error} /> : null}
                  </CardContent>
                </Card>
              </>
            ) : null}

            {!downloadsRoute &&
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
            !placeholderRoute &&
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
                onResume={handleContinueWatchingSelect}
              />
            ) : null}
          </div>
        </div>
        {focusedImage ? (
          <ImageLightbox image={focusedImage} onClose={() => setFocusedImage(null)} />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}

function AppBreadcrumbs({
  anime,
  animeSearchRoute,
  downloadsRoute,
  placeholderRoute,
  routeEpisodeNumber,
  selectedAnimeId,
  selectedEpisode,
}: {
  anime?: AnimeMetadataDetails;
  animeSearchRoute: boolean;
  downloadsRoute: boolean;
  placeholderRoute?: SidebarItemTitle;
  routeEpisodeNumber?: string;
  selectedAnimeId?: number;
  selectedEpisode?: EpisodeSummary;
}) {
  const animeTitle = anime?.displayTitle;
  const episodeLabel = routeEpisodeNumber
    ? selectedEpisode
      ? formatEpisodeTitle(selectedEpisode)
      : `Episode ${routeEpisodeNumber}`
    : undefined;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {downloadsRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">Downloads</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {!downloadsRoute && placeholderRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{placeholderRoute}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {!downloadsRoute && !placeholderRoute && animeSearchRoute ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">Search</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {!downloadsRoute && !placeholderRoute && !animeSearchRoute && anime ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {episodeLabel ? (
                <BreadcrumbLink asChild className="truncate">
                  <Link
                    params={{
                      animeId: String(anime.id),
                      slug: toAnimeSlug(anime),
                    }}
                    to="/anime/$animeId/$slug"
                  >
                    {animeTitle}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">{animeTitle}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {episodeLabel ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{episodeLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </>
        ) : null}

        {!downloadsRoute &&
        !placeholderRoute &&
        !animeSearchRoute &&
        !anime &&
        selectedAnimeId ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">Loading</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {!downloadsRoute &&
        !placeholderRoute &&
        !animeSearchRoute &&
        !selectedAnimeId &&
        !anime ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">Home</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function AnimeSearchBar({
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
        'relative w-full transition-[width,max-width] duration-200',
        compact
          ? 'sm:w-56 sm:max-w-56 sm:focus-within:w-80 sm:focus-within:max-w-80'
          : 'max-w-xl',
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
          onClick={() => onQueryChange('')}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

function AnimeSearchResults({
  error,
  loading,
  results,
  selectedId,
  sort,
  onSortChange,
  onSelect,
}: {
  error: Error | null;
  loading: boolean;
  results: AnimeMetadataSearchResult[];
  selectedId?: number;
  sort: AnimeMetadataSearchSort;
  onSortChange: (sort: AnimeMetadataSearchSort) => void;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const selectedSort =
    ANIME_SEARCH_SORT_OPTIONS.find((option) => option.id === sort) ??
    ANIME_SEARCH_SORT_OPTIONS[1];

  return (
    <section className="space-y-6 py-2">
      <Dialog>
        <div className="flex justify-end">
          <DialogTrigger asChild>
            <Button
              aria-label="Open search filters"
              className="size-11"
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
            {SEARCH_FILTERS.map((filter) => (
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
                        sort === option.id && 'font-medium text-foreground',
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

      {!loading && results.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">No AniList results found.</p>
      ) : null}
      {error ? <ErrorText error={error} /> : null}
    </section>
  );
}

function AnimeSearchSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: 12 }, (_, index) => (
        <div className="space-y-3" key={index}>
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function AnimeSearchResultCard({
  item,
  selected,
  onSelect,
}: {
  item: AnimeMetadataSearchResult;
  selected: boolean;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const coverUrl =
    item.coverImage?.extraLarge ?? item.coverImage?.large ?? item.coverImage?.medium;

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
          <span className="block text-xs text-muted-foreground">{item.seasonYear}</span>
        ) : null}
      </span>
    </button>
  );
}

function DownloadsPage({
  anime,
  jobs,
  loading,
  mutating,
  onDeleteFile,
  onDeleteJob,
  onEpisodeSelect,
  onRetryJob,
}: {
  anime: DownloadedAnime[];
  jobs: DownloadJob[];
  loading: boolean;
  mutating: boolean;
  onDeleteFile: (file: LocalMediaFile) => void;
  onDeleteJob: (job: DownloadJob) => void;
  onEpisodeSelect: (anime: DownloadedAnime, file: LocalMediaFile) => void;
  onRetryJob: (job: DownloadJob) => void;
}) {
  const failedJobs = jobs.filter(
    (job) => job.status === 'failed' || job.status === 'cancelled',
  );

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Downloads</h1>
        <p className="text-sm text-muted-foreground">
          Downloaded anime grouped by local files.
        </p>
      </div>
      {failedJobs.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Needs Attention</CardTitle>
            <CardDescription>Failed or cancelled jobs kept for retry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedJobs.map((job) => (
              <DownloadJobRow
                job={job}
                key={job.id}
                mutating={mutating}
                onDelete={onDeleteJob}
                onRetry={onRetryJob}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
      {loading ? <ResultSkeleton /> : null}
      {!loading && anime.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {anime.map((item) => (
            <Card key={item.key}>
              <CardContent className="grid gap-4 p-4 sm:grid-cols-[7rem_1fr]">
                <div className="aspect-[2/3] overflow-hidden rounded-md bg-muted">
                  {item.coverImageUrl ? (
                    <img
                      alt={`${item.displayTitle} cover`}
                      className="h-full w-full object-cover"
                      src={item.coverImageUrl}
                      onError={hideBrokenImage}
                    />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <h2 className="line-clamp-2 font-semibold">
                      {item.displayTitle}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {item.files.length}{' '}
                      {item.files.length === 1 ? 'episode' : 'episodes'} saved
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {item.files
                      .toSorted(compareLocalMediaFiles)
                      .map((file) => (
                        <div
                          className="flex items-center gap-2 rounded-lg border p-2"
                          key={file.id}
                        >
                          <Button
                            className="min-w-0 flex-1 justify-between"
                            disabled={!item.metadataId || !file.episodeNumber}
                            type="button"
                            variant="ghost"
                            onClick={() => onEpisodeSelect(item, file)}
                          >
                            <span className="truncate">
                              {file.episodeNumber
                                ? `Episode ${file.episodeNumber}`
                                : file.episodeTitle ?? 'Episode'}
                            </span>
                            <Badge variant="secondary">{file.quality}</Badge>
                          </Button>
                          <Button
                            aria-label={`Delete ${file.filename}`}
                            disabled={mutating}
                            size="icon"
                            type="button"
                            variant="ghost"
                            onClick={() => onDeleteFile(file)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
      {!loading && !anime.length ? (
        <p className="text-sm text-muted-foreground">
          Completed downloads will appear here grouped by anime.
        </p>
      ) : null}
    </section>
  );
}

function EmptyRoutePage({ title }: { title: SidebarItemTitle }) {
  return (
    <section className="rounded-xl border bg-card p-6 text-card-foreground">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section is ready for future Elysium features.
      </p>
    </section>
  );
}

type VideoElementEventHandler = ComponentProps<'video'>['onTimeUpdate'];

type SeekFeedback = {
  direction: 'backward' | 'forward';
  id: number;
  seconds: number;
};

type PlaybackFeedback = {
  action: 'pause' | 'play';
  id: number;
};

type PlayerNowPlaying = {
  episodeNumber?: string;
  episodeTitle?: string;
  mediaTitle: string;
};

function ElysiumVideoPlayer({
  nowPlaying,
  poster,
  src,
  onEnded,
  onLoadedMetadata,
  onPause,
  onTimeUpdate,
}: {
  nowPlaying?: PlayerNowPlaying;
  poster?: string;
  src: string;
  onEnded?: VideoElementEventHandler;
  onLoadedMetadata?: VideoElementEventHandler;
  onPause?: VideoElementEventHandler;
  onTimeUpdate?: VideoElementEventHandler;
}) {
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback | null>(null);
  const [playbackFeedback, setPlaybackFeedback] =
    useState<PlaybackFeedback | null>(null);
  const seekFeedbackTimeoutRef = useRef<number | undefined>(undefined);
  const playbackFeedbackTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (seekFeedbackTimeoutRef.current) {
        window.clearTimeout(seekFeedbackTimeoutRef.current);
      }

      if (playbackFeedbackTimeoutRef.current) {
        window.clearTimeout(playbackFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function showSeekFeedback(direction: SeekFeedback['direction']) {
    if (seekFeedbackTimeoutRef.current) {
      window.clearTimeout(seekFeedbackTimeoutRef.current);
    }

    setSeekFeedback((current) => ({
      direction,
      id: (current?.id ?? 0) + 1,
      seconds: SEEK_FEEDBACK_SECONDS,
    }));
    seekFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSeekFeedback(null);
      seekFeedbackTimeoutRef.current = undefined;
    }, SEEK_FEEDBACK_TIMEOUT_MS);
  }

  function showPlaybackFeedback(action: PlaybackFeedback['action']) {
    if (playbackFeedbackTimeoutRef.current) {
      window.clearTimeout(playbackFeedbackTimeoutRef.current);
    }

    setPlaybackFeedback((current) => ({
      action,
      id: (current?.id ?? 0) + 1,
    }));
    playbackFeedbackTimeoutRef.current = window.setTimeout(() => {
      setPlaybackFeedback(null);
      playbackFeedbackTimeoutRef.current = undefined;
    }, PLAYBACK_FEEDBACK_TIMEOUT_MS);
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const seekButton = target.closest<HTMLButtonElement>(
      '.media-button--seek[data-direction]',
    );
    const direction = seekButton?.dataset.direction;

    if (direction === 'backward' || direction === 'forward') {
      showSeekFeedback(direction);
    }
  }

  function handlePause(event: SyntheticEvent<HTMLVideoElement>) {
    onPause?.(event);

    if (!event.currentTarget.ended) {
      showPlaybackFeedback('pause');
    }
  }

  function handlePlay() {
    showPlaybackFeedback('play');
  }

  return (
    <ELYSIUM_VIDEO_PLAYER.Provider key={src}>
      <div className="relative h-full w-full" onClickCapture={handleClickCapture}>
        <VideoSkin
          className="h-full w-full"
          poster={poster}
          style={
            {
              '--media-border-radius': '0.375rem',
              '--media-video-border-radius': '0.375rem',
            } as ComponentProps<typeof VideoSkin>['style']
          }
        >
          <Video
            key={src}
            playsInline
            preload="metadata"
            src={src}
            onEnded={onEnded}
            onLoadedMetadata={onLoadedMetadata}
            onPause={handlePause}
            onPlay={handlePlay}
            onTimeUpdate={onTimeUpdate}
          />
          {playbackFeedback ? (
            <ElysiumPlaybackFeedback feedback={playbackFeedback} />
          ) : null}
          {nowPlaying ? <ElysiumPlayerNowPlaying nowPlaying={nowPlaying} /> : null}
          {seekFeedback ? <ElysiumSeekFeedback feedback={seekFeedback} /> : null}
        </VideoSkin>
      </div>
    </ELYSIUM_VIDEO_PLAYER.Provider>
  );
}

function ElysiumPlayerNowPlaying({
  nowPlaying,
}: {
  nowPlaying: PlayerNowPlaying;
}) {
  const controls = ELYSIUM_VIDEO_PLAYER.usePlayer(selectControls);
  const fullscreen = ELYSIUM_VIDEO_PLAYER.usePlayer(selectFullscreen);
  const visible = Boolean(fullscreen?.fullscreen && controls?.controlsVisible);
  const episodeLine = nowPlaying.episodeNumber
    ? [
        `Episode ${nowPlaying.episodeNumber}`,
        nowPlaying.episodeTitle,
      ]
        .filter(Boolean)
        .join(': ')
    : undefined;

  return (
    <div className="elysium-player-now-playing" data-visible={visible ? '' : undefined}>
      <ChevronLeft aria-hidden="true" className="elysium-player-now-playing__icon" />
      <div className="min-w-0">
        <p className="elysium-player-now-playing__title">{nowPlaying.mediaTitle}</p>
        {episodeLine ? (
          <p className="elysium-player-now-playing__episode">{episodeLine}</p>
        ) : null}
      </div>
    </div>
  );
}

function ElysiumPlaybackFeedback({
  feedback,
}: {
  feedback: PlaybackFeedback;
}) {
  return (
    <div className="elysium-playback-feedback" key={feedback.id}>
      <div className="elysium-playback-feedback__bubble">
        {feedback.action === 'pause' ? (
          <svg
            aria-hidden="true"
            className="elysium-playback-feedback__icon"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <rect height="15" rx="2.4" width="5.5" x="5.25" y="4.5" />
            <rect height="15" rx="2.4" width="5.5" x="13.25" y="4.5" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="elysium-playback-feedback__icon"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M7 5.95c0-1.54 1.68-2.5 3.01-1.72l10.28 6.05a2 2 0 0 1 0 3.44L10.01 19.77C8.68 20.55 7 19.59 7 18.05z" />
          </svg>
        )}
      </div>
    </div>
  );
}

function ElysiumSeekFeedback({ feedback }: { feedback: SeekFeedback }) {
  return (
    <div className="media-input-feedback">
      <div
        className="media-input-feedback-bubble"
        data-direction={feedback.direction}
        data-open=""
        key={feedback.id}
      >
        <svg
          aria-hidden="true"
          className="media-icon media-icon--seek"
          fill="none"
          height="18"
          viewBox="0 0 18 18"
          width="18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="m11.964 9.014-4.95-4.95m0 9.9 4.95-4.95"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        <div
          className="media-time"
          data-count="1"
          data-direction={feedback.direction}
          data-seektotal={String(feedback.seconds)}
          data-value={`${feedback.seconds}s`}
          data-open=""
        >
          {feedback.seconds}s
        </div>
      </div>
    </div>
  );
}

function EpisodeWatchPanel({
  anime,
  episode,
  episodes,
  episodesLoading,
  localFiles,
  routeEpisodeNumber,
  streamingOptions,
  streamingOptionsLoading,
  onEpisodeSelect,
}: {
  anime: AnimeMetadataDetails;
  episode: EpisodeSummary | undefined;
  episodes: EpisodeSummary[];
  episodesLoading: boolean;
  localFiles: LocalMediaFile[];
  routeEpisodeNumber?: string;
  streamingOptions: StreamingOption[];
  streamingOptionsLoading: boolean;
  onEpisodeSelect: (episode: EpisodeSummary) => void;
}) {
  const queryClient = useQueryClient();
  const progressSaveMutation = useMutation({
    mutationFn: savePlaybackProgress,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['playback', 'continue-watching'],
      });
    },
  });
  const [selectedLocalFileId, setSelectedLocalFileId] = useState<string>();
  const [selectedStreamIndex, setSelectedStreamIndex] = useState(0);
  const [episodesPanelOpen, setEpisodesPanelOpen] = useState(false);
  const [playerHeight, setPlayerHeight] = useState<number>();
  const lastProgressSaveRef = useRef(0);
  const playerFrameRef = useRef<HTMLDivElement>(null);
  const restoredProgressKeyRef = useRef<string | undefined>(undefined);
  const selectedLocalFile =
    localFiles.find((file) => file.id === selectedLocalFileId) ?? localFiles[0];
  const playableStreams = useMemo(
    () =>
      streamingOptions
        .filter((option) => option.embeddable !== false)
        .toSorted(compareStreamingOptions),
    [streamingOptions],
  );
  const blockedStreams = useMemo(
    () => streamingOptions.filter((option) => option.embeddable === false),
    [streamingOptions],
  );
  const selectedStream =
    playableStreams[selectedStreamIndex] ?? playableStreams[0];
  const episodeDrawerItems = useMemo(
    () => getEpisodeDrawerItems(episodes, episode, routeEpisodeNumber),
    [episodes, episode, routeEpisodeNumber],
  );
  const currentEpisodeNumber =
    normalizeEpisodeNumber(episode?.number) ??
    normalizeEpisodeNumber(episode?.title) ??
    normalizeEpisodeNumber(routeEpisodeNumber) ??
    normalizeEpisodeNumber(selectedLocalFile?.episodeNumber) ??
    normalizeEpisodeNumber(selectedLocalFile?.episodeTitle);
  const currentEpisodeSubtitle =
    (episode ? getEpisodeSubtitle(episode) : undefined) ??
    getEpisodeSubtitleFromText(selectedLocalFile?.episodeTitle, currentEpisodeNumber);
  const episodeTitle = episode
    ? formatEpisodeTitle(episode)
    : routeEpisodeNumber
      ? `Episode ${routeEpisodeNumber}`
      : 'Episode';
  const watchTitle = `${anime.displayTitle} - ${episodeTitle}`;
  const playbackProgressQuery = useQuery({
    queryKey: ['playback', 'progress', selectedLocalFile?.id],
    queryFn: () =>
      selectedLocalFile
        ? getPlaybackProgress({ localMediaFileId: selectedLocalFile.id })
        : undefined,
    enabled: Boolean(selectedLocalFile?.id),
  });

  useEffect(() => {
    setSelectedLocalFileId(undefined);
    setSelectedStreamIndex(0);
    restoredProgressKeyRef.current = undefined;
  }, [episode?.url]);

  useEffect(() => {
    setSelectedStreamIndex(0);
  }, [playableStreams.map((option) => option.embedUrl).join('|')]);

  useEffect(() => {
    const playerFrame = playerFrameRef.current;

    if (!playerFrame) {
      return undefined;
    }

    const measuredPlayerFrame = playerFrame;

    function updatePlayerHeight() {
      setPlayerHeight(measuredPlayerFrame.getBoundingClientRect().height);
    }

    updatePlayerHeight();

    const observer = new ResizeObserver(updatePlayerHeight);
    observer.observe(measuredPlayerFrame);
    window.addEventListener('resize', updatePlayerHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePlayerHeight);
    };
  }, [episodesPanelOpen, selectedLocalFile?.id, selectedStream?.embedUrl]);

  function saveLocalProgress(
    event: SyntheticEvent<HTMLVideoElement>,
    completed = false,
    force = false,
  ) {
    if (!selectedLocalFile) {
      return;
    }

    const video = event.currentTarget;
    const now = Date.now();

    if (!force && now - lastProgressSaveRef.current < 7_500) {
      return;
    }

    lastProgressSaveRef.current = now;
    progressSaveMutation.mutate(
      createPlaybackProgressRequest({
        anime,
        completed,
        episode,
        file: selectedLocalFile,
        positionSeconds: video.currentTime,
        routeEpisodeNumber,
        durationSeconds: Number.isFinite(video.duration)
          ? video.duration
          : undefined,
      }),
    );
  }

  function restoreLocalProgress(event: SyntheticEvent<HTMLVideoElement>) {
    const progress = playbackProgressQuery.data;

    if (!selectedLocalFile || !progress || progress.completed) {
      return;
    }

    const video = event.currentTarget;
    const restoreKey = `${selectedLocalFile.id}:${progress.updatedAt}`;

    if (
      restoredProgressKeyRef.current === restoreKey ||
      progress.positionSeconds < 5 ||
      (Number.isFinite(video.duration) &&
        progress.positionSeconds > video.duration - 5)
    ) {
      return;
    }

    restoredProgressKeyRef.current = restoreKey;
    video.currentTime = progress.positionSeconds;
  }

  return (
    <section className="space-y-4">
      <div
        className={cn(
          'grid gap-4',
          episodesPanelOpen && 'lg:grid-cols-[minmax(0,1fr)_20rem]',
        )}
      >
        <div className="overflow-hidden rounded-xl bg-black shadow-sm">
          <div
            className="mx-auto aspect-video w-full max-w-[min(100%,calc((100svh-12rem)*1.7778))] bg-black"
            ref={playerFrameRef}
          >
            {selectedLocalFile ? (
              <ElysiumVideoPlayer
                nowPlaying={{
                  episodeNumber: currentEpisodeNumber,
                  episodeTitle: currentEpisodeSubtitle,
                  mediaTitle: anime.displayTitle,
                }}
                poster={
                  anime.bannerImage ??
                  anime.coverImage?.extraLarge ??
                  anime.coverImage?.large
                }
                src={getLocalMediaStreamUrl(selectedLocalFile.id)}
                onEnded={(event) => saveLocalProgress(event, true, true)}
                onLoadedMetadata={restoreLocalProgress}
                onPause={(event) => saveLocalProgress(event, false, true)}
                onTimeUpdate={(event) => saveLocalProgress(event)}
              />
            ) : selectedStream ? (
              <iframe
                allow="fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
                referrerPolicy="no-referrer-when-downgrade"
                src={selectedStream.embedUrl}
                title={`${anime.displayTitle} ${selectedStream.providerLabel}`}
              />
            ) : streamingOptionsLoading ? (
              <div className="flex h-full w-full items-center justify-center bg-muted/20">
                <Skeleton className="h-full w-full rounded-none bg-muted/20" />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                No streaming embeds found for this episode yet.
              </div>
            )}
          </div>
        </div>

        {episodesPanelOpen ? (
          <EpisodeSidePanel
            currentEpisode={episode}
            episodes={episodeDrawerItems}
            height={playerHeight}
            loading={episodesLoading}
            routeEpisodeNumber={routeEpisodeNumber}
            onEpisodeSelect={onEpisodeSelect}
          />
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="min-w-0 text-xl font-semibold leading-tight md:text-2xl">
            {watchTitle}
          </h1>
          <Button
            aria-expanded={episodesPanelOpen}
            className="w-full sm:w-auto"
            type="button"
            variant="secondary"
            onClick={() => setEpisodesPanelOpen((open) => !open)}
          >
            <Clapperboard />
            Episodes
          </Button>
        </div>

        {selectedLocalFile ? (
          <>
            {localFiles.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {localFiles.map((file) => (
                  <Button
                    key={file.id}
                    size="sm"
                    type="button"
                    variant={
                      file.id === selectedLocalFile.id ? 'default' : 'outline'
                    }
                    onClick={() => setSelectedLocalFileId(file.id)}
                  >
                    {file.quality}
                  </Button>
                ))}
              </div>
            ) : null}
          </>
        ) : selectedStream ? (
          <>
            <div className="flex flex-wrap gap-2">
              {playableStreams.map((option, index) => (
                <Button
                  key={`${option.providerLabel}-${option.embedUrl}`}
                  size="sm"
                  type="button"
                  variant={index === selectedStreamIndex ? 'default' : 'outline'}
                  onClick={() => setSelectedStreamIndex(index)}
                >
                  {option.providerLabel}
                </Button>
              ))}
            </div>
            {blockedStreams.length ? (
              <div className="flex flex-wrap gap-2">
                {blockedStreams.map((option) => (
                  <Badge
                    key={`${option.providerLabel}-${option.embedUrl}`}
                    variant="outline"
                  >
                    {option.providerLabel}: {option.unsupportedReason ?? 'Unavailable'}
                  </Badge>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

function EpisodeSidePanel({
  currentEpisode,
  episodes,
  height,
  loading,
  routeEpisodeNumber,
  onEpisodeSelect,
}: {
  currentEpisode: EpisodeSummary | undefined;
  episodes: EpisodeSummary[];
  height?: number;
  loading: boolean;
  routeEpisodeNumber?: string;
  onEpisodeSelect: (episode: EpisodeSummary) => void;
}) {
  return (
    <aside
      className="min-h-0 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm animate-in fade-in slide-in-from-right-4 duration-200"
      style={height ? { height } : undefined}
    >
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">Episodes</h2>
      </div>
      <div className="h-[calc(100%-3rem)] overflow-y-auto p-3">
        {loading ? <ResultSkeleton compact /> : null}
        {!loading && episodes.length ? (
          <div className="space-y-2">
            {episodes.map((episode) => {
              const selected = isSameEpisode(
                episode,
                currentEpisode,
                routeEpisodeNumber,
              );
              const title = getEpisodeSubtitle(episode);

              return (
                <button
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected && 'border-primary bg-primary/10 text-primary',
                  )}
                  key={episode.url}
                  type="button"
                  onClick={() => onEpisodeSelect(episode)}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {formatEpisodeTitle(episode)}
                    </span>
                    {title ? (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {title}
                      </span>
                    ) : null}
                  </span>
                  {selected ? <Badge variant="secondary">Current</Badge> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {!loading && !episodes.length ? (
          <p className="text-sm text-muted-foreground">No episodes found yet.</p>
        ) : null}
      </div>
    </aside>
  );
}

function DownloadOptionsStepper({
  anime,
  downloadOptions,
  downloadOptionsError,
  downloadOptionsLoading,
  episode,
  downloadJobByUrl,
  mutating,
  routeEpisodeNumber,
  retryError,
  startError,
  onDownload,
}: {
  anime: AnimeMetadataDetails;
  downloadOptions: DownloadOption[];
  downloadOptionsError: Error | null;
  downloadOptionsLoading: boolean;
  episode: EpisodeSummary | undefined;
  downloadJobByUrl: Map<string, DownloadJob>;
  mutating: boolean;
  routeEpisodeNumber?: string;
  retryError: Error | null;
  startError: Error | null;
  onDownload: (option: DownloadOption, job?: DownloadJob) => void;
}) {
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null);
  const [selectedProviderUrl, setSelectedProviderUrl] = useState<string | null>(
    null,
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const resetTimerRef = useRef<number | undefined>(undefined);
  const qualityGroups = useMemo(
    () => getDownloadQualityGroups(downloadOptions),
    [downloadOptions],
  );
  const selectedGroup =
    qualityGroups.find((group) => group.quality === selectedQuality) ?? null;
  const selectedOption =
    selectedGroup?.options.find(
      (option) => option.providerUrl === selectedProviderUrl,
    ) ?? null;
  const selectedJob = selectedOption
    ? downloadJobByUrl.get(selectedOption.providerUrl)
    : undefined;
  const selectedSupport = selectedOption
    ? getDownloadSupport(selectedOption)
    : undefined;
  const selectedActive = selectedJob
    ? isActiveDownloadStatus(selectedJob.status)
    : false;
  const selectedCompleted = selectedJob?.status === 'completed';
  const selectedOptionSupported = selectedSupport?.supported ?? false;

  useEffect(
    () => () => {
      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      selectedQuality &&
      !qualityGroups.some((group) => group.quality === selectedQuality)
    ) {
      setSelectedQuality(null);
      setSelectedProviderUrl(null);
      setSuccessMessage(null);
    }
  }, [qualityGroups, selectedQuality]);

  function handleQualitySelect(quality: string) {
    setSuccessMessage(null);
    setSelectedProviderUrl(null);
    setSelectedQuality((current) => (current === quality ? null : quality));
  }

  function handleConfirmDownload() {
    if (!selectedOption || !selectedSupport) {
      return;
    }

    if (
      !selectedSupport.supported ||
      selectedActive ||
      selectedCompleted ||
      mutating
    ) {
      return;
    }

    onDownload(selectedOption, selectedJob);
    setSuccessMessage(
      `${formatHostProvider(selectedOption.hostProvider)} ${getDownloadQualityLabel(selectedOption.quality)} request sent.`,
    );

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }

    resetTimerRef.current = window.setTimeout(() => {
      setSelectedQuality(null);
      setSelectedProviderUrl(null);
      setSuccessMessage(null);
      resetTimerRef.current = undefined;
    }, 900);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Download {formatDownloadEpisodeReference(episode, routeEpisodeNumber)} of{' '}
          {anime.displayTitle} locally
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {downloadOptionsLoading ? <ResultSkeleton compact /> : null}

        {!downloadOptionsLoading && qualityGroups.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              {qualityGroups.map((group) => {
                const selected = group.quality === selectedQuality;

                return (
                  <Button
                    className={cn(
                      'transition-opacity',
                      selectedQuality && !selected && 'opacity-45',
                    )}
                    key={group.quality}
                    type="button"
                    variant={selected ? 'default' : 'secondary'}
                    onClick={() => handleQualitySelect(group.quality)}
                  >
                    {getDownloadQualityLabel(group.quality)}
                  </Button>
                );
              })}
            </div>

            {selectedGroup ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {selectedGroup.options.map((option) => {
                    const support = getDownloadSupport(option);
                    const selected = option.providerUrl === selectedProviderUrl;

                    return (
                      <Button
                        className={cn(
                          'justify-start transition-opacity',
                          selected && 'ring-2 ring-primary/40',
                          selectedProviderUrl && !selected && 'opacity-45',
                        )}
                        disabled={!support.supported}
                        key={`${option.quality}-${option.hostProvider}-${option.providerUrl}`}
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSuccessMessage(null);
                          setSelectedProviderUrl((current) =>
                            current === option.providerUrl ? null : option.providerUrl,
                          );
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ProviderFavicon option={option} />
                          <span className="truncate font-medium">
                            {formatHostProvider(option.hostProvider)}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>

                {selectedOption && selectedSupport ? (
                  <div>
                    <Button
                      disabled={
                        !selectedOptionSupported ||
                        selectedActive ||
                        selectedCompleted ||
                        mutating
                      }
                      type="button"
                      onClick={handleConfirmDownload}
                    >
                      Confirm download
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {successMessage}
              </div>
            ) : null}
          </>
        ) : null}

        {!downloadOptionsLoading && !qualityGroups.length ? (
          <p className="text-sm text-muted-foreground">
            No download options found for this episode yet.
          </p>
        ) : null}

        {downloadOptionsError ? <ErrorText error={downloadOptionsError} /> : null}
        {startError ? <ErrorText error={startError} /> : null}
        {retryError ? <ErrorText error={retryError} /> : null}
      </CardContent>
    </Card>
  );
}

function ProviderFavicon({ option }: { option: DownloadOption }) {
  const faviconUrl = getProviderFaviconUrl(option.providerUrl);

  return (
    <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted text-xs font-semibold uppercase text-muted-foreground">
      {faviconUrl ? (
        <img
          alt=""
          className="size-full object-cover"
          src={faviconUrl}
          onError={hideBrokenImage}
        />
      ) : (
        formatHostProvider(option.hostProvider).charAt(0)
      )}
    </span>
  );
}

function ElysiumSidebar({
  activeItem,
  overlay = false,
  onNavigate,
}: {
  activeItem: SidebarItemTitle;
  overlay?: boolean;
  onNavigate: (path: SidebarRoutePath) => void;
}) {
  return (
    <Sidebar collapsible={overlay ? 'offcanvas' : 'icon'} overlay={overlay}>
      <SidebarHeader className="px-3 py-4">
        <div className="flex h-9 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <button
            aria-label="Go to home"
            className="flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center"
            type="button"
            onClick={() => onNavigate('/home')}
          >
            <img
              alt=""
              className="size-8 shrink-0 object-contain"
              src={BRAND_MARK_SRC}
            />
            <span className="font-brand truncate text-xl font-normal leading-none group-data-[collapsible=icon]:hidden">
              Elysium
            </span>
          </button>
          <SidebarTrigger className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent className="py-3">
        <SidebarNavSection
          activeItem={activeItem}
          items={MAIN_NAV_ITEMS}
          label="Home"
          onNavigate={onNavigate}
        />
        <SidebarNavSection
          activeItem={activeItem}
          items={LIBRARY_NAV_ITEMS}
          label="Library"
          onNavigate={onNavigate}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function SidebarNavSection({
  activeItem,
  items,
  label,
  onNavigate,
}: {
  activeItem: SidebarItemTitle;
  items: SidebarNavItem[];
  label: string;
  onNavigate: (path: SidebarRoutePath) => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeItem === item.title;

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  aria-current={active ? 'page' : undefined}
                  isActive={active}
                  tooltip={item.title}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                >
                  <Icon fill={active ? 'currentColor' : 'none'} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function RelatedAnimeSection({
  relations,
  selectedAnimeId,
  onAnimeSelect,
}: {
  relations: AnimeRelation[];
  selectedAnimeId?: number;
  onAnimeSelect: (anime: AnimeMetadataSearchResult) => void;
}) {
  const sortedRelations = useMemo(
    () =>
      relations.toSorted((first, second) => {
        if (first.kind === second.kind) {
          return (first.anime.seasonYear ?? 0) - (second.anime.seasonYear ?? 0);
        }

        return first.kind === 'prequel' ? -1 : 1;
      }),
    [relations],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prequel & Sequel</CardTitle>
        <CardDescription>Select a related anime to load its episodes.</CardDescription>
      </CardHeader>
      <CardContent>
        {sortedRelations.length ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {sortedRelations.map((relation) => (
              <RelatedAnimeCard
                key={`${relation.kind}-${relation.anime.id}`}
                relation={relation}
                selected={selectedAnimeId === relation.anime.id}
                onAnimeSelect={onAnimeSelect}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No prequel or sequel data found.</p>
        )}
      </CardContent>
    </Card>
  );
}

function RelatedAnimeCard({
  relation,
  selected,
  onAnimeSelect,
}: {
  relation: AnimeRelation;
  selected: boolean;
  onAnimeSelect: (anime: AnimeMetadataSearchResult) => void;
}) {
  const coverUrl =
    relation.anime.coverImage?.extraLarge ??
    relation.anime.coverImage?.large ??
    relation.anime.coverImage?.medium;

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-lg border bg-card p-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="button"
      tabIndex={0}
      onClick={() => onAnimeSelect(relation.anime)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onAnimeSelect(relation.anime);
        }
      }}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border bg-muted">
        {coverUrl ? (
          <img
            alt={`${relation.anime.displayTitle} cover`}
            className="h-full w-full object-cover"
            src={coverUrl}
            onError={hideBrokenImage}
          />
        ) : null}
        <Badge className="absolute left-2 top-2 shadow-sm" variant="secondary">
          {relation.label}
        </Badge>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {relation.anime.seasonYear ? (
            <Badge variant="outline">{relation.anime.seasonYear}</Badge>
          ) : null}
          {selected ? <Badge>Selected</Badge> : null}
        </div>
        <p className="line-clamp-3 text-sm font-medium leading-snug">
          {relation.anime.displayTitle}
        </p>
        {relation.anime.format ? (
          <p className="text-xs text-muted-foreground">
            {formatMediaFormat(relation.anime.format)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AccountControls() {
  const [authDialogMode, setAuthDialogMode] = useState<AuthDialogMode | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authProfilePhotoDataUrl, setAuthProfilePhotoDataUrl] = useState('');
  const [authProfilePhotoError, setAuthProfilePhotoError] = useState('');
  const [authProfilePhotoOptimizing, setAuthProfilePhotoOptimizing] =
    useState(false);
  const authSessionQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getAuthSession,
    staleTime: 30_000,
  });
  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: () => {
      setAuthDialogMode(null);
      void authSessionQuery.refetch();
    },
  });
  const signupMutation = useMutation({
    mutationFn: signupUser,
    onSuccess: () => {
      setAuthDialogMode(null);
      void authSessionQuery.refetch();
    },
  });
  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      void authSessionQuery.refetch();
    },
  });
  const user = authSessionQuery.data?.authenticated
    ? authSessionQuery.data.user
    : undefined;
  const busy =
    authSessionQuery.isLoading ||
    loginMutation.isPending ||
    signupMutation.isPending ||
    logoutMutation.isPending ||
    authProfilePhotoOptimizing;
  const activeAuthMutation = authDialogMode === 'signup' ? signupMutation : loginMutation;
  const authDialogTitle = authDialogMode === 'signup' ? 'Create account' : 'Login';
  const authDialogDescription =
    authDialogMode === 'signup'
      ? 'Create a local Elysium account for this private self-hosted instance.'
      : 'Sign in to this local Elysium instance.';

  function openAuthDialog(mode: AuthDialogMode) {
    loginMutation.reset();
    signupMutation.reset();
    setAuthPassword('');
    setAuthProfilePhotoError('');
    setAuthDialogMode(mode);
  }

  function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const credentials = {
      email: authEmail,
      name: authName,
      password: authPassword,
      profilePhotoDataUrl:
        authDialogMode === 'signup' ? authProfilePhotoDataUrl : undefined,
    };

    if (authDialogMode === 'signup') {
      signupMutation.mutate(credentials);
      return;
    }

    loginMutation.mutate(credentials);
  }

  async function handleProfilePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setAuthProfilePhotoDataUrl('');
      setAuthProfilePhotoError('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAuthProfilePhotoDataUrl('');
      setAuthProfilePhotoError('Profile photo must be an image file.');
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
      setAuthProfilePhotoDataUrl('');
      setAuthProfilePhotoError('Profile photo must be smaller than 10 MB.');
      return;
    }

    setAuthProfilePhotoError('');
    setAuthProfilePhotoOptimizing(true);

    try {
      setAuthProfilePhotoDataUrl(await optimizeProfilePhoto(file));
    } catch (error) {
      setAuthProfilePhotoDataUrl('');
      setAuthProfilePhotoError(
        error instanceof Error
          ? error.message
          : 'Could not optimize profile photo.',
      );
    } finally {
      setAuthProfilePhotoOptimizing(false);
    }
  }

  if (!user) {
    return (
      <Dialog
        open={authDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAuthDialogMode(null);
          }
        }}
      >
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => openAuthDialog('login')}
          >
            Login
          </Button>
          <Button
            disabled={busy}
            type="button"
            onClick={() => openAuthDialog('signup')}
          >
            Sign up
          </Button>
        </div>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-2xl">{authDialogTitle}</DialogTitle>
            <DialogDescription className="max-w-sm text-center">
              {authDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            {authDialogMode === 'signup' ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <Input
                    accept="image/*"
                    className="sr-only"
                    disabled={authProfilePhotoOptimizing}
                    id="auth-photo"
                    type="file"
                    onChange={handleProfilePhotoChange}
                  />
                  <label
                    className={cn(
                      'cursor-pointer rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
                      authProfilePhotoOptimizing && 'cursor-wait opacity-70',
                    )}
                    htmlFor="auth-photo"
                  >
                    <Avatar className="size-24 border text-xl shadow-sm">
                      {authProfilePhotoDataUrl ? (
                        <AvatarImage
                          alt="Selected profile preview"
                          src={authProfilePhotoDataUrl}
                        />
                      ) : null}
                      <AvatarFallback>
                        {createAuthPreviewInitials(authName, authEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="sr-only">Choose profile photo</span>
                  </label>
                  {authProfilePhotoOptimizing ? (
                    <p className="text-xs text-muted-foreground">
                      Optimizing image...
                    </p>
                  ) : null}
                  {authProfilePhotoError ? (
                    <p className="text-xs text-destructive">
                      {authProfilePhotoError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="auth-name">
                    Name
                  </label>
                  <Input
                    autoComplete="name"
                    id="auth-name"
                    placeholder="Asforaa"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-email">
                Email
              </label>
              <Input
                autoComplete="email"
                id="auth-email"
                placeholder="asforaa@elysium.local"
                required
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-password">
                Password
              </label>
              <Input
                autoComplete={
                  authDialogMode === 'signup' ? 'new-password' : 'current-password'
                }
                id="auth-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </div>
            {activeAuthMutation.isError ? (
              <p className="text-sm text-destructive">
                {activeAuthMutation.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={busy} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={busy} type="submit">
                {activeAuthMutation.isPending ? 'Working...' : authDialogTitle}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open account menu"
          className="rounded-full"
          size="icon"
          type="button"
          variant="outline"
        >
          <Avatar className="size-8">
            {user.profilePhotoDataUrl ? (
              <AvatarImage alt={`${user.name} profile photo`} src={user.profilePhotoDataUrl} />
            ) : null}
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User />
          My Account
        </DropdownMenuItem>
        <div className="px-1 py-1">
          <ThemeToggle className="h-8 w-full justify-start px-2" variant="ghost" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => logoutMutation.mutate()}
        >
          <LogOut />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle({
  className,
  variant = 'outline',
}: {
  className?: string;
  variant?: ComponentProps<typeof Button>['variant'];
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      className={cn('w-fit', className)}
      type="button"
      variant={variant}
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <Icon />
      {isDark ? 'Light' : 'Dark'}
    </Button>
  );
}

function createAuthPreviewInitials(name: string, email: string) {
  const nameParts = name.trim().split(/\s+/u).filter(Boolean);

  if (nameParts.length) {
    return nameParts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  return email.trim()[0]?.toUpperCase() ?? 'A';
}

async function optimizeProfilePhoto(file: File) {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;

  if (!context) {
    throw new Error('Could not prepare profile photo.');
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PROFILE_PHOTO_SIZE,
    PROFILE_PHOTO_SIZE,
  );

  const blob = await canvasToBlob(
    canvas,
    'image/webp',
    PROFILE_PHOTO_QUALITY,
  );

  return blobToDataUrl(blob);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.addEventListener('load', () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read profile photo.'));
    });

    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('Could not optimize profile photo.'));
      },
      type,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Could not read optimized profile photo.'));
    });
    reader.addEventListener('error', () => {
      reject(new Error('Could not read optimized profile photo.'));
    });

    reader.readAsDataURL(blob);
  });
}

function AnimeDetailPanel({
  anime,
  loading,
  onImageFocus,
}: {
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails;
  loading: boolean;
  onImageFocus: (image: FocusedImage) => void;
}) {
  const details = hasDetails(anime) ? anime : undefined;
  const coverUrl = anime.coverImage?.extraLarge ?? anime.coverImage?.large ?? anime.coverImage?.medium;
  const hasBanner = Boolean(anime.bannerImage);
  const metadataLine = getAnimeMetadataLine(anime);

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card text-card-foreground">
      {hasBanner ? (
        <div className="relative z-0 h-[clamp(10rem,22vw,17rem)] overflow-hidden bg-muted">
          <FocusableImage
            alt={`${anime.displayTitle} banner`}
            buttonClassName="block h-full w-full rounded-none"
            imageClassName="h-full w-full object-cover opacity-80"
            src={anime.bannerImage ?? ''}
            onFocusImage={onImageFocus}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/80 to-transparent" />
        </div>
      ) : null}
      <div className="relative z-10 grid gap-4 p-4 md:grid-cols-[11rem_minmax(0,1fr)] md:p-6">
        <div className={cn('relative z-20', hasBanner && 'md:-mt-20')}>
          {coverUrl ? (
            <FocusableImage
              alt={`${anime.displayTitle} cover`}
              buttonClassName="block w-32 rounded-lg border bg-muted shadow-sm md:w-44"
              imageClassName="aspect-[2/3] w-full object-cover"
              src={coverUrl}
              onFocusImage={onImageFocus}
            />
          ) : (
            <div className="aspect-[2/3] w-32 rounded-lg border bg-muted md:w-44" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold leading-tight">{anime.displayTitle}</h2>
              {loading ? <Badge variant="secondary">Refreshing</Badge> : null}
            </div>
            {metadataLine ? (
              <p className="text-sm text-muted-foreground">{metadataLine}</p>
            ) : null}
            {anime.description ? (
              <p className="max-w-4xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {anime.description}
              </p>
            ) : null}
          </div>

          {details ? <AnimeDetailExtras details={details} onImageFocus={onImageFocus} /> : null}
        </div>
      </div>
    </section>
  );
}

function AnimeDetailExtras({
  details,
  onImageFocus,
}: {
  details: AnimeMetadataDetails;
  onImageFocus: (image: FocusedImage) => void;
}) {
  const tags = getCombinedTags(details);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Score" value={formatScore(details)} />
        <InfoItem label="Studios" value={details.studios.map((studio) => studio.name).join(', ')} />
        <InfoItem label="Source" value={formatToken(details.source)} />
        <InfoItem label="Start" value={formatDate(details.startDate)} />
      </div>

      {details.title.english ? (
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">English Name</p>
          <p className="mt-1 text-sm font-medium">{details.title.english}</p>
        </div>
      ) : null}

      {tags.length ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge className="px-3 py-1" key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {details.characters.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Characters</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {details.characters.slice(0, 6).map((character) => (
              <div className="flex min-w-0 items-center gap-3 rounded-lg border p-2" key={character.id}>
                {character.imageUrl ? (
                  <FocusableImage
                    alt={character.name}
                    buttonClassName="h-14 w-10"
                    imageClassName="h-14 w-10 rounded-md border object-cover"
                    src={character.imageUrl}
                    onFocusImage={onImageFocus}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{character.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[formatToken(character.role), character.voiceActors[0]?.name]
                      .filter(Boolean)
                      .join(' / ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

function FocusableImage({
  alt,
  buttonClassName,
  imageClassName,
  onFocusImage,
  src,
  stopPropagation = false,
}: {
  alt: string;
  buttonClassName?: string;
  imageClassName?: string;
  onFocusImage: (image: FocusedImage) => void;
  src: string;
  stopPropagation?: boolean;
}) {
  return (
    <button
      className={cn(
        'overflow-hidden rounded-md text-left outline-none focus:outline-none focus-visible:outline-none',
        buttonClassName,
      )}
      type="button"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }

        event.currentTarget.blur();
        onFocusImage({ alt, src });
      }}
    >
      <img
        alt={alt}
        className={cn('h-full w-full object-cover', imageClassName)}
        src={src}
        onError={hideBrokenImage}
      />
    </button>
  );
}

function ImageLightbox({
  image,
  onClose,
}: {
  image: FocusedImage;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label="Focused image preview"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <Button
        aria-label="Close image preview"
        className="absolute right-4 top-4 z-10 bg-background/90"
        size="icon"
        type="button"
        variant="outline"
        onClick={onClose}
      >
        <X />
      </Button>
      <div className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
        <img
          alt={image.alt}
          className="max-h-[85svh] max-w-[92vw] rounded-lg border bg-muted object-contain shadow-2xl"
          src={image.src}
        />
      </div>
    </div>
  );
}

function EpisodeButton({
  episode,
  selected,
  onSelect,
}: {
  episode: EpisodeSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={onSelect}
    >
      <span>{formatEpisodeTitle(episode)}</span>
      {selected ? <Badge variant="secondary">Selected</Badge> : null}
    </button>
  );
}

function HomePage({
  continueWatching,
  files,
  newPopular,
  newPopularError,
  newPopularLoading,
  continueWatchingLoading,
  onAnimeSelect,
  onResume,
}: {
  continueWatching: PlaybackProgress[];
  files: LocalMediaFile[];
  newPopular: AnimeMetadataSearchResult[];
  newPopularError: Error | null;
  newPopularLoading: boolean;
  continueWatchingLoading: boolean;
  onAnimeSelect: (item: AnimeMetadataSearchResult) => void;
  onResume: (progress: PlaybackProgress) => void;
}) {
  const fileById = useMemo(() => {
    const map = new Map<string, LocalMediaFile>();

    for (const file of files) {
      map.set(file.id, file);
    }

    return map;
  }, [files]);

  const visibleContinueWatching = continueWatching
    .filter((item) => !item.completed)
    .slice(0, 10);

  return (
    <div className="space-y-10">
      <HomeContinueWatchingSection
        fileById={fileById}
        items={visibleContinueWatching}
        loading={continueWatchingLoading}
        onResume={onResume}
      />
      <HomeNewPopularSection
        error={newPopularError}
        items={newPopular}
        loading={newPopularLoading}
        onSelect={onAnimeSelect}
      />
    </div>
  );
}

function HomeSectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />
    </div>
  );
}

function HomeContinueWatchingSection({
  fileById,
  items,
  loading,
  onResume,
}: {
  fileById: Map<string, LocalMediaFile>;
  items: PlaybackProgress[];
  loading: boolean;
  onResume: (progress: PlaybackProgress) => void;
}) {
  return (
    <section className="space-y-4">
      <HomeSectionTitle title="Continue Watching" />
      {loading && !items.length ? (
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton
              className="h-52 w-[min(80vw,28rem)] shrink-0 rounded-lg"
              key={index}
            />
          ))}
        </div>
      ) : null}
      {items.length ? (
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
          {items.map((progress) => (
            <HomeContinueWatchingCard
              file={findLocalFileForProgress(progress, fileById)}
              key={progress.id}
              progress={progress}
              onResume={onResume}
            />
          ))}
        </div>
      ) : null}
      {!loading && !items.length ? (
        <p className="text-sm text-muted-foreground">
          Partially watched episodes will appear here after local playback starts.
        </p>
      ) : null}
    </section>
  );
}

function HomeContinueWatchingCard({
  file,
  progress,
  onResume,
}: {
  file: LocalMediaFile | undefined;
  progress: PlaybackProgress;
  onResume: (progress: PlaybackProgress) => void;
}) {
  const percent = getPlaybackProgressPercent(progress);
  const title =
    file?.displayTitle ??
    file?.sourceMediaTitle ??
    progress.mediaTitle ??
    'Local episode';
  const episodeNumber = file?.episodeNumber ?? progress.episodeNumber;
  const imageUrl = file?.bannerImageUrl ?? file?.coverImageUrl;
  const coverUrl = file?.coverImageUrl ?? file?.bannerImageUrl;
  const disabled = !file?.metadataId && !progress.metadataId;

  return (
    <article className="group/continue relative h-52 w-[min(82vw,30rem)] shrink-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      {imageUrl ? (
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform group-hover/continue:scale-[1.02]"
          src={imageUrl}
          onError={hideBrokenImage}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-background/40">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="relative z-10 flex h-full flex-col justify-between p-4">
        <div className="flex gap-3">
          <div className="hidden aspect-[2/3] h-24 overflow-hidden rounded-md bg-muted sm:block">
            {coverUrl ? (
              <img
                alt=""
                className="h-full w-full object-cover"
                src={coverUrl}
                onError={hideBrokenImage}
              />
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="line-clamp-2 max-w-sm text-lg font-semibold leading-tight">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {episodeNumber
                ? `Episode ${episodeNumber}`
                : progress.episodeTitle ?? file?.filename ?? 'Episode'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {formatDuration(progress.positionSeconds)}
            {progress.durationSeconds
              ? ` / ${formatDuration(progress.durationSeconds)}`
              : ''}
          </span>
          <Button
            disabled={disabled}
            size="sm"
            type="button"
            onClick={() => onResume(progress)}
          >
            <Play />
            Resume
          </Button>
        </div>
      </div>
    </article>
  );
}

function HomeNewPopularSection({
  error,
  items,
  loading,
  onSelect,
}: {
  error: Error | null;
  items: AnimeMetadataSearchResult[];
  loading: boolean;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  return (
    <section className="space-y-4">
      <HomeSectionTitle title="New & Popular" />
      {loading ? (
        <div className="grid grid-flow-col grid-rows-2 gap-x-5 gap-y-6 overflow-hidden">
          {Array.from({ length: 12 }, (_, index) => (
            <div className="w-36 space-y-3 sm:w-40" key={index}>
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="-mx-4 grid grid-flow-col grid-rows-2 gap-x-5 gap-y-6 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
          {items.slice(0, 12).map((item) => (
            <div className="w-36 sm:w-40" key={item.id}>
              <AnimeSearchResultCard
                item={item}
                selected={false}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      )}
      {!loading && !items.length && !error ? (
        <p className="text-sm text-muted-foreground">
          Popular anime will appear here when AniList results are available.
        </p>
      ) : null}
      {error ? <ErrorText error={error} /> : null}
    </section>
  );
}

function DownloadHistoryDrawer({
  jobs,
  loading,
  mutating,
  onDelete,
  onRetry,
}: {
  jobs: DownloadJob[];
  loading: boolean;
  mutating: boolean;
  onDelete: (job: DownloadJob) => void;
  onRetry: (job: DownloadJob) => void;
}) {
  const activeCount = jobs.filter((job) => isActiveDownloadStatus(job.status)).length;

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button
          aria-label="Open download history"
          className="relative"
          size="icon"
          type="button"
          variant="outline"
        >
          <Download />
          {activeCount ? (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-svh w-[min(30rem,calc(100vw-1rem))] max-w-none overflow-hidden sm:max-w-md">
        <DrawerHeader className="flex-row items-start justify-between gap-4 border-b">
          <div className="min-w-0 space-y-1">
            <DrawerTitle>Downloads</DrawerTitle>
            <DrawerDescription>
              {loading ? 'Refreshing download status' : 'Tracked local download jobs'}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button aria-label="Close downloads" size="icon" type="button" variant="ghost">
              <X />
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {jobs.length ? (
            jobs.map((job) => (
              <DownloadJobRow
                job={job}
                key={job.id}
                mutating={mutating}
                onDelete={onDelete}
                onRetry={onRetry}
              />
            ))
          ) : (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No downloads started yet.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function DownloadJobRow({
  job,
  mutating = false,
  onDelete,
  onRetry,
}: {
  job: DownloadJob;
  mutating?: boolean;
  onDelete?: (job: DownloadJob) => void;
  onRetry?: (job: DownloadJob) => void;
}) {
  const percent = getDownloadProgressPercent(job);
  const retryable = job.status === 'failed' || job.status === 'cancelled';
  const active = isActiveDownloadStatus(job.status);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {job.filename ?? job.option.episodeTitle ?? job.option.mediaTitle ?? 'Download'}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              formatHostProvider(job.option.hostProvider),
              job.option.quality,
              formatDownloadEngine(job),
              job.attemptCount > 1 ? `Attempt ${job.attemptCount}` : undefined,
            ]
              .filter(Boolean)
            .join(' | ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <JobStatusBadge job={job} />
          {retryable && onRetry ? (
            <Button
              disabled={mutating}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onRetry(job)}
            >
              <RotateCcw />
              Retry
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              aria-label={`Delete ${job.filename ?? job.option.providerLabel}`}
              disabled={mutating || active}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => onDelete(job)}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {formatBytes(job.progressBytes)}
          {job.totalBytes ? ` / ${formatBytes(job.totalBytes)}` : ''}
        </span>
        <span>{job.speedBytesPerSecond ? `${formatBytes(job.speedBytesPerSecond)}/s` : ''}</span>
      </div>
      {job.errorMessage ? (
        <p className="text-xs text-muted-foreground">{job.errorMessage}</p>
      ) : null}
      {job.destinationPath && job.status === 'completed' ? (
        <p className="truncate font-mono text-xs text-muted-foreground">
          {job.destinationPath}
        </p>
      ) : null}
    </div>
  );
}

function JobStatusBadge({ job }: { job: DownloadJob }) {
  return (
    <Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>
      {formatToken(job.status)}
    </Badge>
  );
}

function ResultSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className={compact ? 'h-10 w-full' : 'h-20 w-full'} />
      <Skeleton className={compact ? 'h-10 w-full' : 'h-20 w-full'} />
      <Skeleton className={compact ? 'h-10 w-full' : 'h-20 w-full'} />
    </div>
  );
}

function ErrorText({ error }: { error: Error }) {
  return (
    <>
      <Separator className="my-3" />
      <p className="text-sm text-destructive">{error.message}</p>
    </>
  );
}

function refetchLocalLibraryQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['downloads'] }),
    queryClient.invalidateQueries({ queryKey: ['library'] }),
    queryClient.invalidateQueries({ queryKey: ['playback', 'continue-watching'] }),
  ]);
}

function createPlaybackProgressRequest({
  anime,
  completed,
  durationSeconds,
  episode,
  file,
  positionSeconds,
  routeEpisodeNumber,
}: {
  anime: AnimeMetadataDetails;
  completed: boolean;
  durationSeconds?: number;
  episode: EpisodeSummary | undefined;
  file: LocalMediaFile;
  positionSeconds: number;
  routeEpisodeNumber?: string;
}): SavePlaybackProgressRequest {
  return {
    completed,
    durationSeconds,
    episodeNumber:
      normalizeEpisodeNumber(file.episodeNumber) ??
      normalizeEpisodeNumber(episode?.number) ??
      normalizeEpisodeNumber(routeEpisodeNumber) ??
      file.episodeNumber ??
      episode?.number ??
      routeEpisodeNumber,
    episodeTitle: file.episodeTitle ?? episode?.title,
    episodeUrl: episode?.url,
    localMediaFileId: file.id,
    mediaTitle: file.displayTitle ?? file.sourceMediaTitle ?? anime.displayTitle,
    metadataId: file.metadataId ?? anime.id,
    metadataProvider: file.metadataProvider ?? anime.metadataProvider,
    positionSeconds: Math.max(0, positionSeconds),
    sourceMediaUrl: file.sourceMediaUrl,
    sourceProvider: file.sourceProvider ?? episode?.sourceProvider,
  };
}

function findLocalFileForProgress(
  progress: PlaybackProgress,
  fileById: Map<string, LocalMediaFile>,
) {
  if (!progress.localMediaFileId) {
    return undefined;
  }

  return fileById.get(progress.localMediaFileId);
}

function getPlaybackProgressPercent(progress: PlaybackProgress) {
  if (!progress.durationSeconds || progress.durationSeconds <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, (progress.positionSeconds / progress.durationSeconds) * 100),
  );
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function compareStreamingOptions(first: StreamingOption, second: StreamingOption) {
  const embeddableRank =
    Number(first.embeddable === false) - Number(second.embeddable === false);

  if (embeddableRank !== 0) {
    return embeddableRank;
  }

  return (
    getStreamingHostRank(first) - getStreamingHostRank(second) ||
    first.providerLabel.localeCompare(second.providerLabel)
  );
}

function getStreamingHostRank(option: StreamingOption) {
  const label = `${option.hostProvider} ${option.providerLabel}`.toLowerCase();

  if (label.includes('videa')) {
    return 0;
  }

  if (label.includes('streamwish') && label.includes('fhd')) {
    return 1;
  }

  if (label.includes('streamwish')) {
    return 2;
  }

  if (label.includes('dailymotion')) {
    return 3;
  }

  if (label.includes('mp4upload')) {
    return 4;
  }

  if (label.includes('yonaplay')) {
    return 99;
  }

  return 10;
}

function getDownloadSupport(option: DownloadOption) {
  const provider = option.hostProvider.toLowerCase().trim();

  if (
    [
      'gofile',
      'google drive',
      'google-drive',
      'mediafire',
      'mega',
      'mp4upload',
      'workupload',
    ].includes(provider)
  ) {
    return {
      supported: true,
      label: 'Supported',
    };
  }

  return {
    supported: false,
    label: 'Needs resolver',
  };
}

function isActiveDownloadStatus(status: DownloadJob['status']) {
  return ['queued', 'resolving', 'downloading', 'paused'].includes(status);
}

function getDownloadProgressPercent(job: DownloadJob) {
  if (!job.totalBytes) {
    return job.status === 'completed' ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (job.progressBytes / job.totalBytes) * 100));
}

function formatDownloadEngine(job: DownloadJob) {
  if (job.engine === 'local-segmented') {
    return 'Local segmented';
  }

  if (job.engine === 'local-http') {
    return 'Local HTTP';
  }

  if (job.engine === 'local-mega') {
    return 'Local Mega';
  }

  return undefined;
}

function createDownloadMediaContext(
  anime: AnimeMetadataDetails | undefined,
  media: MediaSearchResult | undefined,
  episode: EpisodeSummary | undefined,
): DownloadMediaContext | undefined {
  if (!anime && !media && !episode) {
    return undefined;
  }

  return {
    bannerImageUrl: anime?.bannerImage,
    coverImageUrl:
      anime?.coverImage?.extraLarge ??
      anime?.coverImage?.large ??
      anime?.coverImage?.medium,
    displayTitle: anime?.displayTitle ?? media?.title ?? episode?.mediaTitle,
    episodeNumber: episode?.number,
    episodeTitle: episode?.title,
    metadataId: anime?.id,
    metadataProvider: anime?.metadataProvider,
    sourceMediaTitle: media?.title ?? episode?.mediaTitle,
    sourceMediaUrl: media?.url,
    sourceProvider: media?.sourceProvider ?? episode?.sourceProvider,
    sourceSearchTitle: anime?.sourceSearchTitle,
  };
}

function formatHostProvider(provider: string) {
  switch (provider.toLowerCase().trim()) {
    case 'mediafire':
      return 'MediaFire';
    case 'google drive':
    case 'google-drive':
      return 'Google Drive';
    case 'mp4upload':
      return 'mp4upload';
    case 'gofile':
      return 'Gofile';
    case 'mega':
      return 'Mega';
    case 'workupload':
      return 'Workupload';
    default:
      return formatToken(provider) ?? provider;
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function hasDetails(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
): anime is AnimeMetadataDetails {
  return 'characters' in anime;
}

function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none';
}

function formatToken(value?: string) {
  return value
    ?.toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getAnimeMetadataLine(anime: AnimeMetadataSearchResult | AnimeMetadataDetails) {
  return [
    formatStatusWithAiringDay(anime),
    formatSeasonYear(anime),
    isSingleEpisodeMovie(anime) ? undefined : formatEpisodeCount(anime.episodes),
    formatMediaFormat(anime.format),
  ]
    .filter(Boolean)
    .join(' | ');
}

function formatStatusWithAiringDay(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  const status = formatToken(anime.status);

  if (!status) {
    return undefined;
  }

  const airingDay =
    hasDetails(anime) && anime.status?.toUpperCase() === 'RELEASING'
      ? formatAiringDay(anime.nextAiringEpisode?.airingAt)
      : undefined;

  return airingDay ? `${status} (${airingDay})` : status;
}

function formatAiringDay(airingAt?: string) {
  if (!airingAt) {
    return undefined;
  }

  const date = new Date(airingAt);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatSeasonYear(anime: AnimeMetadataSearchResult | AnimeMetadataDetails) {
  return [formatToken(anime.season), anime.seasonYear].filter(Boolean).join(' ');
}

function formatEpisodeCount(episodes?: number) {
  if (!episodes) {
    return undefined;
  }

  return `${episodes} ${episodes === 1 ? 'Episode' : 'Episodes'}`;
}

function isSingleEpisodeMovie(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  return anime.format?.toUpperCase() === 'MOVIE' && (anime.episodes ?? 0) <= 1;
}

function formatMediaFormat(format?: string) {
  switch (format?.toUpperCase()) {
    case 'TV':
    case 'TV_SHORT':
      return 'Series';
    case 'MOVIE':
      return 'Movie';
    case 'SPECIAL':
      return 'Special';
    case 'OVA':
    case 'ONA':
      return format.toUpperCase();
    default:
      return formatToken(format);
  }
}

function formatScore(details: AnimeMetadataDetails) {
  const score = details.averageScore ?? details.meanScore;

  return score ? `${score}%` : undefined;
}

function getCombinedTags(details: AnimeMetadataDetails) {
  return Array.from(
    new Set([
      ...details.genres,
      ...details.tags.filter((tag) => !tag.spoiler).map((tag) => tag.name),
    ]),
  );
}

function formatDate(date?: { year?: number; month?: number; day?: number }) {
  if (!date?.year) {
    return undefined;
  }

  return [date.year, date.month, date.day].filter(Boolean).join('-');
}

function formatEpisodeTitle(episode: EpisodeSummary) {
  const episodeNumber =
    normalizeEpisodeNumber(episode.number) ?? normalizeEpisodeNumber(episode.title);

  return episodeNumber ? `Episode ${episodeNumber}` : episode.title;
}

function getEpisodeSubtitle(episode: EpisodeSummary) {
  const episodeNumber = normalizeEpisodeNumber(episode.number);

  return getEpisodeSubtitleFromText(episode.title, episodeNumber);
}

function getEpisodeSubtitleFromText(title: string | undefined, episodeNumber?: string) {
  const trimmedTitle = title?.trim();

  if (!trimmedTitle || /[\u0600-\u06FF]/.test(trimmedTitle)) {
    return undefined;
  }

  const titleEpisodeNumber = normalizeEpisodeNumber(trimmedTitle);

  if (titleEpisodeNumber && episodeNumber && titleEpisodeNumber === episodeNumber) {
    return undefined;
  }

  return trimmedTitle;
}

function getEpisodeDrawerItems(
  episodes: EpisodeSummary[],
  currentEpisode: EpisodeSummary | undefined,
  routeEpisodeNumber?: string,
) {
  const currentIndex = episodes.findIndex((episode) =>
    isSameEpisode(episode, currentEpisode, routeEpisodeNumber),
  );

  if (currentIndex <= 0) {
    return episodes;
  }

  return [
    ...episodes.slice(currentIndex),
    ...episodes.slice(0, currentIndex),
  ];
}

function isSameEpisode(
  episode: EpisodeSummary,
  currentEpisode: EpisodeSummary | undefined,
  routeEpisodeNumber?: string,
) {
  if (currentEpisode?.url && episode.url === currentEpisode.url) {
    return true;
  }

  const episodeNumber =
    normalizeEpisodeNumber(episode.number) ?? normalizeEpisodeNumber(episode.title);
  const currentEpisodeNumber =
    normalizeEpisodeNumber(currentEpisode?.number) ??
    normalizeEpisodeNumber(currentEpisode?.title) ??
    normalizeEpisodeNumber(routeEpisodeNumber);

  return Boolean(
    episodeNumber &&
      currentEpisodeNumber &&
      episodeNumber === currentEpisodeNumber,
  );
}

function getDownloadQualityGroups(downloadOptions: DownloadOption[]) {
  const groups = new Map<DownloadOption['quality'], DownloadQualityGroup>();

  for (const option of downloadOptions) {
    const group = groups.get(option.quality);

    if (group) {
      group.options.push(option);
      continue;
    }

    groups.set(option.quality, {
      label: getDownloadQualityLabel(option.quality),
      options: [option],
      quality: option.quality,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      options: group.options.toSorted(
        (first, second) =>
          formatHostProvider(first.hostProvider).localeCompare(
            formatHostProvider(second.hostProvider),
          ) || first.providerUrl.localeCompare(second.providerUrl),
      ),
    }))
    .toSorted(
      (first, second) =>
        getQualitySortRank(first.quality) - getQualitySortRank(second.quality) ||
        first.label.localeCompare(second.label),
    );
}

function getDownloadQualityLabel(quality: DownloadOption['quality']) {
  switch (quality.toUpperCase()) {
    case 'FHD':
      return 'FHD - 1080p';
    case 'HD':
      return 'HD - 720p';
    case 'SD':
      return 'SD - 480p';
    default:
      return formatToken(quality) ?? quality;
  }
}

function formatDownloadEpisodeReference(
  episode: EpisodeSummary | undefined,
  routeEpisodeNumber?: string,
) {
  const episodeNumber =
    normalizeEpisodeNumber(episode?.number) ??
    normalizeEpisodeNumber(episode?.title) ??
    normalizeEpisodeNumber(routeEpisodeNumber);

  return episodeNumber ? `Episode ${episodeNumber}` : 'Episode';
}

function getProviderFaviconUrl(providerUrl: string) {
  try {
    const hostname = new URL(providerUrl).hostname;

    if (!hostname) {
      return undefined;
    }

    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return undefined;
  }
}

function getLocalFilesForEpisode({
  animeId,
  episode,
  episodeNumber,
  files,
}: {
  animeId?: number;
  episode?: EpisodeSummary;
  episodeNumber?: string;
  files: LocalMediaFile[];
}) {
  const targetEpisodeNumber =
    normalizeEpisodeNumber(episodeNumber) ??
    normalizeEpisodeNumber(episode?.number) ??
    normalizeEpisodeNumber(episode?.title);

  if (!targetEpisodeNumber) {
    return [];
  }

  return files
    .filter((file) => {
      if (animeId && file.metadataId && file.metadataId !== animeId) {
        return false;
      }

      const fileEpisodeNumber =
        normalizeEpisodeNumber(file.episodeNumber) ??
        normalizeEpisodeNumber(file.episodeTitle);

      if (fileEpisodeNumber !== targetEpisodeNumber) {
        return false;
      }

      if (!episode) {
        return true;
      }

      if (file.sourceProvider && file.sourceProvider !== episode.sourceProvider) {
        return false;
      }

      return true;
    })
    .toSorted(compareLocalMediaFiles);
}

function compareLocalMediaFiles(first: LocalMediaFile, second: LocalMediaFile) {
  const firstEpisode = Number(
    normalizeEpisodeNumber(first.episodeNumber) ??
      normalizeEpisodeNumber(first.episodeTitle) ??
      0,
  );
  const secondEpisode = Number(
    normalizeEpisodeNumber(second.episodeNumber) ??
      normalizeEpisodeNumber(second.episodeTitle) ??
      0,
  );

  if (firstEpisode !== secondEpisode) {
    return firstEpisode - secondEpisode;
  }

  return (
    getQualitySortRank(first.quality) - getQualitySortRank(second.quality) ||
    first.filename.localeCompare(second.filename)
  );
}

function getQualitySortRank(quality: string) {
  switch (quality.toUpperCase()) {
    case 'FHD':
      return 0;
    case 'HD':
      return 1;
    case 'SD':
      return 2;
    default:
      return 3;
  }
}

function normalizeEpisodeNumber(value?: string) {
  const normalized = value
    ?.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

  return normalized?.match(/\d+(?:\.\d+)?/)?.[0];
}

function toAnimeSlug(
  anime: Pick<AnimeMetadataSearchResult, 'displayTitle' | 'sourceSearchTitle' | 'title'>,
) {
  const title = anime.sourceSearchTitle || anime.title.romaji || anime.displayTitle;
  return slugFromTitle(title);
}

function slugFromTitle(title: string) {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'anime';
}

export default App;
