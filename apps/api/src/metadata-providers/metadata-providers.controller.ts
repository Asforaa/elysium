import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type {
  AnimeMetadataSeason,
  AnimeMetadataSearchSort,
  MetadataProviderId,
} from '@elysium/shared';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';
import { MetadataProvidersService } from './metadata-providers.service';

const ANIME_METADATA_SEASONS: AnimeMetadataSeason[] = [
  'WINTER',
  'SPRING',
  'SUMMER',
  'FALL',
];
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
    @Query('season') season?: string,
    @Query('year') year?: string,
    @Query('seasonYear') seasonYear?: string,
  ) {
    return this.metadataProviders
      .getAdapter(providerId)
      .searchAnime(query?.trim() ?? '', {
        season: normalizeAnimeSeason(season),
        seasonYear: normalizeAnimeSeasonYear(seasonYear ?? year),
        sort: normalizeAnimeSearchSort(sort),
      });
  }

  @Get(':providerId/search-page')
  searchAnimePage(
    @Param('providerId') providerId: MetadataProviderId,
    @Query('q') query?: string,
    @Query('sort') sort?: string,
    @Query('season') season?: string,
    @Query('year') year?: string,
    @Query('seasonYear') seasonYear?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.metadataProviders
      .getAdapter(providerId)
      .searchAnimePage(query?.trim() ?? '', {
        page: normalizeOptionalPositiveInteger(page, 'page'),
        perPage: normalizeOptionalPositiveInteger(perPage, 'perPage'),
        season: normalizeAnimeSeason(season),
        seasonYear: normalizeAnimeSeasonYear(seasonYear ?? year),
        sort: normalizeAnimeSearchSort(sort),
      });
  }

  @Get(':providerId/airing-schedule')
  listAiringSchedule(
    @Param('providerId') providerId: MetadataProviderId,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('mediaIds') mediaIds?: string,
  ) {
    return this.metadataProviders.getAdapter(providerId).listAiringSchedule({
      mediaIds: normalizeMediaIds(mediaIds),
      page: normalizeOptionalPositiveInteger(page, 'page'),
      perPage: normalizeOptionalPositiveInteger(perPage, 'perPage'),
    });
  }

  @Get(':providerId/assets/:id/:filename')
  async getCachedAsset(
    @Param('providerId') providerId: MetadataProviderId,
    @Param('id') idRaw: string,
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const id = normalizeAnimeId(idRaw);
    const asset = await this.metadataProviders.getCachedAssetFile(
      providerId,
      id,
      filename,
    );

    if (!asset) {
      throw new NotFoundException(`Unknown cached metadata asset: ${filename}`);
    }

    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('Content-Length', asset.size);
    response.setHeader('Content-Type', asset.contentType);
    createReadStream(asset.filePath).pipe(response);
  }

  @Get(':providerId/anime/:id')
  getAnimeDetails(
    @Param('providerId') providerId: MetadataProviderId,
    @Param('id') idRaw: string,
  ) {
    const id = normalizeAnimeId(idRaw);

    return this.metadataProviders.getAnimeDetails(providerId, id);
  }
}

function normalizeAnimeId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException('Invalid anime id');
  }

  return id;
}

function normalizeOptionalPositiveInteger(
  value: string | undefined,
  label: string,
) {
  if (!value) {
    return undefined;
  }

  const normalized = Number(value);

  if (Number.isInteger(normalized) && normalized > 0) {
    return normalized;
  }

  throw new BadRequestException(`Invalid ${label}: ${value}`);
}

function normalizeMediaIds(value: string | undefined) {
  if (!value?.trim()) {
    return undefined;
  }

  const ids = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!ids.length) {
    throw new BadRequestException(`Invalid mediaIds: ${value}`);
  }

  return Array.from(new Set(ids));
}

function normalizeAnimeSeason(season: string | undefined) {
  if (!season) {
    return undefined;
  }

  const normalized = season.trim().toUpperCase();

  if (ANIME_METADATA_SEASONS.includes(normalized as AnimeMetadataSeason)) {
    return normalized as AnimeMetadataSeason;
  }

  throw new BadRequestException(`Unsupported anime season: ${season}`);
}

function normalizeAnimeSeasonYear(year: string | undefined) {
  if (!year) {
    return undefined;
  }

  const normalized = Number(year);

  if (Number.isInteger(normalized) && normalized >= 1900 && normalized <= 3000) {
    return normalized;
  }

  throw new BadRequestException(`Invalid anime season year: ${year}`);
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
