import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import type { DownloadOption } from '@elysium/shared';
import { DownloadJobsService } from './download-jobs.service';

interface CreateDownloadJobBody {
  option?: DownloadOption;
}

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
  createJob(@Body() body: CreateDownloadJobBody) {
    if (!body.option?.providerUrl || !body.option.hostProvider) {
      throw new BadRequestException('Missing download option');
    }

    return this.downloadJobs.createJob(body.option);
  }
}
