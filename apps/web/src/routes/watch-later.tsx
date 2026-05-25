import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/watch-later')({
  component: WatchLaterRoute,
});

function WatchLaterRoute() {
  return <App placeholderRoute="Watch Later" />;
}
