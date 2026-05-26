import { createFileRoute } from "@tanstack/react-router";
import App from "@/App";

export const Route = createFileRoute("/favourites/")({
  component: FavouritesRoute,
});

function FavouritesRoute() {
  return <App placeholderRoute="Favourites" />;
}
