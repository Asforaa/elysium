import { useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Moon, Sun, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  EpisodeSummary,
  MediaSearchResult,
} from '@elysium/shared';
import {
  getAnimeMetadata,
  getDownloadOptions,
  getEpisodes,
  listProviders,
  searchAnimeMetadata,
  searchMedia,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
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

type FocusedImage = {
  alt: string;
  src: string;
};

function App() {
  const [animeQuery, setAnimeQuery] = useState('Akane-banashi');
  const [selectedAnime, setSelectedAnime] = useState<AnimeMetadataSearchResult | null>(null);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = useState<string | null>(null);
  const [focusedImage, setFocusedImage] = useState<FocusedImage | null>(null);

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  });

  const animeSearchQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'search', animeQuery.trim()],
    queryFn: () => searchAnimeMetadata(animeQuery.trim()),
    enabled: animeQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const animeResults = animeSearchQuery.data ?? EMPTY_ANIME_RESULTS;
  const previewAnime = selectedAnime ?? animeResults[0];
  const sourceSearchTerm = selectedAnime?.sourceSearchTitle ?? '';

  const animeDetailsQuery = useQuery({
    queryKey: ['metadata', 'anilist', 'anime', previewAnime?.id],
    queryFn: () => getAnimeMetadata(previewAnime?.id ?? 0),
    enabled: Boolean(previewAnime?.id),
    staleTime: 5 * 60_000,
  });

  const animeDetails = animeDetailsQuery.data ?? previewAnime;

  const searchQuery = useQuery({
    queryKey: ['search', sourceSearchTerm],
    queryFn: () => searchMedia(sourceSearchTerm),
    enabled: Boolean(sourceSearchTerm),
  });

  const searchResults = searchQuery.data ?? EMPTY_SEARCH_RESULTS;
  const selectedMedia = useMemo(
    () => searchResults.find((item) => item.url === selectedMediaUrl) ?? searchResults[0],
    [searchResults, selectedMediaUrl],
  );

  const episodesQuery = useQuery({
    queryKey: ['episodes', selectedMedia?.url],
    queryFn: () => getEpisodes(selectedMedia?.url ?? ''),
    enabled: Boolean(selectedMedia?.url),
  });

  const episodes = episodesQuery.data ?? EMPTY_EPISODES;
  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.url === selectedEpisodeUrl) ?? episodes.at(-1),
    [episodes, selectedEpisodeUrl],
  );

  const downloadOptionsQuery = useQuery({
    queryKey: ['download-options', selectedEpisode?.url],
    queryFn: () => getDownloadOptions(selectedEpisode?.url ?? ''),
    enabled: Boolean(selectedEpisode?.url),
  });

  const downloadOptions = downloadOptionsQuery.data ?? [];

  function handleAnimeQueryChange(value: string) {
    setAnimeQuery(value);
    setSelectedAnime(null);
    setSelectedMediaUrl(null);
    setSelectedEpisodeUrl(null);
  }

  function handleAnimeSelect(item: AnimeMetadataSearchResult) {
    setAnimeQuery(item.displayTitle);
    setSelectedAnime(item);
    setSelectedMediaUrl(null);
    setSelectedEpisodeUrl(null);
  }

  return (
    <main className="min-h-svh bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Elysium</h1>
              <Badge variant="secondary">Private media center</Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Search AniList for canonical anime metadata, then match the selected title against
              source adapters for public download options.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <Card>
          <CardHeader>
            <CardTitle>AniList Search</CardTitle>
            <CardDescription>Autocomplete is the source of truth for anime metadata.</CardDescription>
            <CardAction>
              <Badge variant={providersQuery.isSuccess ? 'outline' : 'secondary'}>
                {providersQuery.data?.length ?? 0} source provider
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <AnimeAutocomplete
              query={animeQuery}
              results={animeResults}
              loading={animeSearchQuery.isFetching}
              selectedId={selectedAnime?.id}
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

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Source Matches</CardTitle>
              <CardDescription>
                {sourceSearchTerm ? `Searching WitAnime for "${sourceSearchTerm}"` : 'Pick an anime'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {searchQuery.isLoading ? (
                <ResultSkeleton />
              ) : (
                searchResults.map((item) => (
                  <MediaResult
                    item={item}
                    key={item.url}
                    selected={selectedMedia?.url === item.url}
                    onImageFocus={setFocusedImage}
                    onSelect={() => {
                      setSelectedMediaUrl(item.url);
                      setSelectedEpisodeUrl(null);
                    }}
                  />
                ))
              )}
              {searchQuery.isError ? <ErrorText error={searchQuery.error} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Episodes</CardTitle>
              <CardDescription>
                {selectedMedia ? selectedMedia.title : 'Select a source match'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-[28rem] flex-col gap-2 overflow-auto">
              {episodesQuery.isLoading ? (
                <ResultSkeleton compact />
              ) : (
                episodes.map((episode) => (
                  <EpisodeButton
                    episode={episode}
                    key={episode.url}
                    selected={selectedEpisode?.url === episode.url}
                    onSelect={() => setSelectedEpisodeUrl(episode.url)}
                  />
                ))
              )}
              {episodesQuery.isError ? <ErrorText error={episodesQuery.error} /> : null}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Download Options</CardTitle>
            <CardDescription>
              {selectedEpisode
                ? `${selectedEpisode.mediaTitle} ${selectedEpisode.title}`
                : 'Select an episode'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {downloadOptionsQuery.isLoading ? (
              <ResultSkeleton />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quality</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Source URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {downloadOptions.map((option) => (
                    <TableRow key={`${option.quality}-${option.hostProvider}-${option.providerUrl}`}>
                      <TableCell>
                        <Badge variant="outline">{option.quality}</Badge>
                      </TableCell>
                      <TableCell>{option.hostProvider}</TableCell>
                      <TableCell className="max-w-[20rem] truncate font-mono text-xs">
                        {option.providerUrl}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {downloadOptionsQuery.isError ? <ErrorText error={downloadOptionsQuery.error} /> : null}
          </CardContent>
        </Card>
      </div>
      {focusedImage ? (
        <ImageLightbox image={focusedImage} onClose={() => setFocusedImage(null)} />
      ) : null}
    </main>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const nextTheme = isDark ? 'light' : 'dark';
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      className="w-fit"
      type="button"
      variant="outline"
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
                    {[item.title.english, item.title.native].filter(Boolean).join(' / ')}
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

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card text-card-foreground">
      <div className="relative z-0 h-44 bg-muted md:h-56">
        {anime.bannerImage ? (
          <FocusableImage
            alt={`${anime.displayTitle} banner`}
            buttonClassName="absolute inset-0 h-full w-full"
            imageClassName="h-full w-full object-cover opacity-80"
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
            {anime.title.native ? (
              <p className="text-sm text-muted-foreground">{anime.title.native}</p>
            ) : null}
            {anime.description ? (
              <p className="max-w-4xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {anime.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {anime.format ? <Badge variant="outline">{anime.format}</Badge> : null}
            {anime.status ? <Badge variant="outline">{formatToken(anime.status)}</Badge> : null}
            {anime.episodes ? <Badge variant="outline">{anime.episodes} episodes</Badge> : null}
            {anime.durationMinutes ? (
              <Badge variant="outline">{anime.durationMinutes} min</Badge>
            ) : null}
            {anime.seasonYear ? <Badge variant="outline">{anime.seasonYear}</Badge> : null}
            {anime.averageScore ? <Badge variant="outline">{anime.averageScore}% score</Badge> : null}
          </div>

          {anime.genres.length ? (
            <div className="flex flex-wrap gap-2">
              {anime.genres.map((genre) => (
                <Badge key={genre} variant="secondary">
                  {genre}
                </Badge>
              ))}
            </div>
          ) : null}

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
  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Studios" value={details.studios.map((studio) => studio.name).join(', ')} />
        <InfoItem label="Source" value={formatToken(details.source)} />
        <InfoItem label="Start" value={formatDate(details.startDate)} />
        <InfoItem label="AniList" value={details.siteUrl ? `#${details.id}` : undefined} />
      </div>

      {details.tags.length ? (
        <div className="flex flex-wrap gap-2">
          {details.tags.slice(0, 8).map((tag) => (
            <Badge key={tag.name} variant="outline">
              {tag.name}
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

function MediaResult({
  item,
  selected,
  onImageFocus,
  onSelect,
}: {
  item: MediaSearchResult;
  selected: boolean;
  onImageFocus: (image: FocusedImage) => void;
  onSelect: () => void;
}) {
  return (
    <div className="w-full rounded-lg border p-3 text-left hover:bg-accent">
      <div className="flex items-start gap-3">
        {item.posterUrl ? (
          <FocusableImage
            alt={`${item.title} poster`}
            buttonClassName="h-20 w-14"
            imageClassName="h-20 w-14 rounded-md border object-cover"
            src={item.posterUrl}
            onFocusImage={onImageFocus}
          />
        ) : null}
        <button
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
          onClick={onSelect}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{item.title}</h2>
            {selected ? <Badge>Selected</Badge> : null}
            <Badge variant="outline">{item.kind}</Badge>
          </div>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function FocusableImage({
  alt,
  buttonClassName,
  imageClassName,
  onFocusImage,
  src,
}: {
  alt: string;
  buttonClassName?: string;
  imageClassName?: string;
  onFocusImage: (image: FocusedImage) => void;
  src: string;
}) {
  return (
    <button
      className={cn(
        'overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        buttonClassName,
      )}
      type="button"
      onClick={() => onFocusImage({ alt, src })}
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
      <span>{episode.title}</span>
      {selected ? <Badge variant="secondary">Selected</Badge> : null}
    </button>
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

function formatDate(date?: { year?: number; month?: number; day?: number }) {
  if (!date?.year) {
    return undefined;
  }

  return [date.year, date.month, date.day].filter(Boolean).join('-');
}

export default App;
