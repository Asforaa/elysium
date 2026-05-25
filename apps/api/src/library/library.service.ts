import { Injectable } from '@nestjs/common';
import { DownloadJobsRepository } from '../download-jobs/download-jobs.repository';
import { DownloadJobsService } from '../download-jobs/download-jobs.service';

@Injectable()
export class LibraryService {
  constructor(
    private readonly downloads: DownloadJobsRepository,
    private readonly downloadJobs: DownloadJobsService,
  ) {}

  listFiles() {
    return this.downloads.listLocalMediaFiles();
  }

  listAnime() {
    return this.downloads.listDownloadedAnime();
  }

  getFile(id: string) {
    return this.downloads.getLocalMediaFile(id);
  }

  deleteFile(id: string) {
    return this.downloadJobs.deleteLocalMediaFile(id);
  }
}
