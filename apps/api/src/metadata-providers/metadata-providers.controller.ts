import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import type { MetadataProviderId } from '@elysium/shared';
import { MetadataProvidersService } from './metadata-providers.service';

@Controller('metadata')
export class MetadataProvidersController {
  constructor(private readonly metadataProviders: MetadataProvidersService) {}

  @Get()
  listProviders() {
    return this.metadataProviders.listProviders();
  }

  @Get(':providerId/search')
  searchAnime(
    @Param('providerId') providerId: MetadataProviderId,
    @Query('q') query?: string,
  ) {
    if (!query?.trim()) {
      throw new BadRequestException('Missing anime search query');
    }

    return this.metadataProviders.getAdapter(providerId).searchAnime(query);
  }

  @Get(':providerId/anime/:id')
  getAnimeDetails(
    @Param('providerId') providerId: MetadataProviderId,
    @Param('id') idRaw: string,
  ) {
    const id = Number(idRaw);

    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException('Invalid anime id');
    }

    return this.metadataProviders.getAdapter(providerId).getAnimeDetails(id);
  }
}
