import { Module } from '@nestjs/common';
import { DownloadJobsModule } from '../download-jobs/download-jobs.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';

@Module({
  imports: [DownloadJobsModule],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
