import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import type { SourceProviderId } from '@elysium/shared';
import { SourceProvidersService } from './source-providers.service';

@Controller('providers')
export class SourceProvidersController {
  constructor(private readonly sourceProviders: SourceProvidersService) {}

  @Get()
  listProviders() {
    return this.sourceProviders.listProviders();
  }

  @Get('search')
  searchAll(@Query('q') query?: string) {
    if (!query?.trim()) {
      throw new BadRequestException('Missing search query');
    }

    return this.sourceProviders.searchAll(query);
  }

  @Get(':providerId/search')
  search(
    @Param('providerId') providerId: SourceProviderId,
    @Query('q') query?: string,
  ) {
    if (!query?.trim()) {
      throw new BadRequestException('Missing search query');
    }

    return this.sourceProviders.getAdapter(providerId).search(query);
  }

  @Get(':providerId/media')
  getMediaDetails(
    @Param('providerId') providerId: SourceProviderId,
    @Query('url') url?: string,
  ) {
    if (!url?.trim()) {
      throw new BadRequestException('Missing media URL');
    }

    return this.sourceProviders.getAdapter(providerId).getMediaDetails(url);
  }

  @Get(':providerId/episodes')
  getEpisodes(
    @Param('providerId') providerId: SourceProviderId,
    @Query('url') url?: string,
  ) {
    if (!url?.trim()) {
      throw new BadRequestException('Missing media URL');
    }

    return this.sourceProviders.getAdapter(providerId).getEpisodes(url);
  }

  @Get(':providerId/download-options')
  getDownloadOptions(
    @Param('providerId') providerId: SourceProviderId,
    @Query('url') url?: string,
  ) {
    if (!url?.trim()) {
      throw new BadRequestException('Missing episode URL');
    }

    return this.sourceProviders.getAdapter(providerId).getDownloadOptions(url);
  }
}
