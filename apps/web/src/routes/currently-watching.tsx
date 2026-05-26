import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/currently-watching')({
  component: CurrentlyWatchingRoute,
});

function CurrentlyWatchingRoute() {
  return <App currentlyWatchingRoute />;
}
