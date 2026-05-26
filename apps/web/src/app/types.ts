import type { LucideIcon } from "lucide-react";
import type { DownloadMediaContext, DownloadOption } from "@elysium/shared";

export type SidebarItemTitle =
  | "Home"
  | "Anime"
  | "TV Shows"
  | "Movies"
  | "My List"
  | "Favourites"
  | "Watch Later"
  | "Downloads"
  | "My Account";

export type SidebarRoutePath =
  | "/home"
  | "/anime"
  | "/tv-shows"
  | "/movies"
  | "/my-list"
  | "/favourites"
  | "/watch-later"
  | "/downloads"
  | "/account";

export type MediaHomeRoute = "anime" | "movies" | "tv-shows";

export type SidebarNavItem = {
  icon: LucideIcon;
  path: SidebarRoutePath;
  title: SidebarItemTitle;
};

export type AuthDialogMode = "login" | "signup";

export type FocusedImage = {
  alt: string;
  src: string;
};

export type StartDownloadInput = {
  mediaContext?: DownloadMediaContext;
  option: DownloadOption;
};

export type DownloadQualityGroup = {
  label: string;
  options: DownloadOption[];
  quality: DownloadOption["quality"];
};
