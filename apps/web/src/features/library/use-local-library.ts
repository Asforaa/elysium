import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DownloadedAnime, LocalMediaFile } from "@elysium/shared";
import {
  deleteLocalMediaFile,
  listDownloadedAnime,
  listLocalMediaFiles,
} from "@/lib/api";
import { refetchLocalLibraryQueries } from "@/lib/media-ui";

const EMPTY_LOCAL_MEDIA_FILES: LocalMediaFile[] = [];
const EMPTY_DOWNLOADED_ANIME: DownloadedAnime[] = [];

export function useLocalLibrary() {
  const queryClient = useQueryClient();

  const localMediaFilesQuery = useQuery({
    queryKey: ["library", "files"],
    queryFn: listLocalMediaFiles,
    refetchInterval: 5_000,
  });

  const downloadedAnimeQuery = useQuery({
    queryKey: ["library", "anime"],
    queryFn: listDownloadedAnime,
    refetchInterval: 5_000,
  });

  const deleteLocalFileMutation = useMutation({
    mutationFn: deleteLocalMediaFile,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

  return {
    deleteLocalFileMutation,
    downloadedAnime: downloadedAnimeQuery.data ?? EMPTY_DOWNLOADED_ANIME,
    downloadedAnimeQuery,
    localMediaFiles: localMediaFilesQuery.data ?? EMPTY_LOCAL_MEDIA_FILES,
    localMediaFilesQuery,
  };
}
