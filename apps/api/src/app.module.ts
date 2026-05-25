import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DownloadJobsModule } from './download-jobs/download-jobs.module';
import { HealthModule } from './health/health.module';
import { LibraryModule } from './library/library.module';
import { MetadataProvidersModule } from './metadata-providers/metadata-providers.module';
import { SourceProvidersModule } from './source-providers/source-providers.module';

@Module({
  imports: [
    AuthModule,
    DownloadJobsModule,
    HealthModule,
    LibraryModule,
    MetadataProvidersModule,
    SourceProvidersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
