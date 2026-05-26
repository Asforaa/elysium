import { Module } from '@nestjs/common';
import { MediaMetadataCacheService } from '../media-library/media-metadata-cache.service';
import { MediaLibraryRepository } from '../media-library/media-library.repository';
import { MetadataProvidersController } from './metadata-providers.controller';
import { MetadataProvidersService } from './metadata-providers.service';

@Module({
  controllers: [MetadataProvidersController],
  providers: [
    MetadataProvidersService,
    MediaLibraryRepository,
    MediaMetadataCacheService,
  ],
})
export class MetadataProvidersModule {}
