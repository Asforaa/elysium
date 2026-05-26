import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { MediaMetadataCacheService } from '../media-library/media-metadata-cache.service';
import { MediaLibraryRepository } from '../media-library/media-library.repository';
import { DownloadJobsController } from './download-jobs.controller';
import { DownloadJobsRepository } from './download-jobs.repository';
import { DownloadJobsService } from './download-jobs.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DownloadJobsController],
  providers: [
    DownloadJobsRepository,
    DownloadJobsService,
    MediaLibraryRepository,
    MediaMetadataCacheService,
  ],
  exports: [DownloadJobsRepository, DownloadJobsService],
})
export class DownloadJobsModule {}
