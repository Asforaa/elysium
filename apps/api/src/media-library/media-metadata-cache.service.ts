import { Injectable } from '@nestjs/common';
import type {
  AnimeMetadataDetails,
  DownloadMediaContext,
  MetadataProviderId,
} from '@elysium/shared';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AniListMetadataAdapter } from '../metadata-providers/anilist/anilist-metadata.adapter';
import { MediaLibraryRepository } from './media-library.repository';

const DEFAULT_METADATA_CACHE_DIR = resolve(process.cwd(), '../../.local/metadata');

@Injectable()
export class MediaMetadataCacheService {
  private readonly anilist = new AniListMetadataAdapter();

  constructor(private readonly mediaLibrary: MediaLibraryRepository) {}

  async getCachedAnimeDetails(provider: MetadataProviderId, id: number) {
    return this.mediaLibrary.getCachedAnimeDetails(provider, id);
  }

  async getOrCacheAnimeDetails(provider: MetadataProviderId, id: number) {
    const cached = await this.getCachedAnimeDetails(provider, id);

    if (cached) {
      return cached;
    }

    return this.cacheAnimeDetails(provider, id);
  }

  async cacheFromDownloadContext(context: DownloadMediaContext | undefined) {
    if (
      context?.metadataProvider !== 'anilist' ||
      !context.metadataId ||
      !Number.isInteger(context.metadataId)
    ) {
      return undefined;
    }

    return this.cacheAnimeDetails(context.metadataProvider, context.metadataId);
  }

  async cacheAllKnownAnime({
    delayMs = 2500,
    limit,
    missingOnly = true,
    provider = 'anilist',
  }: {
    delayMs?: number;
    limit?: number;
    missingOnly?: boolean;
    provider?: MetadataProviderId;
  } = {}) {
    const targets = await this.mediaLibrary.listMetadataCacheTargets({
      missingOnly,
      provider,
    });
    const selectedTargets = limit ? targets.slice(0, limit) : targets;
    const results: Array<{
      cached: boolean;
      errorMessage?: string;
      id: number;
      provider: MetadataProviderId;
      title?: string;
    }> = [];

    for (const [index, target] of selectedTargets.entries()) {
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      try {
        const details = await this.cacheAnimeDetails(
          target.metadata_provider,
          target.metadata_id,
        );

        results.push({
          cached: true,
          id: target.metadata_id,
          provider: target.metadata_provider,
          title: details.displayTitle,
        });
      } catch (error) {
        results.push({
          cached: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          id: target.metadata_id,
          provider: target.metadata_provider,
        });
      }
    }

    return results;
  }

  async cacheAnimeDetails(provider: MetadataProviderId, id: number) {
    const details = await this.fetchAnimeDetails(provider, id);

    return this.storeAnimeDetails(provider, details);
  }

  async storeAnimeDetails(
    provider: MetadataProviderId,
    details: AnimeMetadataDetails,
  ) {
    const filePath = await this.writeDetailsFile(provider, details);

    await this.mediaLibrary.upsertCachedAnimeDetails({
      details,
      filePath,
      provider,
    });

    return details;
  }

  private fetchAnimeDetails(provider: MetadataProviderId, id: number) {
    if (provider !== 'anilist') {
      throw new Error(`Metadata cache does not support provider yet: ${provider}`);
    }

    return this.anilist.getAnimeDetails(id);
  }

  private async writeDetailsFile(
    provider: MetadataProviderId,
    details: AnimeMetadataDetails,
  ) {
    const directory = resolve(
      process.env.ELYSIUM_METADATA_CACHE_DIR ?? DEFAULT_METADATA_CACHE_DIR,
      provider,
    );
    const filePath = resolve(directory, `${details.id}.json`);

    await mkdir(directory, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(details, null, 2)}\n`);

    return filePath;
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
