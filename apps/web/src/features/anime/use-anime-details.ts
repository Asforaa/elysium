import { useQuery } from "@tanstack/react-query";
import { getAnimeMetadata } from "@/lib/api";
import { hasDetails } from "@/lib/media-ui";

export function useAnimeDetails(animeId?: number) {
  const detailsQuery = useQuery({
    queryKey: ["metadata", "anilist", "anime", animeId],
    queryFn: () => getAnimeMetadata(animeId ?? 0),
    enabled: Boolean(animeId),
    staleTime: 5 * 60_000,
  });

  const anime = detailsQuery.data;
  const sourceSearchTerm = animeId && anime ? anime.sourceSearchTitle : "";
  const relations = anime && hasDetails(anime) ? (anime.relations ?? []) : [];

  return {
    anime,
    detailsQuery,
    relations,
    sourceSearchTerm,
  };
}
