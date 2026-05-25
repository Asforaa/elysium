import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EpisodeSummary, MediaSearchResult } from '@elysium/shared';
import { getDownloadOptions, getEpisodes, listProviders, searchMedia } from '@/lib/api';
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

const EMPTY_SEARCH_RESULTS: MediaSearchResult[] = [];
const EMPTY_EPISODES: EpisodeSummary[] = [];

function App() {
  const [draftQuery, setDraftQuery] = useState('Akane-banashi');
  const [submittedQuery, setSubmittedQuery] = useState('Akane-banashi');
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [selectedEpisodeUrl, setSelectedEpisodeUrl] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ['providers'],
    queryFn: listProviders,
  });

  const searchQuery = useQuery({
    queryKey: ['search', submittedQuery],
    queryFn: () => searchMedia(submittedQuery),
    enabled: Boolean(submittedQuery),
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

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = draftQuery.trim();

    if (!nextQuery) {
      return;
    }

    setSubmittedQuery(nextQuery);
    setSelectedMediaUrl(null);
    setSelectedEpisodeUrl(null);
  }

  return (
    <main className="min-h-svh bg-background p-4 text-foreground md:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Elysium</h1>
            <Badge variant="secondary">Private media center</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Search source providers, inspect episodes, and review available public download
            providers.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Source Search</CardTitle>
            <CardDescription>Current adapter: WitAnime</CardDescription>
            <CardAction>
              <Badge variant={providersQuery.isSuccess ? 'outline' : 'secondary'}>
                {providersQuery.data?.length ?? 0} provider
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSearch}>
              <Input
                aria-label="Search media"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Search anime"
              />
              <Button type="submit" disabled={searchQuery.isFetching}>
                {searchQuery.isFetching ? 'Searching' : 'Search'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>{searchResults.length} media item found</CardDescription>
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
                {selectedMedia ? selectedMedia.title : 'Select a media item'}
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
    </main>
  );
}

function MediaResult({
  item,
  selected,
  onSelect,
}: {
  item: MediaSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="w-full rounded-lg border p-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {item.posterUrl ? (
          <img
            alt=""
            className="h-20 w-14 rounded-md border object-cover"
            src={item.posterUrl}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{item.title}</h2>
            {selected ? <Badge>Selected</Badge> : null}
            <Badge variant="outline">{item.kind}</Badge>
          </div>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
      </div>
    </button>
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
      <Separator />
      <p className="text-sm text-destructive">{error.message}</p>
    </>
  );
}

export default App;
