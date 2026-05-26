import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/anime/')({
  component: AnimeIndexRoute,
});

function AnimeIndexRoute() {
  return <App mediaHomeRoute="anime" />;
}
