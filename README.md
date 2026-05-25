# Elysium

<p align="center">
  <img src="./branding/splash.png" alt="Elysium splash" width="100%">
</p>

Elysium is my private media center: a local-first place to import, organize, watch, and track movies, series, anime, episodes, downloads, and playback progress.

Elysium is a private, selfhostable local media download hub for personal use.

The goal is to provide one local web app where I can search supported public media sites, open a media page, see every available episode/download option grouped by quality and provider, and download the file directly from the local UI with one click.

This is not a public product. It is a personal project for my own local/selfhosted setup.

## Project Direction

Elysium should behave like a normal web app:

1. Search a main media provider.
2. Open a media result.
3. List available episodes or media pieces.
4. Open an episode/media item.
5. Extract all public download options from the main provider.
6. Group options by quality, provider, and source.
7. Resolve provider links internally.
8. Start downloads directly from the local UI.
9. Track download status, progress, provider, quality, file name, and local destination.

The first main provider is:

- WitAnime: <https://witanime.life/>

More main providers can be added later. The long-term model is provider redundancy: if one main provider fails, Elysium should be able to try another internal provider adapter rather than pushing me into manual external fallback flows.

## Important Boundary

This project is only for public download links that are already exposed by the media websites.

Do not design this as a bypass tool. Do not add DRM bypassing, paywall bypassing, login automation, captcha automation, account abuse, or provider restriction evasion. The current target flow is public: no login, no captcha, no private credentials.

## Current Stack Decision

Package manager / monorepo:

- Bun for all package management and script execution.
- Turborepo with Bun workspaces.
- App projects live under `apps/*`.
- Shared packages can live under `packages/*` later.
- Vercel is configured at the repo root for the Vite frontend using Bun install/build commands.
- Portless is configured for stable local development URLs.

Frontend:

- Normal client-side TanStack stack.
- Do not use TanStack Start.
- Use TanStack Router for routing if/when routing is needed.
- Use TanStack Query for API state, server state, retries, caching, and refresh.
- Use TanStack Table where dense provider/download/queue tables make sense.
- Keep the UI as a client web app talking to the local API.
- Anime detail URLs use TanStack Router at `/anime/$animeId/$slug`.
- Episode playback URLs use TanStack Router at `/anime/$animeId/$slug/episode/$episodeNumber`.
- `/downloads` shows completed local files grouped by anime metadata instead of as loose filenames.
- The AniList numeric ID is the canonical route parameter; the slug is cosmetic and human-readable.
- Direct-loading an anime URL should fetch AniList metadata by ID, then search source adapters from that metadata title.

Backend:

- NestJS.
- PostgreSQL.
- Backend owns metadata adapters, source provider adapters, link resolution, download queue, download execution, persistence, and filesystem interaction.
- Auth users and sessions are persisted in PostgreSQL so local accounts survive backend restarts.
- Playback progress is a backend-owned persisted API so continue-watching features can be built without changing the provider adapters.
- Local files stream through the backend with HTTP range support so browser players can seek downloaded media.

Metadata:

- AniList is the source of truth for anime names, episode counts, artwork, descriptions, genres, studios, characters, and other canonical anime metadata.
- The frontend uses AniList autocomplete first.
- After selecting an AniList entry, Elysium uses the selected anime title to search source/download adapters like WitAnime.
- AniList prequel/sequel relations appear as `Previous` and `Next` cards, and selecting one triggers the same source-adapter search flow.

Current app packages:

- `@elysium/web` in `apps/web`
- `@elysium/api` in `apps/api`
- `@elysium/shared` in `packages/shared`

Useful commands:

```bash
bun install
bun run dev
bun run build
bun run check
bun run web:dev
bun run api:dev
bun run dev:portless
bun run web:dev:portless
bun run api:dev:portless
bun run lint
bun run lint:strict
bun run --filter @elysium/web routes:generate
bun run db:start
bun run db:ping
bun run db:stop
bun run --filter @elysium/api smoke:witanime -- Akane-banashi 5
bun run --filter @elysium/api smoke:anilist -- Akane-banashi
bun run --filter @elysium/api smoke:download-connections -- Akane-banashi 5
bun run --filter @elysium/api downloads:finalize
```

`bun run lint` is advisory. Use `bun run check` and `bun run build` as the hard correctness gates, and reserve `bun run lint:strict` for intentional cleanup passes.

Recommended later additions:

- Shared TypeScript types between frontend and backend.
- A background worker or queue module for download jobs.
- Provider-specific resolver modules.

## Download Worker Direction

Gopeed is out of scope for now. Elysium owns the active download worker inside the NestJS backend.

Reasoning:

- Host resolvers already need provider-specific headers, cookies, and expiry handling.
- A local in-code worker keeps download state, filesystem writes, and progress tracking in one place.
- The current worker uses concurrent HTTP range requests when a host supports `Range`, and falls back to a normal stream when it does not.
- Mega stays on a custom local path through `megajs` because Mega file URLs are encrypted chunk streams, not plain direct HTTP links.
- After the raw provider download finishes, the backend finalizes the local file:
  - detects archives such as zip files by extension or file signature
  - extracts the primary media file from zip archives
  - deletes the archive only after a successful extraction
  - renames the final playable file to `Title - EP 00 - QUALITY.ext`
  - updates the persisted download job and `local_media_files` row to point at the final file
  - removes interrupted partial files so failed segmented downloads do not leave broken archives behind

The current shape is:

```text
Source adapter -> Host resolver -> Local downloader -> Local file
```

Runtime knobs:

- `ELYSIUM_DOWNLOAD_DIR` controls where the backend saves files.
- `ELYSIUM_DOWNLOAD_CONNECTIONS` controls HTTP range-download concurrency. It defaults to `6` and is clamped between `1` and `16`.

The app creates persisted download jobs through the local API:

- `POST /downloads` starts a job from a structured download option.
- `GET /downloads` lists tracked jobs for the UI.
- `GET /downloads/:id` reads a single job.
- `POST /downloads/:id/retry` creates a new attempt under the same persisted job.
- `GET /library/files` lists completed local media files seeded from successful downloads.
- `GET /library/anime` lists completed downloads grouped by anime metadata.
- `GET /library/files/:id/stream` streams a downloaded file with byte-range support.
- `POST /playback/progress` saves local or source-episode playback progress.
- `GET /playback/continue-watching` lists partially watched entries for a future resume UI.

Download jobs are persisted in PostgreSQL. The backend stores the original
download option, optional AniList/media context, resolved file metadata,
attempt count, progress, errors, completion timestamps, and the final local
file path. Completed downloads seed `local_media_files`, which is the first
piece of the local library model.

If older completed jobs still point at raw provider names or archives, run:

```bash
bun run --filter @elysium/api downloads:finalize
```

This re-applies the same finalization rules to completed local files.

Current supported host buttons in the UI:

- MediaFire
- Google Drive
- Workupload
- mp4upload
- GoFile
- Mega

The first smoke test for this layer is:

```bash
bun run --filter @elysium/api smoke:download-connections -- Akane-banashi 5
```

This fetches current source-provider options, resolves the final file connection where possible, and prints the direct URL/filename/size metadata without starting a real persisted download job yet.

## Why Backend First-Class Matters

The browser should not directly scrape or download from media providers.

The frontend should talk to the local backend only:

```text
Frontend UI -> Local NestJS API -> Metadata provider adapters
Frontend UI -> Local NestJS API -> Source provider adapters -> Host provider resolvers -> Download engine -> Local files
```

This avoids CORS issues, keeps cookies/session behavior isolated if ever needed, allows reliable download progress tracking, and keeps provider-specific parsing out of the UI.

## Core Domain Model

Likely entities:

- Metadata provider: an anime metadata source such as AniList.
- Source provider: the main site being searched, such as WitAnime.
- Media item: an anime/show/movie returned by a source provider.
- Episode/media piece: a downloadable/watchable unit under a media item.
- Streaming option: an embeddable source-player URL extracted from a provider episode page.
- Quality group: SD, HD, FHD, or other provider-specific labels.
- Host provider: MediaFire, GoFile, Workupload, mp4upload, MEGA, Google Drive, etc.
- Download option: a single combination of source provider, episode, quality, and host provider.
- Resolved file: the provider-resolved downloadable file information.
- Download job: a queued/running/completed/failed local download.

## Initial Feature List

Provider discovery:

- Search AniList with autocomplete.
- Use AniList as the canonical anime metadata source.
- Show AniList title, descriptions, cover/banner artwork, metadata, genres, studios, and characters.
- Show AniList prequel/sequel relations between anime metadata and source results.
- Search supported main providers.
- Show search results with title, image, type/status, and source provider.
- Open a media item from search results.
- Show metadata from the source provider.
- Show episodes/media pieces.
- Open an episode/media piece.
- Extract all download options grouped by quality.
- Extract streaming embed options where the source provider exposes public episode players.
- Prefer local downloaded playback when the episode file exists, otherwise show the source-provider embed.
- Normalize provider names, including typos from the source site.

Download UX:

- One-click download from any option.
- Show selected source provider, quality, host provider, file name, status, speed, ETA, and destination.
- Retry failed downloads.
- Preserve download history.
- Show downloaded anime under `/downloads` with the anime metadata and saved episodes attached.
- Allow choosing default download directory later.
- Prefer internal provider resolution over opening external pages.

Playback UX:

- Use ReactPlayer for local downloaded file playback in the web app.
- Render source-provider streaming hosts as iframes because those hosts are already full embed/player pages.
- Store playback progress through the backend for continue-watching features such as partially watched files, progress percentage, and quick resume.

Provider adapter system:

- Source providers should be pluggable.
- Host provider resolvers should be pluggable.
- Source-provider search should fan out through the backend registry instead of being hardcoded in the frontend.
- A source provider returns structured download options.
- A host resolver turns a host page URL into a direct downloadable file or a supported command/engine job.
- If one source provider fails later, Elysium should be able to try another source provider internally.

Persistence:

- PostgreSQL stores media cache, discovered options, resolved file metadata, jobs, job attempts, errors, and settings.
- Store enough data to debug provider breakage without needing to repeat the browser flow every time.
- Local development uses a project-local Postgres cluster under `.local/postgres`.
- Default local connection:
  - `postgresql://asforaa@127.0.0.1:55432/elysium`

UI:

- The frontend is a plain shadcn/ui surface.
- Current shadcn preset: `b5ckPXiR0` (`radix-vega`, zinc base, teal theme, Inter font, lucide icons).
- Do not make it fancy by default.
- Use shadcn components as-is and compose simple custom pieces from those components and normal layout elements.

## First Provider Research: WitAnime

Date checked: 2026-05-25.

Test flow used:

1. Opened <https://witanime.life/> with Playwright.
2. Opened the header search.
3. Searched for `Akane-banashi`.
4. Search navigated to:
   - `https://witanime.life/?search_param=animes&s=Akane-banashi`
5. Clicked the result:
   - `https://witanime.life/anime/akane-banashi/`
6. Opened episode 5:
   - `https://witanime.life/episode/akane-banashi-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-5/`
7. Found the download section grouped by quality.
8. Clicked the HD MediaFire option.
9. It opened a public MediaFire page:
   - `https://www.mediafire.com/file/k9t2grrtfa5z8se/%5BWitanime.com%5D+AB+EP+05+HD.zip/file`
10. MediaFire exposed a normal `Download file` link on that page.

Observed WitAnime search behavior:

- Header search submits a normal query.
- Query parameter shape:
  - `search_param=animes`
  - `s=<query>`
- Search results contain anime card links like:
  - `/anime/akane-banashi/`

Observed WitAnime anime page behavior:

- The anime page may render the episode grid dynamically.
- The HTML includes `encodedEpisodeData`, a base64-encoded JSON array.
- For `Akane-banashi`, it decoded into episode numbers and URLs for episodes 1-8.
- This is a strong first target for the `WitAnimeSourceAdapter.getEpisodes()` implementation.

Observed WitAnime episode page behavior:

- Episode pages contain a download section titled `روابط تحميل الحلقة`.
- Download options are grouped by Arabic quality labels:
  - `الجودة المتوسطة SD`
  - `الجودة العالية HD`
  - `الجودة الخارقة FHD`
- Each quality group had host buttons:
  - `mediafire`
  - `workupload`
  - `mp4upload`
  - `gofile`
- One FHD label was observed as `mediafir`, so provider normalization should handle source typos.
- Download anchor `href` values are `#`; the real URLs are decoded client-side.
- Buttons have `data-index` values.
- The page defines `_m`, `_p0.._pN`, `_s`, `_a`, and `_t` variables.
- `px9.js` wires `.download-link` click handlers, decodes the indexed URL, and opens it with `window.open(resource, '_blank')`.
- So the backend can reproduce this decoding logic without browser clicks.

Example decoded episode 5 download resources:

```text
0  SD  mediafire   https://www.mediafire.com/file/j7fpl7v1ut9tujt/%5BWitanime.com%5D+AB+EP+05+SD.zip/file
1  SD  workupload  https://workupload.com/file/FktdMSpasXG
2  SD  mp4upload   https://www.mp4upload.com/clymq2p9dgc4
3  SD  gofile      https://gofile.io/d/CjqHp3
4  HD  mediafire   https://www.mediafire.com/file/k9t2grrtfa5z8se/%5BWitanime.com%5D+AB+EP+05+HD.zip/file
5  HD  workupload  https://workupload.com/file/SrCTaK4kM9k
6  HD  mp4upload   https://www.mp4upload.com/acohcj5i1ijk
7  HD  gofile      https://gofile.io/d/5DFA2k
8  FHD mediafire   https://www.mediafire.com/file/x7017xwit6nivb7/%5BWitanime.com%5D+AB+EP+05+FHD.zip/file
9  FHD workupload  https://workupload.com/file/QeVQAX2CjUM
10 FHD mp4upload   https://www.mp4upload.com/ihvhnxuf5gl9
11 FHD gofile      https://gofile.io/d/NK1dIk
```

These sample links are research examples. Resolver code should always fetch fresh page data.

## WitAnime Adapter Shape

Initial source adapter methods:

```ts
interface SourceProviderAdapter {
  search(query: string): Promise<MediaSearchResult[]>;
  getMediaDetails(mediaUrl: string): Promise<MediaDetails>;
  getEpisodes(mediaUrl: string): Promise<EpisodeSummary[]>;
  getDownloadOptions(episodeUrl: string): Promise<DownloadOption[]>;
  getStreamingOptions?(episodeUrl: string): Promise<StreamingOption[]>;
}
```

For WitAnime:

- `search(query)` can request `/?search_param=animes&s=${query}` and parse result cards.
- `getMediaDetails(mediaUrl)` can parse the anime detail page metadata.
- `getEpisodes(mediaUrl)` can decode `encodedEpisodeData` from the anime page.
- `getDownloadOptions(episodeUrl)` can parse quality groups and decode the `px9.js` resources by `data-index`.
- `getStreamingOptions(episodeUrl)` can parse `#episode-servers .server-link` and decode `_zG` / `_zH` embed resources.

## Host Resolver Notes

Start with the easiest host providers from the observed WitAnime flow:

- MediaFire
- GoFile
- Workupload
- mp4upload
- Mega

MediaFire looked straightforward in the first browser check:

- WitAnime opens a public MediaFire file page.
- MediaFire page contains a visible `Download file` anchor.
- The direct URL may be time-limited, so the resolver should resolve it right before enqueueing/downloading.

Current resolver behavior:

- MediaFire resolves the visible download anchor into a direct HTTP file URL.
- Google Drive follows the public confirmation form into a direct HTTP file URL.
- Workupload performs the same public client-side wait/check flow the page runs, reads `/api/file/getDownloadServer/:id`, and carries the returned cookie to the final subdomain URL.
- mp4upload submits the public `download1` form, then the visible `Download Now`/`download2` form, and uses the 302 location as the direct HTTP file URL.
- GoFile creates a public guest session through the website API, generates the website token the same way the loaded page script does, and passes the bearer header through to the worker.
- Mega is not plain HTTP after the page button; it is encrypted chunk streaming. Elysium resolves file metadata with `megajs` and downloads it through the backend's custom Mega path.

Each host resolver should return structured output:

```ts
interface ResolvedDownload {
  provider: string;
  sourceUrl: string;
  directUrl?: string;
  filename?: string;
  sizeBytes?: number;
  expiresAt?: string;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  engine: "http" | "provider-cli" | "custom";
}
```

## Early Milestones

Milestone 1:

- Create the monorepo/app skeleton.
- Set up frontend client app with TanStack Query/Router.
- Set up NestJS backend.
- Set up PostgreSQL config.
- Add shared types.

Milestone 2:

- Implement WitAnime search.
- Implement media details and episode listing.
- Implement episode download option extraction and grouping.
- Show all options in the UI.

Milestone 3:

- Implement MediaFire resolver.
- Implement download queue and local HTTP download execution.
- Show progress in UI.

Milestone 4:

- Add GoFile, Workupload, and mp4upload resolvers.
- Add provider retry logic.
- Add persisted job history.

Milestone 5:

- Add more main source providers.
- Add source-provider redundancy.
- Add settings, default paths, cache refresh, and health checks.
