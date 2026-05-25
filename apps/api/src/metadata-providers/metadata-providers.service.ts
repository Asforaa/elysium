import { Injectable, NotFoundException } from '@nestjs/common';
import type { MetadataProviderId } from '@elysium/shared';
import { AniListMetadataAdapter } from './anilist/anilist-metadata.adapter';
import type { MetadataProviderAdapter } from './metadata-provider-adapter';

@Injectable()
export class MetadataProvidersService {
  private readonly adapters = new Map<
    MetadataProviderId,
    MetadataProviderAdapter
  >([['anilist', new AniListMetadataAdapter()]]);

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
}
