import { useEffect, useMemo, useState } from 'react';
import type { ComponentProps, SyntheticEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Clapperboard,
  Clock,
  Download,
  Film,
  Heart,
  Home,
  LogOut,
  Moon,
  Plus,
  Sun,
  Tv,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  AnimeRelation,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  MediaSearchResult,
} from '@elysium/shared';
import {
  getAnimeMetadata,
  getAuthSession,
  getDownloadOptions,
  getEpisodes,
  listDownloadJobs,
  searchAnimeMetadata,
  searchMedia,
  startDownload,
  loginUser,
  logoutUser,
  signupUser,
} from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const EMPTY_ANIME_RESULTS: AnimeMetadataSearchResult[] = [];
const EMPTY_SEARCH_RESULTS: MediaSearchResult[] = [];
const EMPTY_EPISODES: EpisodeSummary[] = [];
const EMPTY_DOWNLOAD_JOBS: DownloadJob[] = [];
const DEFAULT_ANIME_QUERY = 'Akane-banashi';
const MAIN_NAV_ITEMS: SidebarNavItem[] = [
  { title: 'Home', icon: Home },
  { title: 'Anime', icon: Clapperboard },
  { title: 'TV Shows', icon: Tv },
  { title: 'Movies', icon: Film },
  { title: 'My List', icon: Plus },
];
const LIBRARY_NAV_ITEMS: SidebarNavItem[] = [
  { title: 'Favourites', icon: Heart },
  { title: 'Watch Later', icon: Clock },
  { title: 'Downloads', icon: Download },
  { title: 'My Account', icon: User },
];

type SidebarNavItem = {
  icon: LucideIcon;
  title: string;
};

type FocusedImage = {
  alt: string;
  src: string;
};

function App({
  routeAnimeId,
  routeAnimeSlug,
}: {
  routeAnimeId?: number;
  routeAnimeSlug?: string;
}) {
  const navigate = useNavigate();
  const [animeQuery, setAnimeQuery] = useState(
    routeAnimeSlug ? humanizeAnimeSlug(routeAnimeSlug) : DEFAULT_ANIME_QUERY,
  );
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = useState<string | null>(null);
  const [focusedImage, setFocusedImage] = useState<FocusedImage | null>(null);
  const selectedAnimeId = Number.isFinite(routeAnimeId) ? routeAnimeId : undefined;

  const animeSearchQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'search', animeQuery.trim()],
    queryFn: () => searchAnimeMetadata(animeQuery.trim()),
    enabled: animeQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const animeResults = animeSearchQuery.data ?? EMPTY_ANIME_RESULTS;
  const previewAnime =
    animeResults.find((anime) => anime.id === selectedAnimeId) ?? animeResults[0];
  const activeAnimeId = selectedAnimeId ?? previewAnime?.id;

  const animeDetailsQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'anime', activeAnimeId],
    queryFn: () => getAnimeMetadata(activeAnimeId ?? 0),
    enabled: Boolean(activeAnimeId),
    staleTime: 5 * 60_000,
  });

  const animeDetails = animeDetailsQuery.data ?? previewAnime;
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
  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.url === selectedEpisodeUrl) ?? episodes.at(-1),
    [episodes, selectedEpisodeUrl],
  );

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
  const episodesLoading = searchQuery.isLoading || episodesQuery.isLoading;
  const downloadJobsQuery = useQuery({
    queryKey: ['downloads'],
    queryFn: listDownloadJobs,
    refetchInterval: 1_000,
  });
  const downloadJobs = downloadJobsQuery.data ?? EMPTY_DOWNLOAD_JOBS;
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
    mutationFn: startDownload,
    onSuccess: () => {
      void downloadJobsQuery.refetch();
    },
  });

  function handleAnimeQueryChange(value: string) {
    setAnimeQuery(value);
  }

  function handleAnimeSelect(item: AnimeMetadataSearchResult) {
    setAnimeQuery(item.displayTitle);
    setSelectedEpisodeUrl(null);
    void navigate({
      params: {
        animeId: String(item.id),
        slug: toAnimeSlug(item),
      },
      to: '/anime/$animeId/$slug',
    });
  }

  function handleDownload(option: DownloadOption) {
    startDownloadMutation.mutate(option);
  }

  return (
    <SidebarProvider>
      <ElysiumSidebar
        activeItem={selectedAnimeId ? 'Anime' : 'Home'}
        onHomeSelect={() => {
          void navigate({ to: '/' });
        }}
      />
      <SidebarInset className="min-h-svh bg-background text-foreground">
        <div className="p-4 md:p-8">
          <div className="flex w-full flex-col gap-4">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <SidebarTrigger className="-ml-2 md:hidden" />
              </div>
              <AccountControls />
            </header>

            <Card>
              <CardHeader>
                <CardTitle>AniList Search</CardTitle>
                <CardDescription>Autocomplete is the source of truth for anime metadata.</CardDescription>
              </CardHeader>
              <CardContent>
                <AnimeAutocomplete
                  query={animeQuery}
                  results={animeResults}
                  loading={animeSearchQuery.isFetching}
                  selectedId={selectedAnimeId}
                  onQueryChange={handleAnimeQueryChange}
                  onSelect={handleAnimeSelect}
                  onImageFocus={setFocusedImage}
                />
                {animeSearchQuery.isError ? <ErrorText error={animeSearchQuery.error} /> : null}
              </CardContent>
            </Card>

            {animeDetails ? (
              <AnimeDetailPanel
                anime={animeDetails}
                loading={animeDetailsQuery.isFetching}
                onImageFocus={setFocusedImage}
              />
            ) : null}

            {animeDetails ? (
              <RelatedAnimeSection
                relations={animeRelations}
                selectedAnimeId={selectedAnimeId}
                onAnimeSelect={handleAnimeSelect}
              />
            ) : null}

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
                        onSelect={() => setSelectedEpisodeUrl(episode.url)}
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

            <Card>
              <CardHeader>
                <CardTitle>Download Options</CardTitle>
                <CardDescription>
                  {selectedEpisode
                    ? `${selectedEpisode.mediaTitle} ${formatEpisodeTitle(selectedEpisode)}`
                    : 'Select an episode'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {downloadOptionsQuery.isLoading ? (
                  <ResultSkeleton />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quality</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Source URL</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {downloadOptions.map((option) => {
                        const job = downloadJobByUrl.get(option.providerUrl);
                        const support = getDownloadSupport(option);
                        const active = job ? isActiveDownloadStatus(job.status) : false;

                        return (
                          <TableRow key={`${option.quality}-${option.hostProvider}-${option.providerUrl}`}>
                            <TableCell>
                              <Badge variant="outline">{option.quality}</Badge>
                            </TableCell>
                            <TableCell>{formatHostProvider(option.hostProvider)}</TableCell>
                            <TableCell>
                              {job ? (
                                <JobStatusBadge job={job} />
                              ) : (
                                <Badge variant={support.supported ? 'secondary' : 'outline'}>
                                  {support.label}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[18rem] truncate font-mono text-xs">
                              {option.providerUrl}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                disabled={
                                  !support.supported ||
                                  active ||
                                  startDownloadMutation.isPending
                                }
                                size="sm"
                                type="button"
                                variant={job?.status === 'completed' ? 'outline' : 'default'}
                                onClick={() => handleDownload(option)}
                              >
                                <Download />
                                {getDownloadButtonLabel(job, support.supported)}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {downloadOptionsQuery.isError ? <ErrorText error={downloadOptionsQuery.error} /> : null}
                {startDownloadMutation.isError ? (
                  <ErrorText error={startDownloadMutation.error} />
                ) : null}
              </CardContent>
            </Card>

            <DownloadQueue jobs={downloadJobs} loading={downloadJobsQuery.isFetching} />
          </div>
        </div>
        {focusedImage ? (
          <ImageLightbox image={focusedImage} onClose={() => setFocusedImage(null)} />
        ) : null}
      </SidebarInset>
    </SidebarProvider>
  );
}

function ElysiumSidebar({
  activeItem,
  onHomeSelect,
}: {
  activeItem: string;
  onHomeSelect: () => void;
}) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex h-9 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            E
          </div>
          <span className="truncate text-base font-semibold group-data-[collapsible=icon]:hidden">
            Elysium
          </span>
          <SidebarTrigger className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent className="py-3">
        <SidebarNavSection
          activeItem={activeItem}
          items={MAIN_NAV_ITEMS}
          label="Home"
          onHomeSelect={onHomeSelect}
        />
        <SidebarNavSection
          activeItem={activeItem}
          items={LIBRARY_NAV_ITEMS}
          label="Library"
          onHomeSelect={onHomeSelect}
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
  onHomeSelect,
}: {
  activeItem: string;
  items: SidebarNavItem[];
  label: string;
  onHomeSelect: () => void;
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
                  onClick={item.title === 'Home' ? onHomeSelect : undefined}
                >
                  <Icon />
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
  const authSessionQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getAuthSession,
    staleTime: 30_000,
  });
  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: () => {
      void authSessionQuery.refetch();
    },
  });
  const signupMutation = useMutation({
    mutationFn: signupUser,
    onSuccess: () => {
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
    logoutMutation.isPending;

  if (!user) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          disabled={busy}
          type="button"
          variant="outline"
          onClick={() => loginMutation.mutate()}
        >
          Login
        </Button>
        <Button
          disabled={busy}
          type="button"
          onClick={() => signupMutation.mutate()}
        >
          Sign up
        </Button>
      </div>
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

function AnimeAutocomplete({
  query,
  results,
  loading,
  selectedId,
  onQueryChange,
  onSelect,
  onImageFocus,
}: {
  query: string;
  results: AnimeMetadataSearchResult[];
  loading: boolean;
  selectedId?: number;
  onQueryChange: (value: string) => void;
  onSelect: (item: AnimeMetadataSearchResult) => void;
  onImageFocus: (image: FocusedImage) => void;
}) {
  return (
    <div className="space-y-2">
      <Input
        aria-label="Search AniList"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search anime on AniList"
      />
      <div className="max-h-72 overflow-auto rounded-xl border">
        {loading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          results.map((item) => (
            <div
              className="flex w-full items-center gap-3 border-b p-3 text-left last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={item.id}
            >
              {item.coverImage?.medium ? (
                <FocusableImage
                  alt={`${item.displayTitle} cover`}
                  buttonClassName="h-14 w-10"
                  imageClassName="h-14 w-10 rounded-md border object-cover"
                  src={item.coverImage.medium}
                  onFocusImage={onImageFocus}
                />
              ) : null}
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={() => onSelect(item)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.displayTitle}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {item.title.english ?? item.title.romaji ?? item.displayTitle}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {item.seasonYear ? <Badge variant="outline">{item.seasonYear}</Badge> : null}
                  {selectedId === item.id ? <Badge>Selected</Badge> : null}
                </span>
              </button>
            </div>
          ))
        )}
        {!loading && query.trim().length >= 2 && results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No AniList results found.</p>
        ) : null}
      </div>
    </div>
  );
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
  const metadataLine = getAnimeMetadataLine(anime);

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div className="relative z-0 bg-muted">
        {anime.bannerImage ? (
          <FocusableImage
            alt={`${anime.displayTitle} banner`}
            buttonClassName="block w-full rounded-none"
            imageClassName="h-auto w-full object-contain opacity-80"
            src={anime.bannerImage}
            onFocusImage={onImageFocus}
          />
        ) : null}
      </div>
      <div className="relative z-10 grid gap-4 p-4 md:grid-cols-[12rem_minmax(0,1fr)] md:p-6">
        <div className="relative z-20 md:-mt-24">
          {coverUrl ? (
            <FocusableImage
              alt={`${anime.displayTitle} cover`}
              buttonClassName="block w-36 rounded-lg border bg-muted shadow-sm md:w-48"
              imageClassName="aspect-[2/3] w-full object-cover"
              src={coverUrl}
              onFocusImage={onImageFocus}
            />
          ) : (
            <div className="aspect-[2/3] w-36 rounded-lg border bg-muted md:w-48" />
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
        'overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        buttonClassName,
      )}
      type="button"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }

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

function DownloadQueue({
  jobs,
  loading,
}: {
  jobs: DownloadJob[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Downloads</CardTitle>
        <CardDescription>
          {loading ? 'Refreshing download status' : 'Tracked local download jobs'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobs.length ? (
          jobs.map((job) => <DownloadJobRow job={job} key={job.id} />)
        ) : (
          <p className="text-sm text-muted-foreground">No downloads started yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DownloadJobRow({ job }: { job: DownloadJob }) {
  const percent = getDownloadProgressPercent(job);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {job.filename ?? job.option.episodeTitle ?? job.option.mediaTitle ?? 'Download'}
          </p>
          <p className="text-xs text-muted-foreground">
            {[formatHostProvider(job.option.hostProvider), job.option.quality, formatDownloadEngine(job)]
              .filter(Boolean)
              .join(' | ')}
          </p>
        </div>
        <JobStatusBadge job={job} />
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

function getDownloadButtonLabel(job: DownloadJob | undefined, supported: boolean) {
  if (!supported) {
    return 'Unavailable';
  }

  if (!job) {
    return 'Download';
  }

  if (job.status === 'completed') {
    return 'Done';
  }

  if (job.status === 'failed' || job.status === 'cancelled') {
    return 'Retry';
  }

  return 'Running';
}

function getDownloadProgressPercent(job: DownloadJob) {
  if (!job.totalBytes) {
    return job.status === 'completed' ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (job.progressBytes / job.totalBytes) * 100));
}

function formatDownloadEngine(job: DownloadJob) {
  if (job.engine === 'gopeed') {
    return 'Gopeed';
  }

  if (job.engine === 'local-fetch') {
    return 'Local fallback';
  }

  return undefined;
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
      return formatToken(provider);
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
    formatEpisodeCount(anime.episodes),
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
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'anime';
}

function humanizeAnimeSlug(slug: string) {
  return decodeURIComponent(slug).replace(/-/g, ' ');
}

export default App;
