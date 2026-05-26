import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DownloadedAnime,
  DownloadedAnimePage,
  LocalMediaFile,
} from '@elysium/shared';
import { DownloadJobsRepository } from '../download-jobs/download-jobs.repository';
import { DownloadJobsService } from '../download-jobs/download-jobs.service';
import {
  groupFilesByMedia,
  MediaLibraryRepository,
} from '../media-library/media-library.repository';

@Injectable()
export class LibraryService {
  constructor(
    private readonly downloads: DownloadJobsRepository,
    private readonly downloadJobs: DownloadJobsService,
    private readonly mediaLibrary: MediaLibraryRepository,
  ) {}

  async listFiles() {
    return this.mergeFiles(
      await this.mediaLibrary.listImportedLocalMediaFiles(),
      await this.downloads.listLocalMediaFiles(),
    );
  }

  async listAnime() {
    return this.mergeAnimeGroups(
      await this.mediaLibrary.listImportedDownloadedAnime(),
      await this.downloads.listDownloadedAnime(),
    );
  }

  async listAnimePage({
    page = 1,
    perPage = 24,
  }: {
    page?: number;
    perPage?: number;
  }): Promise<DownloadedAnimePage> {
    const anime = await this.listAnime();
    const normalizedPage = Math.max(1, Math.trunc(page));
    const normalizedPerPage = Math.min(60, Math.max(1, Math.trunc(perPage)));
    const startIndex = (normalizedPage - 1) * normalizedPerPage;
    const items = anime.slice(startIndex, startIndex + normalizedPerPage);

    return {
      hasNextPage: startIndex + normalizedPerPage < anime.length,
      items,
      page: normalizedPage,
      perPage: normalizedPerPage,
      total: anime.length,
    };
  }

  async getFile(id: string) {
    return (
      (await this.mediaLibrary.getImportedLocalMediaFile(id)) ??
      (await this.downloads.getLocalMediaFile(id))
    );
  }

  async deleteFile(id: string) {
    const importedFile = await this.mediaLibrary.getImportedLocalMediaFile(id);

    if (importedFile) {
      throw new BadRequestException(
        'Imported library files are read-only from the downloads API.',
      );
    }

    return this.downloadJobs.deleteLocalMediaFile(id);
  }

  private mergeFiles(
    importedFiles: LocalMediaFile[],
    downloadedFiles: LocalMediaFile[],
  ) {
    const filesByPath = new Map<string, LocalMediaFile>();

    for (const file of importedFiles) {
      filesByPath.set(file.filePath, file);
    }

    for (const file of downloadedFiles) {
      if (!filesByPath.has(file.filePath)) {
        filesByPath.set(file.filePath, file);
      }
    }

    return Array.from(filesByPath.values()).sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt),
    );
  }

  private mergeAnimeGroups(
    importedAnime: DownloadedAnime[],
    downloadedAnime: DownloadedAnime[],
  ) {
    return groupFilesByMedia([
      ...importedAnime.flatMap((anime) => anime.files),
      ...downloadedAnime.flatMap((anime) => anime.files),
    ]);
  }
}
