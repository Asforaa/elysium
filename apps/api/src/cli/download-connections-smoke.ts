import type { DownloadOption } from '@elysium/shared';
import { DownloadConnectionResolver } from '../download-engine/download-connection-resolver';
import { SourceProvidersService } from '../source-providers/source-providers.service';

const query = process.argv[2] ?? 'Akane-banashi';
const preferredEpisode = process.argv[3] ?? '5';

interface ProviderResolutionSmoke {
  provider: string;
  query: string;
  selectedMedia?: string;
  selectedEpisode?: string;
  optionCount: number;
  resolvedCount: number;
  unsupportedCount: number;
  failedCount: number;
  options: Awaited<ReturnType<DownloadConnectionResolver['resolve']>>[];
}

async function main() {
  const sources = new SourceProvidersService();
  const resolver = new DownloadConnectionResolver();
  const results: ProviderResolutionSmoke[] = [];

  for (const adapter of sources.listAdapters()) {
    const searchResults = await adapter.search(query);
    const selectedMedia = searchResults[0];

    if (!selectedMedia) {
      results.push(emptyProviderResult(adapter.provider.id, query));
      continue;
    }

    const episodes = await adapter.getEpisodes(selectedMedia.url);
    const selectedEpisode =
      episodes.find((episode) => episode.number === preferredEpisode) ??
      episodes.at(-1);

    if (!selectedEpisode) {
      results.push(
        emptyProviderResult(adapter.provider.id, query, selectedMedia.title),
      );
      continue;
    }

    const options = await adapter.getDownloadOptions(selectedEpisode.url);
    const resolvedOptions = await resolveOptions(options, resolver);

    results.push({
      provider: adapter.provider.id,
      query,
      selectedMedia: selectedMedia.title,
      selectedEpisode: selectedEpisode.title,
      optionCount: options.length,
      resolvedCount: resolvedOptions.filter(
        (option) => option.status === 'resolved',
      ).length,
      unsupportedCount: resolvedOptions.filter(
        (option) => option.status === 'unsupported',
      ).length,
      failedCount: resolvedOptions.filter(
        (option) => option.status === 'failed',
      ).length,
      options: resolvedOptions,
    });
  }

  console.log(JSON.stringify(results.map(toPrintableResult), null, 2));
  console.table(
    results.flatMap((result) =>
      result.options.map((option) => ({
        source: result.provider,
        quality: option.option.quality,
        host: option.option.hostProvider,
        status: option.status,
        filename: option.resolved?.filename,
        sizeMB: option.resolved?.sizeBytes
          ? Math.round(option.resolved.sizeBytes / 1024 / 1024)
          : undefined,
        message: option.message,
        directUrl: option.resolved?.directUrl,
      })),
    ),
  );
}

async function resolveOptions(
  options: DownloadOption[],
  resolver: DownloadConnectionResolver,
) {
  return Promise.all(options.map((option) => resolver.resolve(option)));
}

function emptyProviderResult(
  provider: string,
  providerQuery: string,
  selectedMedia?: string,
): ProviderResolutionSmoke {
  return {
    provider,
    query: providerQuery,
    selectedMedia,
    optionCount: 0,
    resolvedCount: 0,
    unsupportedCount: 0,
    failedCount: 0,
    options: [],
  };
}

function toPrintableResult(result: ProviderResolutionSmoke) {
  return {
    ...result,
    options: result.options.map((option) => ({
      option: option.option,
      status: option.status,
      message: option.message,
      resolved: option.resolved
        ? {
            directUrl: option.resolved.directUrl,
            engine: option.resolved.engine,
            filename: option.resolved.filename,
            sizeBytes: option.resolved.sizeBytes,
          }
        : undefined,
    })),
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Download connection smoke test failed: ${message}`);
  process.exitCode = 1;
});
