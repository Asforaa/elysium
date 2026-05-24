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

Backend:

- Use NestJS.
- Use PostgreSQL.
- Backend owns scraping/parsing, provider adapters, host resolvers, download queue, filesystem writes, persistence, and settings.

Monorepo:

- Use Turborepo.
- Use Bun workspaces.
- Keep app projects under `apps/*`.
- Keep shared internal packages under `packages/*` when they are added.
- Vercel root config should use Bun commands only.
- Current frontend Vercel target is `@elysium/web` with output directory `apps/web/dist`.

Architecture rule:

```text
Frontend UI -> NestJS API -> Source provider adapters -> Host provider resolvers -> Download engine -> Local files
```

Avoid putting provider scraping or host-resolution logic in the frontend.

## Product Direction

Core flow:

1. Search a main source provider.
2. Open a media result.
3. Show media details.
4. Show episodes/media pieces.
5. Open an episode/media piece.
6. Extract all public download options.
7. Group options by quality and host provider.
8. Resolve a selected provider internally.
9. Start a local download with one click.
10. Track progress, errors, retries, destination, and history.

Long-term source strategy:

- Start with WitAnime.
- Add more main source providers later.
- Prefer internal source-provider redundancy over manual/open-external fallback flows.
- Do not optimize for "manual/open external fallback"; the user specifically said we do not want to optimize for that.

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
- Do not commit unless the user asks for a commit.
