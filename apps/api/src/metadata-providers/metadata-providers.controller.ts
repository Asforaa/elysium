import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import type {
  AnimeMetadataSearchSort,
  MetadataProviderId,
} from '@elysium/shared';
import { MetadataProvidersService } from './metadata-providers.service';

const ANIME_METADATA_SEARCH_SORTS: AnimeMetadataSearchSort[] = [
  'title',
  'popularity',
  'average-score',
  'trending',
  'favorites',
  'date-added',
  'release-date',
];

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
    @Query('sort') sort?: string,
  ) {
    return this.metadataProviders
      .getAdapter(providerId)
      .searchAnime(query?.trim() ?? '', { sort: normalizeAnimeSearchSort(sort) });
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

function normalizeAnimeSearchSort(
  sort: string | undefined,
): AnimeMetadataSearchSort {
  if (!sort) {
    return 'popularity';
  }

  if (ANIME_METADATA_SEARCH_SORTS.includes(sort as AnimeMetadataSearchSort)) {
    return sort as AnimeMetadataSearchSort;
  }

  throw new BadRequestException(`Unsupported anime search sort: ${sort}`);
}
