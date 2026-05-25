import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PlaybackController } from './playback.controller';
import { PlaybackRepository } from './playback.repository';
import { PlaybackService } from './playback.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PlaybackController],
  providers: [PlaybackRepository, PlaybackService],
})
export class PlaybackModule {}
