import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/home')({
  component: HomeRoute,
});

function HomeRoute() {
  return <App />;
}
