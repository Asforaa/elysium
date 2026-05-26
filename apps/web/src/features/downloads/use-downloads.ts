import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DownloadJob } from "@elysium/shared";
import {
  deleteDownloadJob,
  listDownloadJobs,
  retryDownload,
  startDownload,
} from "@/lib/api";
import type { StartDownloadInput } from "@/app/types";
import { refetchLocalLibraryQueries } from "@/lib/media-ui";

const EMPTY_DOWNLOAD_JOBS: DownloadJob[] = [];

export function useDownloads() {
  const queryClient = useQueryClient();

  const downloadJobsQuery = useQuery({
    queryKey: ["downloads"],
    queryFn: listDownloadJobs,
    refetchInterval: 1_000,
  });

  const downloadJobs = downloadJobsQuery.data ?? EMPTY_DOWNLOAD_JOBS;
  const downloadJobByUrl = useMemo(() => {
    const jobs = new Map<string, DownloadJob>();

    for (const job of downloadJobs) {
      if (!jobs.has(job.option.providerUrl)) {
        jobs.set(job.option.providerUrl, job);
      }
    }

    return jobs;
  }, [downloadJobs]);

  const startDownloadMutation = useMutation({
    mutationFn: ({ mediaContext, option }: StartDownloadInput) =>
      startDownload(option, mediaContext),
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

  const retryDownloadMutation = useMutation({
    mutationFn: retryDownload,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

  const deleteDownloadJobMutation = useMutation({
    mutationFn: deleteDownloadJob,
    onSuccess: () => {
      void refetchLocalLibraryQueries(queryClient);
    },
  });

  return {
    deleteDownloadJobMutation,
    downloadJobByUrl,
    downloadJobs,
    downloadJobsQuery,
    retryDownloadMutation,
    startDownloadMutation,
  };
}
