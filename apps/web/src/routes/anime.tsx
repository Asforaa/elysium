import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/anime')({
  component: AnimeRoute,
});

function AnimeRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === '/anime' || pathname === '/anime/') {
    return <App placeholderRoute="Anime" />;
  }

  return <Outlet />;
}
