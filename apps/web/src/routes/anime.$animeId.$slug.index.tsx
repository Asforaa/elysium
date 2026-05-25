import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/anime/$animeId/$slug/')({
  component: AnimeDetailRoute,
});

function AnimeDetailRoute() {
  const { animeId, slug } = Route.useParams();

  return (
    <App
      key={`${animeId}-${slug}-details`}
      routeAnimeId={Number(animeId)}
      routeAnimeSlug={slug}
    />
  );
}
