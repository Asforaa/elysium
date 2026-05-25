import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DownloadJobsModule } from './download-jobs/download-jobs.module';
import { HealthModule } from './health/health.module';
import { MetadataProvidersModule } from './metadata-providers/metadata-providers.module';
import { SourceProvidersModule } from './source-providers/source-providers.module';

@Module({
  imports: [
    DownloadJobsModule,
    HealthModule,
    MetadataProvidersModule,
    SourceProvidersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
