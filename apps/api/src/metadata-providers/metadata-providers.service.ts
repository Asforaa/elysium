import { Injectable, NotFoundException } from '@nestjs/common';
import type { MetadataProviderId } from '@elysium/shared';
import { MediaMetadataCacheService } from '../media-library/media-metadata-cache.service';
import { AniListMetadataAdapter } from './anilist/anilist-metadata.adapter';
import type { MetadataProviderAdapter } from './metadata-provider-adapter';

@Injectable()
export class MetadataProvidersService {
  private readonly adapters = new Map<
    MetadataProviderId,
    MetadataProviderAdapter
  >([['anilist', new AniListMetadataAdapter()]]);

  constructor(private readonly metadataCache: MediaMetadataCacheService) {}

  listProviders() {
    return Array.from(this.adapters.values()).map(
      (adapter) => adapter.provider,
    );
  }

  getAdapter(providerId: MetadataProviderId): MetadataProviderAdapter {
    const adapter = this.adapters.get(providerId);

    if (!adapter) {
      throw new NotFoundException(`Unknown metadata provider: ${providerId}`);
    }

    return adapter;
  }

  async getAnimeDetails(providerId: MetadataProviderId, id: number) {
    const cached = await this.metadataCache.getCachedAnimeDetails(providerId, id);

    if (cached) {
      return cached;
    }

    const details = await this.getAdapter(providerId).getAnimeDetails(id);

    await this.metadataCache
      .storeAnimeDetails(providerId, details)
      .catch(() => undefined);

    return details;
  }
}
