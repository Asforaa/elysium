import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/anime')({
  component: AnimeRoute,
});

function AnimeRoute() {
  return <Outlet />;
}
