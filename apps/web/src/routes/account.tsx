import { createFileRoute } from '@tanstack/react-router';
import App from '@/App';

export const Route = createFileRoute('/account')({
  component: AccountRoute,
});

function AccountRoute() {
  return <App placeholderRoute="My Account" />;
}
