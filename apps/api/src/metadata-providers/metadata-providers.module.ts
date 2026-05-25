import { Module } from '@nestjs/common';
import { MetadataProvidersController } from './metadata-providers.controller';
import { MetadataProvidersService } from './metadata-providers.service';

@Module({
  controllers: [MetadataProvidersController],
  providers: [MetadataProvidersService],
})
export class MetadataProvidersModule {}
