import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute("/my-list/")({
  component: MyListRoute,
});

function MyListRoute() {
  return <App placeholderRoute="My List" />;
}
