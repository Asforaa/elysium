import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentProps,
  MouseEvent,
  PointerEvent,
  SyntheticEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPlayer, selectControls, selectFullscreen } from "@videojs/react";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import { ChevronLeft, Clapperboard } from "lucide-react";
import type {
  AnimeMetadataDetails,
  DownloadJob,
  DownloadOption,
  EpisodeSummary,
  LocalMediaFile,
  StreamingOption,
} from "@elysium/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getLocalMediaStreamUrl,
  getPlaybackProgress,
  savePlaybackProgress,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ErrorText,
  ResultSkeleton,
  compareStreamingOptions,
  createPlaybackProgressRequest,
  formatDownloadEpisodeReference,
  formatDuration,
  formatEpisodeTitle,
  formatHostProvider,
  getDownloadQualityGroups,
  getDownloadQualityLabel,
  getDownloadSupport,
  getEpisodeDrawerItems,
  getEpisodeSubtitle,
  getEpisodeSubtitleFromText,
  getProviderFaviconUrl,
  hideBrokenImage,
  isActiveDownloadStatus,
  isSameEpisode,
  normalizeEpisodeNumber,
} from "@/lib/media-ui";

const ELYSIUM_VIDEO_PLAYER = createPlayer({ features: videoFeatures });
const SEEK_FEEDBACK_SECONDS = 10;
const SEEK_FEEDBACK_TIMEOUT_MS = 650;
const PLAYBACK_FEEDBACK_TIMEOUT_MS = 620;

type VideoElementEventHandler = ComponentProps<"video">["onTimeUpdate"];

type SeekFeedback = {
  direction: "backward" | "forward";
  id: number;
  seconds: number;
};

type SeekHoverPreview = {
  bottomPx: number;
  leftPx: number;
  timeSeconds: number;
};

type PlaybackFeedback = {
  action: "pause" | "play";
  id: number;
};

type PlayerNowPlaying = {
  episodeNumber?: string;
  episodeTitle?: string;
  mediaTitle: string;
};

export function ElysiumVideoPlayer({
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
  const [seekHoverPreview, setSeekHoverPreview] =
    useState<SeekHoverPreview | null>(null);
  const [playbackFeedback, setPlaybackFeedback] =
    useState<PlaybackFeedback | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const seekFeedbackTimeoutRef = useRef<number | undefined>(undefined);
  const seekHoverPreviewFrameRef = useRef<number | undefined>(undefined);
  const pendingSeekHoverPreviewRef = useRef<SeekHoverPreview | null>(null);
  const playbackFeedbackTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (seekFeedbackTimeoutRef.current) {
        window.clearTimeout(seekFeedbackTimeoutRef.current);
      }

      if (playbackFeedbackTimeoutRef.current) {
        window.clearTimeout(playbackFeedbackTimeoutRef.current);
      }

      if (seekHoverPreviewFrameRef.current) {
        window.cancelAnimationFrame(seekHoverPreviewFrameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!seekHoverPreview) {
      return undefined;
    }

    const previewVideo = previewVideoRef.current;

    if (!previewVideo) {
      return undefined;
    }

    const measuredPreviewVideo = previewVideo;
    const targetTime = seekHoverPreview.timeSeconds;

    function seekPreviewVideo() {
      if (!Number.isFinite(targetTime)) {
        return;
      }

      try {
        if (Math.abs(measuredPreviewVideo.currentTime - targetTime) > 0.15) {
          measuredPreviewVideo.currentTime = targetTime;
        }
      } catch {
        // Some browsers reject rapid preview seeks while metadata is settling.
      }
    }

    if (measuredPreviewVideo.readyState >= 1) {
      seekPreviewVideo();
      return undefined;
    }

    measuredPreviewVideo.addEventListener("loadedmetadata", seekPreviewVideo, {
      once: true,
    });

    return () => {
      measuredPreviewVideo.removeEventListener(
        "loadedmetadata",
        seekPreviewVideo,
      );
    };
  }, [seekHoverPreview, src]);

  function showSeekFeedback(direction: SeekFeedback["direction"]) {
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

  function showPlaybackFeedback(action: PlaybackFeedback["action"]) {
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

  function updateSeekHoverPreview(preview: SeekHoverPreview) {
    pendingSeekHoverPreviewRef.current = preview;

    if (seekHoverPreviewFrameRef.current) {
      return;
    }

    seekHoverPreviewFrameRef.current = window.requestAnimationFrame(() => {
      seekHoverPreviewFrameRef.current = undefined;
      setSeekHoverPreview(pendingSeekHoverPreviewRef.current);
    });
  }

  function hideSeekHoverPreview() {
    pendingSeekHoverPreviewRef.current = null;

    if (seekHoverPreviewFrameRef.current) {
      window.cancelAnimationFrame(seekHoverPreviewFrameRef.current);
      seekHoverPreviewFrameRef.current = undefined;
    }

    setSeekHoverPreview(null);
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const seekButton = target.closest<HTMLButtonElement>(
      ".media-button--seek[data-direction]",
    );
    const direction = seekButton?.dataset.direction;

    if (direction === "backward" || direction === "forward") {
      showSeekFeedback(direction);
    }
  }

  function handlePointerMoveCapture(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const slider = target.closest<HTMLElement>(
      ".media-time-controls .media-slider",
    );

    if (!slider) {
      if (seekHoverPreview) {
        hideSeekHoverPreview();
      }

      return;
    }

    const duration = videoRef.current?.duration;

    if (!duration || !Number.isFinite(duration) || duration <= 0) {
      if (seekHoverPreview) {
        hideSeekHoverPreview();
      }

      return;
    }

    const sliderRect = slider.getBoundingClientRect();

    if (sliderRect.width <= 0) {
      return;
    }

    const playerRect = event.currentTarget.getBoundingClientRect();
    const pointerRatio = clamp(
      (event.clientX - sliderRect.left) / sliderRect.width,
      0,
      1,
    );

    updateSeekHoverPreview({
      bottomPx: playerRect.bottom - sliderRect.top + 14,
      leftPx: event.clientX - playerRect.left,
      timeSeconds: duration * pointerRatio,
    });
  }

  function handlePointerLeaveCapture() {
    if (seekHoverPreview) {
      hideSeekHoverPreview();
    }
  }

  function handlePause(event: SyntheticEvent<HTMLVideoElement>) {
    onPause?.(event);

    if (!event.currentTarget.ended) {
      showPlaybackFeedback("pause");
    }
  }

  function handlePlay() {
    showPlaybackFeedback("play");
  }

  return (
    <ELYSIUM_VIDEO_PLAYER.Provider key={src}>
      <div
        className="relative h-full w-full"
        onClickCapture={handleClickCapture}
        onPointerLeave={handlePointerLeaveCapture}
        onPointerMoveCapture={handlePointerMoveCapture}
      >
        <VideoSkin
          className="h-full w-full"
          poster={poster}
          style={
            {
              "--media-border-radius": "0.375rem",
              "--media-video-border-radius": "0.375rem",
            } as ComponentProps<typeof VideoSkin>["style"]
          }
        >
          <Video
            key={src}
            playsInline
            preload="metadata"
            ref={videoRef}
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
          {seekHoverPreview ? (
            <ElysiumSeekHoverPreview
              poster={poster}
              preview={seekHoverPreview}
              previewVideoRef={previewVideoRef}
              src={src}
            />
          ) : null}
          {nowPlaying ? <ElysiumPlayerTopShade /> : null}
          {nowPlaying ? (
            <ElysiumPlayerNowPlaying nowPlaying={nowPlaying} />
          ) : null}
          {seekFeedback ? (
            <ElysiumSeekFeedback feedback={seekFeedback} />
          ) : null}
        </VideoSkin>
      </div>
    </ELYSIUM_VIDEO_PLAYER.Provider>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ElysiumSeekHoverPreview({
  poster,
  preview,
  previewVideoRef,
  src,
}: {
  poster?: string;
  preview: SeekHoverPreview;
  previewVideoRef: { current: HTMLVideoElement | null };
  src: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="elysium-seek-hover-preview"
      style={{
        bottom: `${preview.bottomPx}px`,
        left: `${preview.leftPx}px`,
      }}
    >
      <div className="elysium-seek-hover-preview__frame">
        <video
          muted
          playsInline
          poster={poster}
          preload="metadata"
          ref={previewVideoRef}
          src={src}
        />
      </div>
      <time className="elysium-seek-hover-preview__time">
        {formatDuration(preview.timeSeconds)}
      </time>
    </div>
  );
}

function ElysiumPlayerTopShade() {
  const controls = ELYSIUM_VIDEO_PLAYER.usePlayer(selectControls);
  const fullscreen = ELYSIUM_VIDEO_PLAYER.usePlayer(selectFullscreen);
  const visible = Boolean(fullscreen?.fullscreen && controls?.controlsVisible);

  return (
    <div
      aria-hidden="true"
      className="elysium-player-top-shade"
      data-visible={visible ? "" : undefined}
    />
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
    ? [`Episode ${nowPlaying.episodeNumber}`, nowPlaying.episodeTitle]
        .filter(Boolean)
        .join(": ")
    : undefined;

  function handleExitFullscreen() {
    void fullscreen?.exitFullscreen().catch(() => undefined);
  }

  return (
    <div
      className="elysium-player-now-playing"
      data-visible={visible ? "" : undefined}
    >
      <button
        aria-label="Exit fullscreen"
        className="elysium-player-now-playing__back"
        disabled={!fullscreen?.fullscreen}
        type="button"
        onClick={handleExitFullscreen}
      >
        <ChevronLeft
          aria-hidden="true"
          className="elysium-player-now-playing__icon"
        />
      </button>
      <div className="min-w-0">
        <p className="elysium-player-now-playing__title">
          {nowPlaying.mediaTitle}
        </p>
        {episodeLine ? (
          <p className="elysium-player-now-playing__episode">{episodeLine}</p>
        ) : null}
      </div>
    </div>
  );
}

function ElysiumPlaybackFeedback({ feedback }: { feedback: PlaybackFeedback }) {
  return (
    <div className="elysium-playback-feedback" key={feedback.id}>
      <div className="elysium-playback-feedback__bubble">
        {feedback.action === "pause" ? (
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

export function EpisodeWatchPanel({
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
        queryKey: ["playback", "continue-watching"],
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
    getEpisodeSubtitleFromText(
      selectedLocalFile?.episodeTitle,
      currentEpisodeNumber,
    );
  const episodeTitle = episode
    ? formatEpisodeTitle(episode)
    : routeEpisodeNumber
      ? `Episode ${routeEpisodeNumber}`
      : "Episode";
  const watchTitle = `${anime.displayTitle} - ${episodeTitle}`;
  const playbackProgressQuery = useQuery({
    queryKey: ["playback", "progress", selectedLocalFile?.id],
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
  }, [playableStreams.map((option) => option.embedUrl).join("|")]);

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
    window.addEventListener("resize", updatePlayerHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePlayerHeight);
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
          "grid gap-4",
          episodesPanelOpen && "lg:grid-cols-[minmax(0,1fr)_20rem]",
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
                      file.id === selectedLocalFile.id ? "default" : "outline"
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
                  variant={
                    index === selectedStreamIndex ? "default" : "outline"
                  }
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
                    {option.providerLabel}:{" "}
                    {option.unsupportedReason ?? "Unavailable"}
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

export function EpisodeSidePanel({
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
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "border-primary bg-primary/10 text-primary",
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
          <p className="text-sm text-muted-foreground">
            No episodes found yet.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

export function DownloadOptionsStepper({
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
  const selectedCompleted = selectedJob?.status === "completed";
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
          Download {formatDownloadEpisodeReference(episode, routeEpisodeNumber)}{" "}
          of {anime.displayTitle} locally
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
                      "transition-opacity",
                      selectedQuality && !selected && "opacity-45",
                    )}
                    key={group.quality}
                    type="button"
                    variant={selected ? "default" : "secondary"}
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
                          "justify-start transition-opacity",
                          selected && "ring-2 ring-primary/40",
                          selectedProviderUrl && !selected && "opacity-45",
                        )}
                        disabled={!support.supported}
                        key={`${option.quality}-${option.hostProvider}-${option.providerUrl}`}
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setSuccessMessage(null);
                          setSelectedProviderUrl((current) =>
                            current === option.providerUrl
                              ? null
                              : option.providerUrl,
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

        {downloadOptionsError ? (
          <ErrorText error={downloadOptionsError} />
        ) : null}
        {startError ? <ErrorText error={startError} /> : null}
        {retryError ? <ErrorText error={retryError} /> : null}
      </CardContent>
    </Card>
  );
}

export function ProviderFavicon({ option }: { option: DownloadOption }) {
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
