import { createFileRoute, useLocation } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/anime/$animeId/$slug')({
  component: AnimeRoute,
});

function AnimeRoute() {
  const { animeId, slug } = Route.useParams();
  const location = useLocation();
  const episodeNumber = getEpisodeNumberFromPath(location.pathname);

  return (
    <App
      key={`${animeId}-${slug}-${episodeNumber ?? 'details'}`}
      routeAnimeId={Number(animeId)}
      routeAnimeSlug={slug}
      routeEpisodeNumber={episodeNumber}
    />
  );
}

function getEpisodeNumberFromPath(pathname: string) {
  const match = pathname.match(/\/episode\/([^/]+)$/u);

  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
