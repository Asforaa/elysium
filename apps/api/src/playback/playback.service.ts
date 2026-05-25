import { BadRequestException, Injectable } from '@nestjs/common';
import type { SavePlaybackProgressRequest } from '@elysium/shared';
import { PlaybackRepository } from './playback.repository';

@Injectable()
export class PlaybackService {
  constructor(private readonly playback: PlaybackRepository) {}

  saveProgress(input: SavePlaybackProgressRequest) {
    if (!Number.isFinite(input.positionSeconds)) {
      throw new BadRequestException('Missing playback position');
    }

    if (
      !input.localMediaFileId &&
      !input.episodeUrl &&
      !(
        input.metadataProvider &&
        input.metadataId &&
        input.sourceProvider &&
        input.episodeNumber
      )
    ) {
      throw new BadRequestException('Missing playback identity');
    }

    return this.playback.saveProgress(input);
  }

  getProgress(query: Partial<SavePlaybackProgressRequest>) {
    return this.playback.getProgress(query);
  }

  listContinueWatching() {
    return this.playback.listContinueWatching();
  }
}
