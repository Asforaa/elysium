import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DownloadedAnime, LocalMediaFile } from "@elysium/shared";
import {
  deleteLocalMediaFile,
  listDownloadedAnimePage,
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

  const downloadedAnimeQuery = useInfiniteQuery({
    queryKey: ["library", "anime", "page"],
    queryFn: ({ pageParam }) =>
      listDownloadedAnimePage({
        page: Number(pageParam),
        perPage: 24,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    refetchInterval: 5_000,
  });
  const downloadedAnime = useMemo(
    () =>
      downloadedAnimeQuery.data?.pages.flatMap((page) => page.items) ??
      EMPTY_DOWNLOADED_ANIME,
    [downloadedAnimeQuery.data],
  );

  const deleteLocalFileMutation = useMutation({
    mutationFn: deleteLocalMediaFile,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

  return {
    deleteLocalFileMutation,
    downloadedAnime,
    downloadedAnimeQuery,
    localMediaFiles: localMediaFilesQuery.data ?? EMPTY_LOCAL_MEDIA_FILES,
    localMediaFilesQuery,
  };
}
