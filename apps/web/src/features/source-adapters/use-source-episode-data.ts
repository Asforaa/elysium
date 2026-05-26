import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  DownloadOption,
  EpisodeSummary,
  MediaSearchResult,
  StreamingOption,
} from "@elysium/shared";
import {
  getDownloadOptions,
  getEpisodes,
  getStreamingOptions,
  searchMedia,
} from "@/lib/api";
import { normalizeEpisodeNumber } from "@/lib/media-ui";

const EMPTY_SEARCH_RESULTS: MediaSearchResult[] = [];
const EMPTY_EPISODES: EpisodeSummary[] = [];
const EMPTY_DOWNLOAD_OPTIONS: DownloadOption[] = [];
const EMPTY_STREAMING_OPTIONS: StreamingOption[] = [];

export function useSourceEpisodeData({
  routeEpisodeNumber,
  selectedEpisodeUrl,
  sourceSearchTerm,
}: {
  routeEpisodeNumber?: string;
  selectedEpisodeUrl: string | null;
  sourceSearchTerm: string;
}) {
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
  }, [episodes, routeEpisodeNumber, selectedEpisodeUrl]);

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

  return {
    downloadOptions: downloadOptionsQuery.data ?? EMPTY_DOWNLOAD_OPTIONS,
    downloadOptionsQuery,
    episodes,
    episodesLoading: searchQuery.isLoading || episodesQuery.isLoading,
    episodesQuery,
    searchQuery,
    searchResults,
    selectedEpisode,
    selectedMedia,
    streamingOptions: streamingOptionsQuery.data ?? EMPTY_STREAMING_OPTIONS,
    streamingOptionsQuery,
  };
}
