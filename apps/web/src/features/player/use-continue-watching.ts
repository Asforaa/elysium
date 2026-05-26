import { useQuery } from "@tanstack/react-query";
import type { PlaybackProgress } from "@elysium/shared";
import { listContinueWatching } from "@/lib/api";

const EMPTY_PLAYBACK_PROGRESS: PlaybackProgress[] = [];

export function useContinueWatching() {
  const continueWatchingQuery = useQuery({
    queryKey: ["playback", "continue-watching"],
    queryFn: listContinueWatching,
    refetchInterval: 10_000,
  });

  return {
    continueWatching: continueWatchingQuery.data ?? EMPTY_PLAYBACK_PROGRESS,
    continueWatchingQuery,
  };
}
