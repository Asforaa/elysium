import { Injectable } from '@nestjs/common';
import { DownloadJobsRepository } from '../download-jobs/download-jobs.repository';

@Injectable()
export class LibraryService {
  constructor(private readonly downloads: DownloadJobsRepository) {}

  listFiles() {
    return this.downloads.listLocalMediaFiles();
  }
}
