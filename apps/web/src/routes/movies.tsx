import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/movies')({
  component: MoviesRoute,
});

function MoviesRoute() {
  return <App mediaHomeRoute="movies" />;
}
