# AGENTS.md - Elysium

These instructions apply inside `/home/asforaa/dev/projects/Elysium`.

## Project Identity

Elysium is a private, selfhostable local media download hub for Asforaa's personal use only.

The app should let the user search supported public media providers, open a media item, inspect episodes/media pieces, extract public download options grouped by quality and host provider, and download directly through the local UI.

This is not a public SaaS, not a polished public open-source release, and not a generic downloader product. Keep decisions optimized for a personal local/selfhosted workflow.

## Legal / Safety Boundary

The user explicitly stated the target sites expose public download links with no login, no captcha, and no restriction bypassing.

Do not add or suggest:

- DRM bypassing
- paywall bypassing
- login/session theft
- captcha bypassing
- account automation
- anti-abuse evasion
- provider restriction bypassing

The correct model is: automate and organize public links that the source site already exposes.

## Stack Decisions

Commit behavior:

- Automatically create a local git commit after meaningful project changes.
- Do not push unless the user explicitly asks.
- Stage only files touched for the current logical change, and do not stage unrelated user work.
- Use best-practice conventional commit subjects, such as `feat: add provider registry` or `fix: normalize mediafire provider names`.
- For meaningful multi-part changes, use a clear commit body with bullet points, for example:

```text
chore: scaffold Bun Turborepo workspace

- add Vite React frontend app
- add NestJS backend app
- configure Turbo and Vercel for Bun
```

Private project knowledge behavior:

- After every meaningful architecture, feature-progression, feature-set, general-logic, planning, or high-level codebase direction change, update the ignored `/docs` folder with the durable context.
- Put the note in an existing doc when the topic already has a home; create a new doc only when the context does not fit cleanly anywhere else.
- Do not document small implementation-only changes such as a minor UI tweak, a narrow API adjustment, a simple bug fix, or other low-context code edits unless they change how future agents should understand the project.
- If the change is important enough to serve as a context anchor for new agent sessions, also update `AGENTS.md` with the short durable rule or pointer.
- Keep `/docs` private and ignored. Do not force-add it unless the user explicitly asks.

Package manager and runtime:

- Use Bun for all package management and script execution.
- The user's rule is: "no npm in my house."
- Do not run `npm`, `npx`, `pnpm`, or `yarn` in this project.
- Use `bun install`, `bun add`, `bun remove`, `bun run`, and `bunx --bun`.
- Keep `packageManager` pinned to Bun in the root `package.json`.
- Commit `bun.lock` when dependencies are installed.

Frontend:

- Use a normal client-only TanStack stack.
- Do not use TanStack Start.
- Use TanStack Query for server state and API interaction.
- Use TanStack Router if/when app routing is needed.
- Use TanStack Table for dense lists such as provider options, history, and queues when useful.
- The frontend talks only to the local backend API.
- Use shadcn/ui components plainly and as-is.
- Current shadcn preset is `b5ckPXiR0` (`radix-vega`, zinc base, teal theme, Inter font, lucide icons).
- Do not add fancy gradients, decorative effects, or bespoke visual styling unless the user explicitly asks.
- If a custom UI component is needed, compose it from shadcn components and simple `div`/layout elements.
- AniList drives anime autocomplete and canonical anime metadata in the UI.
- After an AniList anime is selected, use its canonical romaji/English title to search source providers such as WitAnime.
- Prefer AniList cover/banner images over source-provider images for primary media artwork.
- AniList `PREQUEL` and `SEQUEL` relations should render as `Previous` and `Next` anime cards between the metadata panel and source results.
- Selecting a related AniList anime must flow through the same source-provider search path as autocomplete selection.
- Use TanStack Router for frontend routes. Anime detail pages live at `/anime/$animeId/$slug`.
- Episode playback pages live at `/anime/$animeId/$slug/episode/$episodeNumber`; do not introduce a generic `/watch` route.
- Downloads live at `/downloads` and should show anime metadata objects with attached downloaded episodes, not only raw file rows.
- Treat the AniList numeric ID as the route source of truth. The slug is only for readable URLs and should not be required for lookups.
- Autocomplete selection and related-anime selection should navigate to the anime route, then let the route-driven page fetch AniList metadata and source-adapter matches.
- Run `bun run --filter @elysium/web routes:generate` when route files change, and commit the generated `src/routeTree.gen.ts`.

Backend:

- Use NestJS.
- Use PostgreSQL.
- Backend owns scraping/parsing, provider adapters, host resolvers, download queue, filesystem writes, persistence, and settings.
- Backend also owns metadata provider adapters such as AniList.
- Auth users and sessions are PostgreSQL-backed. Do not reintroduce in-memory-only auth state.
- Backend should expose combined source-provider operations where useful, such as `/providers/search`, so the frontend does not have to hardcode one source adapter.
- Gopeed is out of scope for now. Do not reintroduce it unless the user explicitly asks to revisit that architecture.
- Resolve host-provider pages through `apps/api/src/download-engine` before handing the result to the local downloader.
- Do not solve CAPTCHAs, logins, paywalls, or private links. Public first-party client flows that only require the same page JS to finish loading can be mirrored in a resolver when the direct browser flow is verified first.
- Source providers are code adapters. Host resolvers are shared and should be reused by every source provider that returns the same host links.
- Download jobs are persisted in PostgreSQL by the backend `download-jobs` module.
- Use `download_job_attempts` for retries and failure history. Retrying a failed/cancelled job should create a new attempt under the same job, not a random unrelated job.
- Completed downloads should seed `local_media_files` so the local library can attach files to AniList/source/episode context.
- Completed downloads should be grouped by anime through `/library/anime` and streamed through `/library/files/:id/stream` with HTTP range support.
- Playback progress belongs in the backend `playback` module and should support both local file IDs and source episode identities for continue-watching features.
- Use ReactPlayer for local downloaded files for now. Source-provider streaming hosts should be attached as iframe embeds from the provider adapter because they are already external player pages.
- Use the local backend downloader for active download execution. It should try concurrent HTTP range downloads when supported, fall back to a normal stream when not, and keep Mega on its custom local `megajs` path.
- Use `ELYSIUM_DOWNLOAD_DIR` for the local download destination and `ELYSIUM_DOWNLOAD_CONNECTIONS` for segmented HTTP concurrency.
- Completed downloads must run through `apps/api/src/download-engine/download-file-finalizer.ts` before being marked completed.
- Finalized local filenames should use `Title - EP 00 - QUALITY.ext` from AniList/source context instead of raw host filenames.
- If a provider returns a zip archive, detect it by extension or signature, extract the primary media file, update the job/library row to the extracted playable file, and delete the zip only after successful extraction.
- Interrupted/failed partial downloads should be removed from `ELYSIUM_DOWNLOAD_DIR` so corrupt preallocated archives do not accumulate or block retries.

Monorepo:

- Use Turborepo.
- Use Bun workspaces.
- Keep app projects under `apps/*`.
- Keep shared internal packages under `packages/*` when they are added.
- Vercel root config should use Bun commands only.
- Current frontend Vercel target is `@elysium/web` with output directory `apps/web/dist`.
- Current shared domain package is `@elysium/shared` in `packages/shared`.

Local database:

- Current development uses the homeserver PostgreSQL instance over Tailscale.
- The root `.env` and `apps/api/.env` are ignored and should contain the real `DATABASE_URL`.
- `apps/api/.env` exists because `bun run --filter @elysium/api ...` runs from the API package directory and does not reliably load the root `.env`.
- Current homeserver DB endpoint is Tailscale-bound at `100.67.83.68:55432`.
- Current homeserver Postgres container is `elysium-postgres`.
- Default fallback DB URL is `postgresql://asforaa@127.0.0.1:55432/elysium` on this machine.
- Start the old project-local Postgres fallback with `bun run db:start`.
- Check the active configured DB with `bun run db:ping`.
- Stop the old project-local Postgres fallback with `bun run db:stop`.
- The old project-local data directory lives under `.local/postgres` and must stay untracked.
- Run migrations with `bun run --filter @elysium/api db:migrate`.

Homeserver media:

- The homeserver media root was renamed from `/home/asforaauwu/Movies and series` to `/home/asforaauwu/Elysium Media`.
- Local development mounts that folder at `/home/asforaa/homeserver/Elysium Media`.
- Production should use the native server path and local development should use the mounted path.
- Store media paths relative to the media root whenever possible.
- The seeded media root key is `homeserver-main`.
- Treat existing media files as read-only source material until the user explicitly approves a dry-run rename/move plan.
- Desired future structure is one top-level folder per real media entity, with a stable simple Elysium media ID in names.
- Current proposed human-facing Elysium ID format is `e000001`, `e000002`, etc.
- Provider IDs such as AniList and MyAnimeList IDs should live as provider-link fields in the database, not as the primary entity identity.
- Prefer AniList romaji titles for canonical anime folder and file names. Use English only when romaji is missing or clearly unusable.
- Strip Arabic wording, source-site prefixes, short codes, and release-site noise from canonical folder and file names.
- Group related anime through AniList relations in the UI instead of relying on nested franchise folders.
- Library notes such as `Anime/Series/Re Zero/Watch Order.txt` should import into editable app notes while leaving source files untouched by default.
- Media library scanner CLI:
  - `bun run --filter @elysium/api library:scan`
  - It is dry-run/read-only for media files.
  - It writes private reports under ignored `/docs/import-reports`.
- Local anime to AniList matcher CLI:
  - `bun run --filter @elysium/api library:match-anilist`
  - It is dry-run/read-only for media files.
  - It writes private reports under ignored `/docs/match-reports`.
  - It has a manual hint layer for legacy/local titles that AniList search does not resolve well by itself, including acronym folders such as `NENTSND` and shorthand season folders such as `Xian Wang de Richang Shenghuo S2`.
  - When a local title is corrected in chat, add the durable alias/expected AniList and MAL IDs to the matcher rather than leaving the fix only in a generated report.
- Media rename planner CLI:
  - `bun run --filter @elysium/api library:plan-renames`
  - It is dry-run/read-only for media files.
  - It writes private rename manifests under ignored `/docs/rename-plans`.
  - It should have `0` target collisions and `0` existing target conflicts before any future apply step is considered.

Portless:

- Portless is installed as a dev dependency and configured in `portless.json`.
- Frontend stable name: `elysium`.
- Backend stable name: `api.elysium`.
- Use `bun run dev:portless` to run both apps through Portless from the monorepo root.
- Use `bun run web:dev:portless` or `bun run api:dev:portless` for one app.
- Keep the existing port-number scripts (`bun run web:dev`, `bun run api:dev`) working as fallback.

Provider smoke tests:

- WitAnime CLI smoke test:
  - `bun run --filter @elysium/api smoke:witanime -- Akane-banashi 5`
- This should search WitAnime, select the media, decode episodes, decode download options, and print the structured provider URLs.
- AniList CLI smoke test:
  - `bun run --filter @elysium/api smoke:anilist -- Akane-banashi`
- This should search AniList, fetch detailed anime metadata, and print characters.
- Download connection CLI smoke test:
  - `bun run --filter @elysium/api smoke:download-connections -- Akane-banashi 5`
- This should search every registered source adapter, choose an episode, extract host options, and attempt to resolve final file connections through shared host resolvers.
- Completed local download finalization:
  - `bun run --filter @elysium/api downloads:finalize`
- This should re-apply archive extraction and canonical filename rules to already completed local files.
- Media library scanner:
  - `bun run --filter @elysium/api library:scan`
- This should scan the configured media root read-only and write private reports under ignored `/docs/import-reports`.
- Local anime to AniList matcher:
  - `bun run --filter @elysium/api library:match-anilist`
- This should compare local anime groups with AniList romaji-first metadata and write private reports under ignored `/docs/match-reports`.
- For the homeserver anime library, the matcher currently expects all `96` local anime groups to resolve high-confidence after the manual hint layer is applied.
- Media rename planner:
  - `bun run --filter @elysium/api library:plan-renames`
- This should generate a read-only file move manifest using the latest AniList match report, with Elysium-owned IDs in top-level entity folders and canonical filenames such as `Title - EP 01 - FHD.mp4`, `Title - Movie - HD.mp4`, `Title - OVA 01.mp4`, and `Title - Special 01.mp4`.

Private docs:

- `/docs` exists for private, sensitive project knowledge and generated import reports.
- `/docs` is intentionally gitignored; do not force-add it unless the user explicitly asks.
- Future agents should read `/docs/README.md` when present before changing provider, downloader, database, media-library, or homeserver setup.
- Meaningful high-level project decisions and feature-direction changes should be saved into `/docs`, and major durable rules should also be reflected in this `AGENTS.md`.

Linting:

- `bun run lint` is advisory and should not block work on style/preference issues.
- Use `bun run check` and `bun run build` as the real correctness gates for compile/type/build failures.
- Use `bun run lint:strict` only when intentionally doing a stricter cleanup pass.

Architecture rule:

```text
Frontend UI -> NestJS API -> Metadata provider adapters
Frontend UI -> NestJS API -> Source provider adapters -> Host provider resolvers -> Download engine -> Local files
```

Avoid putting provider scraping or host-resolution logic in the frontend.
Avoid calling AniList directly from the frontend; use the local NestJS metadata API.

## Product Direction

Core flow:

1. Search a main source provider.
2. Open a media result.
3. Show media details.
4. Show episodes/media pieces.
5. Open an episode/media piece.
6. Extract public source-provider streaming embeds for playback when available.
7. Extract all public download options.
8. Group options by quality and host provider.
9. Resolve a selected provider internally.
10. Start a local download with one click.
11. Track progress, errors, retries, destination, playback progress, and history.

Long-term source strategy:

- Start with WitAnime.
- Add more main source providers later.
- Prefer internal source-provider redundancy over manual/open-external fallback flows.
- Fan-out source searches through the backend provider registry so adding a new source adapter can automatically participate in search flows.
- Do not optimize for "manual/open external fallback"; the user specifically said we do not want to optimize for that.
- Add source providers as explicit adapters because search pages, media pages, and episode/download extraction differ per site.
- Keep host-provider resolvers generic so a MediaFire, Google Drive, Mega, or other host implementation works for any source provider that emits that host link.
- A config/UI-assisted source-adapter builder may be useful later after several source providers exist, but fully automatic arbitrary-site integration is expected to be brittle.

## First Main Source Provider

WitAnime:

- <https://witanime.life/>

Observed with Playwright on 2026-05-25 using `Akane-banashi`.

Search flow:

- Header search submits to:
  - `https://witanime.life/?search_param=animes&s=Akane-banashi`
- Search result linked to:
  - `https://witanime.life/anime/akane-banashi/`

Anime page flow:

- Anime page URL:
  - `https://witanime.life/anime/akane-banashi/`
- Episode list is not directly present as plain cards in the initial server-rendered HTML.
- The page includes `encodedEpisodeData`.
- `encodedEpisodeData` is base64 JSON containing episode numbers and URLs.
- For `Akane-banashi`, it included episode URLs for episodes 1 through 8.

Episode page flow:

- Example episode URL:
  - `https://witanime.life/episode/akane-banashi-%d8%a7%d9%84%d8%ad%d9%84%d9%82%d8%a9-5/`
- Page title observed:
  - `انمي Akane-banashi الحلقة 5 مترجمة اون لاين - WitAnime`
- Streaming server buttons are exposed under `#episode-servers .server-link`.
- Streaming embed URLs are encoded in `_zG` with decode config `_zH`; decode those in the backend adapter and attach them as `StreamingOption[]`.
- Observed streaming labels include `yonaplay - multi`, `videa`, `streamwish`, `mp4upload - SD`, `videa - FHD`, and `streamwish - FHD`.
- Download section heading:
  - `روابط تحميل الحلقة`
- Quality groups observed:
  - `الجودة المتوسطة SD`
  - `الجودة العالية HD`
  - `الجودة الخارقة FHD`
- Host buttons observed per quality:
  - `mediafire`
  - `workupload`
  - `mp4upload`
  - `gofile`
- One FHD button text was misspelled as `mediafir`; normalize that to `mediafire`.

WitAnime download extraction:

- Download anchors use class `.download-link`.
- Download anchors have `href="#"`.
- The real provider URL is selected by `data-index`.
- The page defines JS variables:
  - `_m`
  - `_p0.._pN`
  - `_s`
  - `_a`
  - `_t`
- The site script `px9.js` decodes the indexed URL and opens it with `window.open(resource, "_blank")`.
- Backend can reproduce the decoding without using a browser click.

Known `px9.js` behavior:

- `secret = atob(_m.r)`
- For each index:
  - decode `_s[index]` through xor with `secret`
  - parse it as an array sequence
  - decode chunks from `_p<index>` through the same xor
  - arrange chunks by the sequence
  - join into the final provider URL

Example decoded WitAnime episode 5 links:

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

Treat these as examples only. Resolver code should fetch fresh data each time.

## Suggested Adapter Interfaces

Source provider adapter:

```ts
interface SourceProviderAdapter {
  search(query: string): Promise<MediaSearchResult[]>;
  getMediaDetails(mediaUrl: string): Promise<MediaDetails>;
  getEpisodes(mediaUrl: string): Promise<EpisodeSummary[]>;
  getDownloadOptions(episodeUrl: string): Promise<DownloadOption[]>;
  getStreamingOptions?(episodeUrl: string): Promise<StreamingOption[]>;
}
```

Host resolver:

```ts
interface HostResolver {
  provider: string;
  canResolve(url: string): boolean;
  resolve(url: string): Promise<ResolvedDownload>;
}
```

Download option:

```ts
interface DownloadOption {
  sourceProvider: string;
  mediaTitle: string;
  episodeTitle?: string;
  episodeNumber?: string;
  quality: "SD" | "HD" | "FHD" | string;
  qualityLabel: string;
  hostProvider: string;
  providerUrl: string;
  sourcePageUrl: string;
}
```

## Initial Host Providers

From the first WitAnime flow, prioritize:

- MediaFire
- GoFile
- Workupload
- mp4upload

MediaFire observation:

- Clicking the HD MediaFire WitAnime option opened:
  - `https://www.mediafire.com/file/k9t2grrtfa5z8se/%5BWitanime.com%5D+AB+EP+05+HD.zip/file`
- The MediaFire page exposed a visible `Download file` link.
- Direct MediaFire download URLs may be time-limited; resolve them just before enqueue/download.

Current host resolver behavior:

- MediaFire and Google Drive resolve to direct HTTP URLs.
- Workupload mirrors the public JS wait/check flow, then reads `/api/file/getDownloadServer/:id`; keep the returned cookie with the final workupload subdomain URL.
- mp4upload requires the two-step public form flow: `download1`, then the visible `Download Now`/`download2` form, then the 302 `Location`.
- GoFile uses the public website API with a guest token and generated website token; keep the bearer header with the resolved file URL.
- Mega uses `megajs` as a custom backend download path because the browser button streams encrypted chunks, not a normal direct file URL.

## UI Intent

The first screen should be the actual app, not a landing page.

Expected UI areas:

- Search input and source provider selector.
- Search results.
- Media detail panel.
- Episode list.
- Download options grouped by quality.
- Provider buttons/cards.
- Download queue.
- Job history and retry controls.
- Settings later for directories and provider preferences.

Keep the UI dense and useful. This is a personal operational tool, not marketing.

## Persistence Notes

PostgreSQL should eventually store:

- source providers
- media cache
- episode cache
- discovered download options
- host resolver attempts
- download jobs
- job status transitions
- errors
- local file destinations
- app settings

## Development Notes

- Use TypeScript throughout once the codebase is scaffolded.
- Keep provider logic in backend modules.
- Keep source-provider adapters separate from host-provider resolvers.
- Normalize provider names at the boundary.
- Prefer robust parsers and structured extraction over brittle string slicing.
- Browser automation is fine for research and verification, but implementation should prefer normal HTTP parsing when the site exposes enough HTML/JS data.
- Follow the project commit behavior above: automatically create local commits for meaningful changes, stage only touched files, and do not push unless explicitly asked.
