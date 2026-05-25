import { Module } from '@nestjs/common';
import { DownloadJobsController } from './download-jobs.controller';
import { DownloadJobsService } from './download-jobs.service';

@Module({
  controllers: [DownloadJobsController],
  providers: [DownloadJobsService],
})
export class DownloadJobsModule {}
