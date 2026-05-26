import { useEffect, useRef } from "react";
import { Download, RotateCcw, Trash2, X } from "lucide-react";
import type {
  AnimeMetadataSearchResult,
  AnimeTitle,
  DownloadedAnime,
  DownloadJob,
  LocalMediaFile,
} from "@elysium/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { AnimeSearchSkeletonGrid } from "@/routes/search/anime/-search-page-components";
import {
  formatBytes,
  formatDownloadEngine,
  formatHostProvider,
  formatToken,
  getDownloadProgressPercent,
  hideBrokenImage,
  isActiveDownloadStatus,
} from "@/lib/media-ui";

export function DownloadsPage({
  anime,
  fetchingNextPage,
  hasNextPage,
  loading,
  onAnimeSelect,
  onLoadMore,
}: {
  anime: DownloadedAnime[];
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  loading: boolean;
  onAnimeSelect: (item: AnimeMetadataSearchResult) => void;
  onLoadMore: () => void;
}) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || fetchingNextPage || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "480px 0px" },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [fetchingNextPage, hasNextPage, onLoadMore]);

  return (
    <section className="space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-semibold">Downloads</h1>
        <p className="text-sm text-muted-foreground">
          Downloaded anime in the local library.
        </p>
      </div>
      {loading && !anime.length ? <AnimeSearchSkeletonGrid /> : null}
      {anime.length ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {anime.map((item) => (
            <DownloadedAnimeCard
              item={item}
              key={item.key}
              onSelect={onAnimeSelect}
            />
          ))}
        </div>
      ) : null}
      <div ref={loadMoreRef} aria-hidden="true" className="h-8" />
      {fetchingNextPage ? <AnimeSearchSkeletonGrid compact /> : null}
      {!loading && !anime.length ? (
        <p className="text-sm text-muted-foreground">
          Completed downloads will appear here grouped by anime.
        </p>
      ) : null}
    </section>
  );
}

function DownloadedAnimeCard({
  item,
  onSelect,
}: {
  item: DownloadedAnime;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const anime = toAnimeSearchResult(item);
  const coverUrl =
    anime?.coverImage?.extraLarge ??
    anime?.coverImage?.large ??
    anime?.coverImage?.medium ??
    item.coverImageUrl;
  const canOpen = Boolean(anime);

  return (
    <button
      aria-disabled={!canOpen}
      className="group/search-result min-w-0 space-y-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
      disabled={!canOpen}
      type="button"
      onClick={() => {
        if (anime) {
          onSelect(anime);
        }
      }}
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
        <Badge className="absolute left-2 top-2 shadow-sm" variant="secondary">
          {item.files.length}
        </Badge>
      </span>
      <span className="block min-w-0 space-y-1">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {item.displayTitle}
        </span>
        <span className="block text-xs text-muted-foreground">
          {anime?.seasonYear ?? getLatestFileLabel(item)}
        </span>
      </span>
    </button>
  );
}

export function DownloadHistoryDrawer({
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
  const activeCount = jobs.filter((job) =>
    isActiveDownloadStatus(job.status),
  ).length;

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
              {loading
                ? "Refreshing download status"
                : "Tracked local download jobs"}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              aria-label="Close downloads"
              size="icon"
              type="button"
              variant="ghost"
            >
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

function toAnimeSearchResult(
  item: DownloadedAnime,
): AnimeMetadataSearchResult | undefined {
  const details = getCachedMetadataDetails(item.files);

  if (details) {
    return details;
  }

  if (!item.metadataId) {
    return undefined;
  }

  const title: AnimeTitle = {
    romaji: item.sourceSearchTitle ?? item.displayTitle,
    userPreferred: item.displayTitle,
  };

  return {
    metadataProvider: item.metadataProvider ?? "anilist",
    id: item.metadataId,
    title,
    displayTitle: item.displayTitle,
    sourceSearchTitle: item.sourceSearchTitle ?? item.displayTitle,
    coverImage: item.coverImageUrl ? { large: item.coverImageUrl } : undefined,
    bannerImage: item.bannerImageUrl,
    genres: [],
    synonyms: [],
  };
}

function getCachedMetadataDetails(files: LocalMediaFile[]) {
  for (const file of files) {
    const details = (file.mediaContext as Record<string, unknown> | undefined)
      ?.metadataDetails;

    if (isAnimeMetadataSearchResult(details)) {
      return details;
    }
  }

  return undefined;
}

function isAnimeMetadataSearchResult(
  value: unknown,
): value is AnimeMetadataSearchResult {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as AnimeMetadataSearchResult).id === "number" &&
    typeof (value as AnimeMetadataSearchResult).displayTitle === "string",
  );
}

function getLatestFileLabel(item: DownloadedAnime) {
  let latestFile: LocalMediaFile | undefined;

  for (const file of item.files) {
    if (!latestFile || file.updatedAt > latestFile.updatedAt) {
      latestFile = file;
    }
  }

  if (!latestFile) {
    return "Saved locally";
  }

  return latestFile.episodeTitle ?? `Episode ${latestFile.episodeNumber ?? ""}`;
}

export function DownloadJobRow({
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
  const retryable = job.status === "failed" || job.status === "cancelled";
  const active = isActiveDownloadStatus(job.status);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">
            {job.filename ??
              job.option.episodeTitle ??
              job.option.mediaTitle ??
              "Download"}
          </p>
          <p className="text-xs text-muted-foreground">
            {[
              formatHostProvider(job.option.hostProvider),
              job.option.quality,
              formatDownloadEngine(job),
              job.attemptCount > 1 ? `Attempt ${job.attemptCount}` : undefined,
            ]
              .filter(Boolean)
              .join(" | ")}
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
          {job.totalBytes ? ` / ${formatBytes(job.totalBytes)}` : ""}
        </span>
        <span>
          {job.speedBytesPerSecond
            ? `${formatBytes(job.speedBytesPerSecond)}/s`
            : ""}
        </span>
      </div>
      {job.errorMessage ? (
        <p className="text-xs text-muted-foreground">{job.errorMessage}</p>
      ) : null}
      {job.destinationPath && job.status === "completed" ? (
        <p className="truncate font-mono text-xs text-muted-foreground">
          {job.destinationPath}
        </p>
      ) : null}
    </div>
  );
}

export function JobStatusBadge({ job }: { job: DownloadJob }) {
  return (
    <Badge variant={job.status === "failed" ? "destructive" : "secondary"}>
      {formatToken(job.status)}
    </Badge>
  );
}
