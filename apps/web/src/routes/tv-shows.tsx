import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/tv-shows')({
  component: TvShowsRoute,
});

function TvShowsRoute() {
  return <App placeholderRoute="TV Shows" />;
}
