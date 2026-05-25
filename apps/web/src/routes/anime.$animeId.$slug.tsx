import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/anime/$animeId/$slug')({
  component: AnimeRoute,
});

function AnimeRoute() {
  const { animeId, slug } = Route.useParams();

  return (
    <App
      key={`${animeId}-${slug}`}
      routeAnimeId={Number(animeId)}
      routeAnimeSlug={slug}
    />
  );
}
