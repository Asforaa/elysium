import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type {
  MetadataProviderId,
  SavePlaybackProgressRequest,
  SourceProviderId,
} from '@elysium/shared';
import { PlaybackService } from './playback.service';

@Controller('playback')
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @Get('progress')
  async getProgress(
    @Query('localMediaFileId') localMediaFileId?: string,
    @Query('metadataProvider') metadataProvider?: MetadataProviderId,
    @Query('metadataId') metadataId?: string,
    @Query('sourceProvider') sourceProvider?: SourceProviderId,
    @Query('episodeNumber') episodeNumber?: string,
    @Query('episodeUrl') episodeUrl?: string,
  ) {
    return (
      (await this.playback.getProgress({
        episodeNumber,
        episodeUrl,
        localMediaFileId,
        metadataId: metadataId ? Number(metadataId) : undefined,
        metadataProvider,
        sourceProvider,
      })) ?? null
    );
  }

  @Post('progress')
  saveProgress(@Body() body: SavePlaybackProgressRequest) {
    return this.playback.saveProgress(body);
  }

  @Get('continue-watching')
  listContinueWatching() {
    return this.playback.listContinueWatching();
  }
}
