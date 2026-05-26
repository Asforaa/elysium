import type { SyntheticEvent } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AnimeMetadataDetails,
  AnimeMetadataSeason,
  AnimeMetadataSearchResult,
  DownloadJob,
  DownloadMediaContext,
  DownloadOption,
  EpisodeSummary,
  LocalMediaFile,
  MediaSearchResult,
  PlaybackProgress,
  SavePlaybackProgressRequest,
  StreamingOption,
} from "@elysium/shared";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DownloadQualityGroup, MediaHomeRoute } from "@/app/types";

export function ResultSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      <Skeleton className={compact ? "h-10 w-full" : "h-20 w-full"} />
      <Skeleton className={compact ? "h-10 w-full" : "h-20 w-full"} />
      <Skeleton className={compact ? "h-10 w-full" : "h-20 w-full"} />
    </div>
  );
}

export function ErrorText({ error }: { error: Error }) {
  return (
    <>
      <Separator className="my-3" />
      <p className="text-sm text-destructive">{error.message}</p>
    </>
  );
}

export function refetchLocalLibraryQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["downloads"] }),
    queryClient.invalidateQueries({ queryKey: ["library"] }),
    queryClient.invalidateQueries({
      queryKey: ["playback", "continue-watching"],
    }),
  ]);
}

export function createPlaybackProgressRequest({
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
    mediaTitle:
      file.displayTitle ?? file.sourceMediaTitle ?? anime.displayTitle,
    metadataId: file.metadataId ?? anime.id,
    metadataProvider: file.metadataProvider ?? anime.metadataProvider,
    positionSeconds: Math.max(0, positionSeconds),
    sourceMediaUrl: file.sourceMediaUrl,
    sourceProvider: file.sourceProvider ?? episode?.sourceProvider,
  };
}

export function findLocalFileForProgress(
  progress: PlaybackProgress,
  fileById: Map<string, LocalMediaFile>,
) {
  if (!progress.localMediaFileId) {
    return undefined;
  }

  return fileById.get(progress.localMediaFileId);
}

export function getPlaybackProgressPercent(progress: PlaybackProgress) {
  if (!progress.durationSeconds || progress.durationSeconds <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, (progress.positionSeconds / progress.durationSeconds) * 100),
  );
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatAiringEpisodeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getCurrentlyWatchingAnimeIds(
  progressItems: PlaybackProgress[],
  files: LocalMediaFile[],
) {
  const fileById = new Map(files.map((file) => [file.id, file]));
  const ids = new Set<number>();

  for (const progress of progressItems) {
    if (progress.completed) {
      continue;
    }

    const file = progress.localMediaFileId
      ? fileById.get(progress.localMediaFileId)
      : undefined;
    const metadataId = file?.metadataId ?? progress.metadataId;

    if (
      typeof metadataId === "number" &&
      Number.isInteger(metadataId) &&
      metadataId > 0
    ) {
      ids.add(metadataId);
    }
  }

  return Array.from(ids);
}

export function compareStreamingOptions(
  first: StreamingOption,
  second: StreamingOption,
) {
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

export function getStreamingHostRank(option: StreamingOption) {
  const label = `${option.hostProvider} ${option.providerLabel}`.toLowerCase();

  if (label.includes("videa")) {
    return 0;
  }

  if (label.includes("streamwish") && label.includes("fhd")) {
    return 1;
  }

  if (label.includes("streamwish")) {
    return 2;
  }

  if (label.includes("dailymotion")) {
    return 3;
  }

  if (label.includes("mp4upload")) {
    return 4;
  }

  if (label.includes("yonaplay")) {
    return 99;
  }

  return 10;
}

export function getDownloadSupport(option: DownloadOption) {
  const provider = option.hostProvider.toLowerCase().trim();

  if (
    [
      "gofile",
      "google drive",
      "google-drive",
      "mediafire",
      "mega",
      "mp4upload",
      "workupload",
    ].includes(provider)
  ) {
    return {
      supported: true,
      label: "Supported",
    };
  }

  return {
    supported: false,
    label: "Needs resolver",
  };
}

export function isActiveDownloadStatus(status: DownloadJob["status"]) {
  return ["queued", "resolving", "downloading", "paused"].includes(status);
}

export function getDownloadProgressPercent(job: DownloadJob) {
  if (!job.totalBytes) {
    return job.status === "completed" ? 100 : 0;
  }

  return Math.max(0, Math.min(100, (job.progressBytes / job.totalBytes) * 100));
}

export function formatDownloadEngine(job: DownloadJob) {
  if (job.engine === "local-segmented") {
    return "Local segmented";
  }

  if (job.engine === "local-http") {
    return "Local HTTP";
  }

  if (job.engine === "local-mega") {
    return "Local Mega";
  }

  return undefined;
}

export function createDownloadMediaContext(
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

export function formatHostProvider(provider: string) {
  switch (provider.toLowerCase().trim()) {
    case "mediafire":
      return "MediaFire";
    case "google drive":
    case "google-drive":
      return "Google Drive";
    case "mp4upload":
      return "mp4upload";
    case "gofile":
      return "Gofile";
    case "mega":
      return "Mega";
    case "workupload":
      return "Workupload";
    default:
      return formatToken(provider) ?? provider;
  }
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function hasDetails(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
): anime is AnimeMetadataDetails {
  return "characters" in anime;
}

export function hideBrokenImage(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = "none";
}

export function formatToken(value?: string) {
  return value
    ?.toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAnimeSeason(season: AnimeMetadataSeason) {
  return formatToken(season) ?? season;
}

export function getMediaHomeRouteTitle(route: MediaHomeRoute) {
  switch (route) {
    case "anime":
      return "Anime";
    case "movies":
      return "Movies";
    case "tv-shows":
      return "TV Shows";
  }
}

export function getCurrentAnimeSeason(date = new Date()): {
  season: AnimeMetadataSeason;
  year: number;
} {
  const month = date.getMonth();
  const year = date.getFullYear();

  if (month <= 2) {
    return { season: "WINTER", year };
  }

  if (month <= 5) {
    return { season: "SPRING", year };
  }

  if (month <= 8) {
    return { season: "SUMMER", year };
  }

  return { season: "FALL", year };
}

export function getAnimeMetadataLine(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  return [
    formatStatusWithAiringDay(anime),
    formatSeasonYear(anime),
    isSingleEpisodeMovie(anime)
      ? undefined
      : formatEpisodeCount(anime.episodes),
    formatMediaFormat(anime.format),
  ]
    .filter(Boolean)
    .join(" | ");
}

export function formatStatusWithAiringDay(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  const status = formatToken(anime.status);

  if (!status) {
    return undefined;
  }

  const airingDay =
    hasDetails(anime) && anime.status?.toUpperCase() === "RELEASING"
      ? formatAiringDay(anime.nextAiringEpisode?.airingAt)
      : undefined;

  return airingDay ? `${status} (${airingDay})` : status;
}

export function formatAiringDay(airingAt?: string) {
  if (!airingAt) {
    return undefined;
  }

  const date = new Date(airingAt);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleDateString("en-US", { weekday: "long" });
}

export function formatSeasonYear(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  return [formatToken(anime.season), anime.seasonYear]
    .filter(Boolean)
    .join(" ");
}

export function formatEpisodeCount(episodes?: number) {
  if (!episodes) {
    return undefined;
  }

  return `${episodes} ${episodes === 1 ? "Episode" : "Episodes"}`;
}

export function isSingleEpisodeMovie(
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails,
) {
  return anime.format?.toUpperCase() === "MOVIE" && (anime.episodes ?? 0) <= 1;
}

export function formatMediaFormat(format?: string) {
  switch (format?.toUpperCase()) {
    case "TV":
    case "TV_SHORT":
      return "Series";
    case "MOVIE":
      return "Movie";
    case "SPECIAL":
      return "Special";
    case "OVA":
    case "ONA":
      return format.toUpperCase();
    default:
      return formatToken(format);
  }
}

export function formatScore(details: AnimeMetadataDetails) {
  const score = details.averageScore ?? details.meanScore;

  return score ? `${score}%` : undefined;
}

export function getCombinedTags(details: AnimeMetadataDetails) {
  return Array.from(
    new Set([
      ...details.genres,
      ...details.tags.filter((tag) => !tag.spoiler).map((tag) => tag.name),
    ]),
  );
}

export function formatDate(date?: {
  year?: number;
  month?: number;
  day?: number;
}) {
  if (!date?.year) {
    return undefined;
  }

  return [date.year, date.month, date.day].filter(Boolean).join("-");
}

export function formatEpisodeTitle(episode: EpisodeSummary) {
  const episodeNumber =
    normalizeEpisodeNumber(episode.number) ??
    normalizeEpisodeNumber(episode.title);

  return episodeNumber ? `Episode ${episodeNumber}` : episode.title;
}

export function getEpisodeSubtitle(episode: EpisodeSummary) {
  const episodeNumber = normalizeEpisodeNumber(episode.number);

  return getEpisodeSubtitleFromText(episode.title, episodeNumber);
}

export function getEpisodeSubtitleFromText(
  title: string | undefined,
  episodeNumber?: string,
) {
  const trimmedTitle = title?.trim();

  if (!trimmedTitle || /[\u0600-\u06FF]/.test(trimmedTitle)) {
    return undefined;
  }

  const titleEpisodeNumber = normalizeEpisodeNumber(trimmedTitle);

  if (
    titleEpisodeNumber &&
    episodeNumber &&
    titleEpisodeNumber === episodeNumber
  ) {
    return undefined;
  }

  return trimmedTitle;
}

export function getEpisodeDrawerItems(
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

  return [...episodes.slice(currentIndex), ...episodes.slice(0, currentIndex)];
}

export function isSameEpisode(
  episode: EpisodeSummary,
  currentEpisode: EpisodeSummary | undefined,
  routeEpisodeNumber?: string,
) {
  if (currentEpisode?.url && episode.url === currentEpisode.url) {
    return true;
  }

  const episodeNumber =
    normalizeEpisodeNumber(episode.number) ??
    normalizeEpisodeNumber(episode.title);
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

export function getDownloadQualityGroups(downloadOptions: DownloadOption[]) {
  const groups = new Map<DownloadOption["quality"], DownloadQualityGroup>();

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
        getQualitySortRank(first.quality) -
          getQualitySortRank(second.quality) ||
        first.label.localeCompare(second.label),
    );
}

export function getDownloadQualityLabel(quality: DownloadOption["quality"]) {
  switch (quality.toUpperCase()) {
    case "FHD":
      return "FHD - 1080p";
    case "HD":
      return "HD - 720p";
    case "SD":
      return "SD - 480p";
    default:
      return formatToken(quality) ?? quality;
  }
}

export function formatDownloadEpisodeReference(
  episode: EpisodeSummary | undefined,
  routeEpisodeNumber?: string,
) {
  const episodeNumber =
    normalizeEpisodeNumber(episode?.number) ??
    normalizeEpisodeNumber(episode?.title) ??
    normalizeEpisodeNumber(routeEpisodeNumber);

  return episodeNumber ? `Episode ${episodeNumber}` : "Episode";
}

export function getProviderFaviconUrl(providerUrl: string) {
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

export function getLocalFilesForEpisode({
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

      if (
        file.sourceProvider &&
        file.sourceProvider !== episode.sourceProvider
      ) {
        return false;
      }

      return true;
    })
    .toSorted(compareLocalMediaFiles);
}

export function compareLocalMediaFiles(
  first: LocalMediaFile,
  second: LocalMediaFile,
) {
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

export function getQualitySortRank(quality: string) {
  switch (quality.toUpperCase()) {
    case "FHD":
      return 0;
    case "HD":
      return 1;
    case "SD":
      return 2;
    default:
      return 3;
  }
}

export function normalizeEpisodeNumber(value?: string) {
  const normalized = value
    ?.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

  return normalized?.match(/\d+(?:\.\d+)?/)?.[0];
}

export function toAnimeSlug(
  anime: Pick<
    AnimeMetadataSearchResult,
    "displayTitle" | "sourceSearchTitle" | "title"
  >,
) {
  const title =
    anime.sourceSearchTitle || anime.title.romaji || anime.displayTitle;
  return slugFromTitle(title);
}

export function slugFromTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "anime";
}
