import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute(
  "/anime/$animeId/$slug/episode/$episodeNumber/",
)({
  component: EpisodeRoute,
});

function EpisodeRoute() {
  const { animeId, episodeNumber, slug } = Route.useParams();

  return (
    <App
      key={`${animeId}-${slug}-${episodeNumber}`}
      routeAnimeId={Number(animeId)}
      routeAnimeSlug={slug}
      routeEpisodeNumber={episodeNumber}
    />
  );
}
