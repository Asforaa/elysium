import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DownloadJobsController } from './download-jobs.controller';
import { DownloadJobsRepository } from './download-jobs.repository';
import { DownloadJobsService } from './download-jobs.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DownloadJobsController],
  providers: [DownloadJobsRepository, DownloadJobsService],
  exports: [DownloadJobsRepository, DownloadJobsService],
})
export class DownloadJobsModule {}
