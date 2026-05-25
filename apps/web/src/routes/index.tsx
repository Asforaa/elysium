import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/')({
  component: IndexRoute,
});

function IndexRoute() {
  return <App />;
}
