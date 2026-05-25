import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import type { CreateDownloadJobRequest } from '@elysium/shared';
import { DownloadJobsService } from './download-jobs.service';

@Controller('downloads')
export class DownloadJobsController {
  constructor(private readonly downloadJobs: DownloadJobsService) {}

  @Get()
  listJobs() {
    return this.downloadJobs.listJobs();
  }

  @Get(':id')
  getJob(@Param('id') id: string) {
    return this.downloadJobs.getJob(id);
  }

  @Post()
  createJob(@Body() body: Partial<CreateDownloadJobRequest>) {
    if (!body.option?.providerUrl || !body.option.hostProvider) {
      throw new BadRequestException('Missing download option');
    }

    return this.downloadJobs.createJob({
      mediaContext: body.mediaContext,
      option: body.option,
    });
  }

  @Post(':id/retry')
  retryJob(@Param('id') id: string) {
    return this.downloadJobs.retryJob(id);
  }

  @Delete(':id')
  deleteJob(@Param('id') id: string) {
    return this.downloadJobs.deleteJob(id);
  }
}
