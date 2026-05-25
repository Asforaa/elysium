import { Module } from '@nestjs/common';
import { SourceProvidersController } from './source-providers.controller';
import { SourceProvidersService } from './source-providers.service';

@Module({
  controllers: [SourceProvidersController],
  providers: [SourceProvidersService],
  exports: [SourceProvidersService],
})
export class SourceProvidersModule {}
