import { useMemo } from "react";
import { ChevronDown, Play } from "lucide-react";
import type {
  AnimeAiringEpisode,
  AnimeMetadataSearchResult,
  LocalMediaFile,
  PlaybackProgress,
} from "@elysium/shared";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimeSearchResultCard } from "@/routes/search/anime/-search-page-components";
import {
  ErrorText,
  findLocalFileForProgress,
  formatAiringEpisodeDate,
  formatDuration,
  formatMediaFormat,
  getPlaybackProgressPercent,
  hideBrokenImage,
} from "@/lib/media-ui";
import { cn } from "@/lib/utils";

export function HomePage({
  afterContinueWatching,
  continueWatching,
  files,
  newPopular,
  newPopularError,
  newPopularLoading,
  continueWatchingLoading,
  onAnimeSelect,
  onContinueWatchingOpen,
  onNewPopularOpen,
  onResume,
}: {
  afterContinueWatching?: ReactNode;
  continueWatching: PlaybackProgress[];
  files: LocalMediaFile[];
  newPopular: AnimeMetadataSearchResult[];
  newPopularError: Error | null;
  newPopularLoading: boolean;
  continueWatchingLoading: boolean;
  onAnimeSelect: (item: AnimeMetadataSearchResult) => void;
  onContinueWatchingOpen?: () => void;
  onNewPopularOpen?: () => void;
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
        onOpen={onContinueWatchingOpen}
        onResume={onResume}
      />
      {afterContinueWatching}
      <HomeNewPopularSection
        error={newPopularError}
        items={newPopular}
        loading={newPopularLoading}
        onOpen={onNewPopularOpen}
        onSelect={onAnimeSelect}
      />
    </div>
  );
}

export function CurrentlyWatchingPage({
  files,
  items,
  loading,
  onResume,
}: {
  files: LocalMediaFile[];
  items: PlaybackProgress[];
  loading: boolean;
  onResume: (progress: PlaybackProgress) => void;
}) {
  const fileById = useMemo(() => {
    const map = new Map<string, LocalMediaFile>();

    for (const file of files) {
      map.set(file.id, file);
    }

    return map;
  }, [files]);
  const visibleItems = items.filter((item) => !item.completed);

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-semibold">Currently Watching</h1>
      {loading && !visibleItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-52 rounded-lg" key={index} />
          ))}
        </div>
      ) : null}
      {visibleItems.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((progress) => (
            <HomeContinueWatchingCard
              className="w-full"
              file={findLocalFileForProgress(progress, fileById)}
              key={progress.id}
              progress={progress}
              onResume={onResume}
            />
          ))}
        </div>
      ) : null}
      {!loading && !visibleItems.length ? (
        <p className="text-sm text-muted-foreground">
          Partially watched episodes will appear here after local playback
          starts.
        </p>
      ) : null}
    </section>
  );
}

export function HomeSectionTitle({
  title,
  onOpen,
}: {
  title: string;
  onOpen?: () => void;
}) {
  if (onOpen) {
    return (
      <Button
        className="-ml-3 h-auto gap-2 px-3 py-1 text-lg font-semibold"
        type="button"
        variant="ghost"
        onClick={onOpen}
      >
        {title}
        <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ChevronDown className="size-4 -rotate-90 text-muted-foreground" />
    </div>
  );
}

export function HomeContinueWatchingSection({
  fileById,
  items,
  loading,
  onOpen,
  onResume,
}: {
  fileById: Map<string, LocalMediaFile>;
  items: PlaybackProgress[];
  loading: boolean;
  onOpen?: () => void;
  onResume: (progress: PlaybackProgress) => void;
}) {
  return (
    <section className="space-y-4">
      <HomeSectionTitle title="Continue Watching" onOpen={onOpen} />
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
          Partially watched episodes will appear here after local playback
          starts.
        </p>
      ) : null}
    </section>
  );
}

export function HomeContinueWatchingCard({
  className,
  file,
  progress,
  onResume,
}: {
  className?: string;
  file: LocalMediaFile | undefined;
  progress: PlaybackProgress;
  onResume: (progress: PlaybackProgress) => void;
}) {
  const percent = getPlaybackProgressPercent(progress);
  const title =
    file?.displayTitle ??
    file?.sourceMediaTitle ??
    progress.mediaTitle ??
    "Local episode";
  const episodeNumber = file?.episodeNumber ?? progress.episodeNumber;
  const imageUrl = file?.bannerImageUrl ?? file?.coverImageUrl;
  const coverUrl = file?.coverImageUrl ?? file?.bannerImageUrl;
  const disabled = !file?.metadataId && !progress.metadataId;

  return (
    <article
      className={cn(
        "group/continue relative h-52 w-[min(82vw,30rem)] shrink-0 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
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
                : (progress.episodeTitle ?? file?.filename ?? "Episode")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {formatDuration(progress.positionSeconds)}
            {progress.durationSeconds
              ? ` / ${formatDuration(progress.durationSeconds)}`
              : ""}
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

export function AnimeAiringEpisodeSection({
  emptyText,
  error,
  fetchingNextPage,
  hasNextPage,
  items,
  loading,
  title,
  onAnimeSelect,
  onLoadMore,
}: {
  emptyText: string;
  error: Error | null;
  fetchingNextPage: boolean;
  hasNextPage: boolean;
  items: AnimeAiringEpisode[];
  loading: boolean;
  title: string;
  onAnimeSelect: (item: AnimeMetadataSearchResult) => void;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-4">
      <HomeSectionTitle title={title} />
      {loading && !items.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-28 rounded-lg" key={index} />
          ))}
        </div>
      ) : null}
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <AnimeAiringEpisodeCard
              item={item}
              key={item.id}
              onAnimeSelect={onAnimeSelect}
            />
          ))}
        </div>
      ) : null}
      {!loading && !items.length ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}
      {hasNextPage ? (
        <Button
          disabled={fetchingNextPage}
          type="button"
          variant="secondary"
          onClick={onLoadMore}
        >
          {fetchingNextPage ? "Loading" : "Load more"}
        </Button>
      ) : null}
      {error ? <ErrorText error={error} /> : null}
    </section>
  );
}

export function AnimeAiringEpisodeCard({
  item,
  onAnimeSelect,
}: {
  item: AnimeAiringEpisode;
  onAnimeSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  const coverUrl =
    item.anime.coverImage?.large ??
    item.anime.coverImage?.medium ??
    item.anime.coverImage?.extraLarge;

  return (
    <button
      className="flex min-w-0 gap-3 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={() => onAnimeSelect(item.anime)}
    >
      <span className="block aspect-[2/3] h-24 shrink-0 overflow-hidden rounded-md bg-muted">
        {coverUrl ? (
          <img
            alt={`${item.anime.displayTitle} cover`}
            className="h-full w-full object-cover"
            src={coverUrl}
            onError={hideBrokenImage}
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <span className="space-y-1">
          <span className="line-clamp-2 text-sm font-medium leading-snug">
            {item.anime.displayTitle}
          </span>
          <span className="block text-sm text-muted-foreground">
            Episode {item.episode}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">
            {formatAiringEpisodeDate(item.airingAt)}
          </Badge>
          {item.anime.format ? (
            <span>{formatMediaFormat(item.anime.format)}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

export function HomeNewPopularSection({
  error,
  items,
  loading,
  onOpen,
  onSelect,
}: {
  error: Error | null;
  items: AnimeMetadataSearchResult[];
  loading: boolean;
  onOpen?: () => void;
  onSelect: (item: AnimeMetadataSearchResult) => void;
}) {
  return (
    <section className="space-y-4">
      <HomeSectionTitle title="New & Popular" onOpen={onOpen} />
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
