import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/anime/$animeId/$slug')({
  component: AnimeRoute,
});

function AnimeRoute() {
  return <Outlet />;
}
