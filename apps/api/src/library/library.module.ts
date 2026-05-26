import { Module } from '@nestjs/common';
import { DownloadJobsModule } from '../download-jobs/download-jobs.module';
import { MediaLibraryRepository } from '../media-library/media-library.repository';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [DownloadJobsModule],
  controllers: [LibraryController],
  providers: [LibraryService, MediaLibraryRepository],
})
export class LibraryModule {}
