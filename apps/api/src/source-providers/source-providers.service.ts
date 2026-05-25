import { Injectable, NotFoundException } from '@nestjs/common';
import type { MediaSearchResult, SourceProviderId } from '@elysium/shared';
import { WitAnimeSourceAdapter } from './witanime/witanime-source.adapter';
import type { SourceProviderAdapter } from './source-provider-adapter';

@Injectable()
export class SourceProvidersService {
  private readonly adapters = new Map<SourceProviderId, SourceProviderAdapter>([
    ['witanime', new WitAnimeSourceAdapter()],
  ]);

  listProviders() {
    return Array.from(this.adapters.values()).map(
      (adapter) => adapter.provider,
    );
  }

  listAdapters() {
    return Array.from(this.adapters.values());
  }

  async searchAll(query: string): Promise<MediaSearchResult[]> {
    const searchResults = await Promise.all(
      Array.from(this.adapters.values()).map(async (adapter) => {
        try {
          return await adapter.search(query);
        } catch {
          return [];
        }
      }),
    );

    return searchResults.flat();
  }

  getAdapter(providerId: SourceProviderId): SourceProviderAdapter {
    const adapter = this.adapters.get(providerId);

    if (!adapter) {
      throw new NotFoundException(`Unknown source provider: ${providerId}`);
    }

    return adapter;
  }

  async getStreamingOptions(providerId: SourceProviderId, episodeUrl: string) {
    const adapter = this.getAdapter(providerId);

    if (!adapter.getStreamingOptions) {
      return [];
    }

    return adapter.getStreamingOptions(episodeUrl);
  }
}
