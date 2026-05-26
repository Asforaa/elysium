import { useState } from "react";
import type { ChangeEvent, ComponentProps, FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import type { AnimeMetadataDetails, EpisodeSummary } from "@elysium/shared";
import {
  BRAND_MARK_SRC,
  LIBRARY_NAV_ITEMS,
  MAIN_NAV_ITEMS,
} from "@/app/constants";
import type {
  AuthDialogMode,
  MediaHomeRoute,
  SidebarItemTitle,
  SidebarNavItem,
  SidebarRoutePath,
} from "@/app/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getAuthSession, loginUser, logoutUser, signupUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  formatEpisodeTitle,
  getMediaHomeRouteTitle,
  toAnimeSlug,
} from "@/lib/media-ui";

const PROFILE_PHOTO_SIZE = 256;
const PROFILE_PHOTO_QUALITY = 0.82;
const MAX_PROFILE_PHOTO_SOURCE_BYTES = 10 * 1024 * 1024;

export function AppBreadcrumbs({
  anime,
  animeSearchRoute,
  currentlyWatchingRoute,
  downloadsRoute,
  mediaHomeRoute,
  placeholderRoute,
  routeEpisodeNumber,
  selectedAnimeId,
  selectedEpisode,
}: {
  anime?: AnimeMetadataDetails;
  animeSearchRoute: boolean;
  currentlyWatchingRoute: boolean;
  downloadsRoute: boolean;
  mediaHomeRoute?: MediaHomeRoute;
  placeholderRoute?: SidebarItemTitle;
  routeEpisodeNumber?: string;
  selectedAnimeId?: number;
  selectedEpisode?: EpisodeSummary;
}) {
  const animeTitle = anime?.displayTitle;
  const episodeLabel = routeEpisodeNumber
    ? selectedEpisode
      ? formatEpisodeTitle(selectedEpisode)
      : `Episode ${routeEpisodeNumber}`
    : undefined;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {downloadsRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">Downloads</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {currentlyWatchingRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">
              Currently Watching
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {!downloadsRoute && !currentlyWatchingRoute && mediaHomeRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">
              {getMediaHomeRouteTitle(mediaHomeRoute)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {!downloadsRoute &&
        !currentlyWatchingRoute &&
        !mediaHomeRoute &&
        placeholderRoute ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">
              {placeholderRoute}
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}

        {!downloadsRoute &&
        !currentlyWatchingRoute &&
        !mediaHomeRoute &&
        !placeholderRoute &&
        animeSearchRoute ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">Search</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {!downloadsRoute &&
        !currentlyWatchingRoute &&
        !mediaHomeRoute &&
        !placeholderRoute &&
        !animeSearchRoute &&
        anime ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              {episodeLabel ? (
                <BreadcrumbLink asChild className="truncate">
                  <Link
                    params={{
                      animeId: String(anime.id),
                      slug: toAnimeSlug(anime),
                    }}
                    to="/anime/$animeId/$slug"
                  >
                    {animeTitle}
                  </Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate">
                  {animeTitle}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {episodeLabel ? (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">
                    {episodeLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </>
        ) : null}

        {!downloadsRoute &&
        !currentlyWatchingRoute &&
        !mediaHomeRoute &&
        !placeholderRoute &&
        !animeSearchRoute &&
        !anime &&
        selectedAnimeId ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/anime">Anime</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">Loading</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}

        {!downloadsRoute &&
        !currentlyWatchingRoute &&
        !mediaHomeRoute &&
        !placeholderRoute &&
        !animeSearchRoute &&
        !selectedAnimeId &&
        !anime ? (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">Home</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function ElysiumSidebar({
  activeItem,
  overlay = false,
  onNavigate,
}: {
  activeItem: SidebarItemTitle;
  overlay?: boolean;
  onNavigate: (path: SidebarRoutePath) => void;
}) {
  return (
    <Sidebar collapsible={overlay ? "offcanvas" : "icon"} overlay={overlay}>
      <SidebarHeader className="px-3 py-4">
        <div className="flex h-9 items-center gap-2 rounded-md px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <button
            aria-label="Go to home"
            className="flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center"
            type="button"
            onClick={() => onNavigate("/home")}
          >
            <img
              alt=""
              className="size-8 shrink-0 object-contain"
              src={BRAND_MARK_SRC}
            />
            <span className="font-brand truncate text-xl font-normal leading-none group-data-[collapsible=icon]:hidden">
              Elysium
            </span>
          </button>
          <SidebarTrigger className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent className="py-3">
        <SidebarNavSection
          activeItem={activeItem}
          items={MAIN_NAV_ITEMS}
          label="Home"
          onNavigate={onNavigate}
        />
        <SidebarNavSection
          activeItem={activeItem}
          items={LIBRARY_NAV_ITEMS}
          label="Library"
          onNavigate={onNavigate}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function SidebarNavSection({
  activeItem,
  items,
  label,
  onNavigate,
}: {
  activeItem: SidebarItemTitle;
  items: SidebarNavItem[];
  label: string;
  onNavigate: (path: SidebarRoutePath) => void;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeItem === item.title;

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  aria-current={active ? "page" : undefined}
                  isActive={active}
                  tooltip={item.title}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                >
                  <Icon fill={active ? "currentColor" : "none"} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AccountControls() {
  const [authDialogMode, setAuthDialogMode] = useState<AuthDialogMode | null>(
    null,
  );
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authProfilePhotoDataUrl, setAuthProfilePhotoDataUrl] = useState("");
  const [authProfilePhotoError, setAuthProfilePhotoError] = useState("");
  const [authProfilePhotoOptimizing, setAuthProfilePhotoOptimizing] =
    useState(false);
  const authSessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: getAuthSession,
    staleTime: 30_000,
  });
  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: () => {
      setAuthDialogMode(null);
      void authSessionQuery.refetch();
    },
  });
  const signupMutation = useMutation({
    mutationFn: signupUser,
    onSuccess: () => {
      setAuthDialogMode(null);
      void authSessionQuery.refetch();
    },
  });
  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      void authSessionQuery.refetch();
    },
  });
  const user = authSessionQuery.data?.authenticated
    ? authSessionQuery.data.user
    : undefined;
  const busy =
    authSessionQuery.isLoading ||
    loginMutation.isPending ||
    signupMutation.isPending ||
    logoutMutation.isPending ||
    authProfilePhotoOptimizing;
  const activeAuthMutation =
    authDialogMode === "signup" ? signupMutation : loginMutation;
  const authDialogTitle =
    authDialogMode === "signup" ? "Create account" : "Login";
  const authDialogDescription =
    authDialogMode === "signup"
      ? "Create a local Elysium account for this private self-hosted instance."
      : "Sign in to this local Elysium instance.";

  function openAuthDialog(mode: AuthDialogMode) {
    loginMutation.reset();
    signupMutation.reset();
    setAuthPassword("");
    setAuthProfilePhotoError("");
    setAuthDialogMode(mode);
  }

  function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const credentials = {
      email: authEmail,
      name: authName,
      password: authPassword,
      profilePhotoDataUrl:
        authDialogMode === "signup" ? authProfilePhotoDataUrl : undefined,
    };

    if (authDialogMode === "signup") {
      signupMutation.mutate(credentials);
      return;
    }

    loginMutation.mutate(credentials);
  }

  async function handleProfilePhotoChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setAuthProfilePhotoDataUrl("");
      setAuthProfilePhotoError("");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAuthProfilePhotoDataUrl("");
      setAuthProfilePhotoError("Profile photo must be an image file.");
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_SOURCE_BYTES) {
      setAuthProfilePhotoDataUrl("");
      setAuthProfilePhotoError("Profile photo must be smaller than 10 MB.");
      return;
    }

    setAuthProfilePhotoError("");
    setAuthProfilePhotoOptimizing(true);

    try {
      setAuthProfilePhotoDataUrl(await optimizeProfilePhoto(file));
    } catch (error) {
      setAuthProfilePhotoDataUrl("");
      setAuthProfilePhotoError(
        error instanceof Error
          ? error.message
          : "Could not optimize profile photo.",
      );
    } finally {
      setAuthProfilePhotoOptimizing(false);
    }
  }

  if (!user) {
    return (
      <Dialog
        open={authDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAuthDialogMode(null);
          }
        }}
      >
        <div className="flex items-center justify-end gap-2">
          <Button
            disabled={busy}
            type="button"
            variant="outline"
            onClick={() => openAuthDialog("login")}
          >
            Login
          </Button>
          <Button
            disabled={busy}
            type="button"
            onClick={() => openAuthDialog("signup")}
          >
            Sign up
          </Button>
        </div>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="items-center text-center">
            <DialogTitle className="text-2xl">{authDialogTitle}</DialogTitle>
            <DialogDescription className="max-w-sm text-center">
              {authDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleAuthSubmit}>
            {authDialogMode === "signup" ? (
              <>
                <div className="flex flex-col items-center gap-2">
                  <Input
                    accept="image/*"
                    className="sr-only"
                    disabled={authProfilePhotoOptimizing}
                    id="auth-photo"
                    type="file"
                    onChange={handleProfilePhotoChange}
                  />
                  <label
                    className={cn(
                      "cursor-pointer rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
                      authProfilePhotoOptimizing && "cursor-wait opacity-70",
                    )}
                    htmlFor="auth-photo"
                  >
                    <Avatar className="size-24 border text-xl shadow-sm">
                      {authProfilePhotoDataUrl ? (
                        <AvatarImage
                          alt="Selected profile preview"
                          src={authProfilePhotoDataUrl}
                        />
                      ) : null}
                      <AvatarFallback>
                        {createAuthPreviewInitials(authName, authEmail)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="sr-only">Choose profile photo</span>
                  </label>
                  {authProfilePhotoOptimizing ? (
                    <p className="text-xs text-muted-foreground">
                      Optimizing image...
                    </p>
                  ) : null}
                  {authProfilePhotoError ? (
                    <p className="text-xs text-destructive">
                      {authProfilePhotoError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="auth-name">
                    Name
                  </label>
                  <Input
                    autoComplete="name"
                    id="auth-name"
                    placeholder="Asforaa"
                    value={authName}
                    onChange={(event) => setAuthName(event.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-email">
                Email
              </label>
              <Input
                autoComplete="email"
                id="auth-email"
                placeholder="asforaa@elysium.local"
                required
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="auth-password">
                Password
              </label>
              <Input
                autoComplete={
                  authDialogMode === "signup"
                    ? "new-password"
                    : "current-password"
                }
                id="auth-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
              />
            </div>
            {activeAuthMutation.isError ? (
              <p className="text-sm text-destructive">
                {activeAuthMutation.error.message}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={busy} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={busy} type="submit">
                {activeAuthMutation.isPending ? "Working..." : authDialogTitle}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open account menu"
          className="rounded-full"
          size="icon"
          type="button"
          variant="outline"
        >
          <Avatar className="size-8">
            {user.profilePhotoDataUrl ? (
              <AvatarImage
                alt={`${user.name} profile photo`}
                src={user.profilePhotoDataUrl}
              />
            ) : null}
            <AvatarFallback>{user.initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User />
          My Account
        </DropdownMenuItem>
        <div className="px-1 py-1">
          <ThemeToggle
            className="h-8 w-full justify-start px-2"
            variant="ghost"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => logoutMutation.mutate()}
        >
          <LogOut />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <Button
      className={cn("w-fit", className)}
      type="button"
      variant={variant}
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      <Icon />
      {isDark ? "Light" : "Dark"}
    </Button>
  );
}

export function createAuthPreviewInitials(name: string, email: string) {
  const nameParts = name.trim().split(/\s+/u).filter(Boolean);

  if (nameParts.length) {
    return nameParts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }

  return email.trim()[0]?.toUpperCase() ?? "A";
}

async function optimizeProfilePhoto(file: File) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;

  if (!context) {
    throw new Error("Could not prepare profile photo.");
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PROFILE_PHOTO_SIZE,
    PROFILE_PHOTO_SIZE,
  );

  const blob = await canvasToBlob(canvas, "image/webp", PROFILE_PHOTO_QUALITY);

  return blobToDataUrl(blob);
}

export function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read profile photo."));
    });

    image.src = url;
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Could not optimize profile photo."));
      },
      type,
      quality,
    );
  });
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read optimized profile photo."));
    });
    reader.addEventListener("error", () => {
      reject(new Error("Could not read optimized profile photo."));
    });

    reader.readAsDataURL(blob);
  });
}
