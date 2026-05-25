import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/downloads')({
  component: DownloadsRoute,
});

function DownloadsRoute() {
  return <App downloadsRoute />;
}
