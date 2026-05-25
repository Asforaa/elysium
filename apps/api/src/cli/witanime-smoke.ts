import type { ProviderSmokeResult } from '@elysium/shared';
import { WitAnimeSourceAdapter } from '../source-providers/witanime/witanime-source.adapter';

const query = process.argv[2] ?? 'Akane-banashi';
const preferredEpisode = process.argv[3] ?? '5';

async function main() {
  const adapter = new WitAnimeSourceAdapter();
  const searchResults = await adapter.search(query);
  const selectedMedia = searchResults[0];

  if (!selectedMedia) {
    throw new Error(`No WitAnime search results for "${query}"`);
  }

  const episodes = await adapter.getEpisodes(selectedMedia.url);
  const selectedEpisode =
    episodes.find((episode) => episode.number === preferredEpisode) ??
    episodes.at(-1);

  if (!selectedEpisode) {
    throw new Error(`No episodes found for "${selectedMedia.title}"`);
  }

  const downloadOptions = await adapter.getDownloadOptions(selectedEpisode.url);
  const result: ProviderSmokeResult = {
    provider: adapter.provider.id,
    query,
    selectedMedia,
    selectedEpisode,
    resultCount: searchResults.length,
    episodeCount: episodes.length,
    downloadOptionCount: downloadOptions.length,
    downloadOptions,
  };

  console.log(JSON.stringify(result, null, 2));
  console.table(
    downloadOptions.map((option) => ({
      quality: option.quality,
      provider: option.hostProvider,
      label: option.providerLabel,
      url: option.providerUrl,
    })),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`WitAnime smoke test failed: ${message}`);
  process.exitCode = 1;
});
