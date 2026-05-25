import { AniListMetadataAdapter } from '../metadata-providers/anilist/anilist-metadata.adapter';

const query = process.argv.slice(2).join(' ').trim() || 'Akane-banashi';

const adapter = new AniListMetadataAdapter();

async function main() {
  const results = await adapter.searchAnime(query);
  const selected = results[0];
  const details = selected
    ? await adapter.getAnimeDetails(selected.id)
    : undefined;

  console.log(
    JSON.stringify(
      {
        provider: adapter.provider.id,
        query,
        resultCount: results.length,
        selected,
        characterCount: details?.characters.length ?? 0,
        details,
      },
      null,
      2,
    ),
  );

  if (details) {
    console.table(
      details.characters.map((character) => ({
        role: character.role,
        name: character.name,
        voiceActors: character.voiceActors
          .map((voiceActor) => voiceActor.name)
          .join(', '),
      })),
    );
  }
}

void main();
