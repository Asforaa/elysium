import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { SourceProvidersModule } from './source-providers/source-providers.module';

@Module({
  imports: [HealthModule, SourceProvidersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
