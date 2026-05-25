import { Injectable, NotFoundException } from '@nestjs/common';
import type { SourceProviderId } from '@elysium/shared';
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

  getAdapter(providerId: SourceProviderId): SourceProviderAdapter {
    const adapter = this.adapters.get(providerId);

    if (!adapter) {
      throw new NotFoundException(`Unknown source provider: ${providerId}`);
    }

    return adapter;
  }
}
