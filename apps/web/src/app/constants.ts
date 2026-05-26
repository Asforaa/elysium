import {
  Clapperboard,
  Clock,
  Download,
  Film,
  Heart,
  Home,
  Plus,
  Tv,
  User,
} from "lucide-react";
import type { SidebarNavItem } from "./types";

export const EMPTY_ARRAY = [];
export const BRAND_MARK_SRC = "/brand/elysium-logo-mark.png";
export const HOME_NEW_POPULAR_TITLE = "New & Popular This Season";

export const SEARCH_FILTERS = [
  { label: "Genres", value: "Any" },
  { label: "Year", value: "Any" },
  { label: "Season", value: "Any" },
  { label: "Format", value: "Any" },
  { label: "Airing Status", value: "Any" },
];

export const MAIN_NAV_ITEMS: SidebarNavItem[] = [
  { title: "Home", icon: Home, path: "/home" },
  { title: "Anime", icon: Clapperboard, path: "/anime" },
  { title: "TV Shows", icon: Tv, path: "/tv-shows" },
  { title: "Movies", icon: Film, path: "/movies" },
  { title: "My List", icon: Plus, path: "/my-list" },
];

export const LIBRARY_NAV_ITEMS: SidebarNavItem[] = [
  { title: "Favourites", icon: Heart, path: "/favourites" },
  { title: "Watch Later", icon: Clock, path: "/watch-later" },
  { title: "Downloads", icon: Download, path: "/downloads" },
  { title: "My Account", icon: User, path: "/account" },
];
