import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type {
  DownloadOption,
  HostProviderId,
  ResolvedDownload,
} from '@elysium/shared';

export type DownloadConnectionStatus = 'resolved' | 'unsupported' | 'failed';

export interface DownloadConnectionResult {
  option: DownloadOption;
  status: DownloadConnectionStatus;
  resolved?: ResolvedDownload;
  message?: string;
}

interface HostDownloadResolver {
  canResolve(option: DownloadOption): boolean;
  resolve(option: DownloadOption): Promise<ResolvedDownload>;
}

interface ProbeResult {
  contentDisposition?: string;
  contentLength?: string;
  contentRange?: string;
  contentType?: string;
  filename?: string;
  finalUrl: string;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
}

type CheerioSelection = ReturnType<CheerioAPI>;

interface GofileStatusResponse {
  status: string;
  message?: string;
}

interface GofileAccountResponse extends GofileStatusResponse {
  data?: {
    token?: string;
  };
}

interface GofileContentNode {
  children?: Record<string, GofileContentNode>;
  link?: string;
  mimetype?: string;
  name?: string;
  size?: number;
  type?: string;
}

interface GofileContentResponse extends GofileStatusResponse {
  data?: GofileContentNode;
}

interface WorkuploadPuzzleResponse {
  success: boolean;
  data?: {
    find: string[];
    puzzle: string;
    range: number;
  };
}

interface WorkuploadDownloadServerResponse {
  data?: {
    url?: string;
  };
  success?: boolean;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  get header() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  store(response: Response) {
    const headers = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const setCookies = headers.getSetCookie?.() ?? [];
    const mergedSetCookie = response.headers.get('set-cookie');

    if (mergedSetCookie) {
      setCookies.push(...splitSetCookieHeader(mergedSetCookie));
    }

    for (const setCookie of setCookies) {
      const [pair] = setCookie.split(';');
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      this.cookies.set(
        pair.slice(0, separatorIndex).trim(),
        pair.slice(separatorIndex + 1).trim(),
      );
    }
  }
}

const DEFAULT_HEADERS = {
  accept: '*/*',
  'accept-encoding': 'identity',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Elysium/0.1',
};
const GOFILE_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
};
const GOFILE_API_BASE_URL = 'https://api.gofile.io';
const GOFILE_LANGUAGE = 'en-US';
const GOFILE_WEBSITE_TOKEN_SECRET = 'g4f8fd9f12h14g';
const REQUEST_TIMEOUT_MS = 15_000;

export class DownloadConnectionResolver {
  private readonly resolvers: HostDownloadResolver[] = [
    new MediaFireResolver(),
    new GoogleDriveResolver(),
    new WorkuploadResolver(),
    new Mp4UploadResolver(),
    new GofileResolver(),
    new MegaResolver(),
    new DirectHttpResolver(),
  ];

  async resolve(option: DownloadOption): Promise<DownloadConnectionResult> {
    const resolver = this.resolvers.find((candidate) =>
      candidate.canResolve(option),
    );

    if (!resolver) {
      return {
        option,
        status: 'unsupported',
        message: unsupportedReason(option),
      };
    }

    try {
      return {
        option,
        status: 'resolved',
        resolved: await resolver.resolve(option),
      };
    } catch (error) {
      return {
        option,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

class MediaFireResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'mediafire';
  }

  async resolve(option: DownloadOption): Promise<ResolvedDownload> {
    const html = await fetchText(option.providerUrl);
    const $ = load(html);
    const directUrl =
      $('#downloadButton').attr('href') ??
      $('a[aria-label*="Download"], a[href*="download"]').first().attr('href');

    if (!directUrl) {
      throw new Error('MediaFire page did not expose a download button URL');
    }

    return probeDirectDownload({
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      url: toAbsoluteUrl(directUrl, option.providerUrl),
    });
  }
}

class GoogleDriveResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    const provider = normalizeProvider(option.hostProvider);

    return provider === 'google drive' || provider === 'google-drive';
  }

  async resolve(option: DownloadOption) {
    const response = await fetch(option.providerUrl, {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const contentType = response.headers.get('content-type') ?? '';

    if (
      isDirectFileResponse(response, contentType) &&
      isMp4UploadFileResponse(response)
    ) {
      return resolvedFromResponse(
        option.hostProvider,
        option.providerUrl,
        response,
      );
    }

    const html = await response.text();
    const $ = load(html);
    const form = $('form#download-form').first();
    const action = form.attr('action');

    if (!action) {
      throw new Error(
        'Google Drive did not expose a download confirmation form',
      );
    }

    const confirmedUrl = new URL(action, response.url);
    form.find('input[name]').each((_, element) => {
      const input = $(element);
      const name = input.attr('name');

      if (name) {
        confirmedUrl.searchParams.set(name, input.attr('value') ?? '');
      }
    });

    return probeDirectDownload({
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      url: confirmedUrl.toString(),
    });
  }
}

class WorkuploadResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'workupload';
  }

  async resolve(option: DownloadOption) {
    const cookieJar = new CookieJar();
    const startUrl = await this.findStartUrl(option.providerUrl, cookieJar);
    const html = await fetchWorkuploadText(startUrl, cookieJar);
    const $ = load(html);
    const directUrl =
      $('a[href*=".workupload.com/download/"]').first().attr('href') ??
      (await this.findDownloadServerUrl(html, startUrl, cookieJar));

    if (!directUrl) {
      throw new Error(
        'Workupload start page did not expose a direct download URL',
      );
    }

    return probeDirectDownload({
      provider: option.hostProvider,
      requestHeaders: cookieJar.header
        ? { cookie: cookieJar.header }
        : undefined,
      sourceUrl: option.providerUrl,
      url: toAbsoluteUrl(directUrl, startUrl),
    });
  }

  private async findStartUrl(providerUrl: string, cookieJar: CookieJar) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const html = await fetchWorkuploadText(providerUrl, cookieJar);
      const $ = load(html);
      const startHref =
        $('a[href^="/start/"]').first().attr('href') ??
        $('a[href*="/start/"]').first().attr('href');

      if (startHref) {
        return toAbsoluteUrl(startHref, providerUrl);
      }

      if (html.includes('/puzzle') && html.includes('/captcha')) {
        await solveWorkuploadSecurityCheck(providerUrl, cookieJar);
        continue;
      }

      if (attempt < 2) {
        await sleep(1_250);
      }
    }

    throw new Error('Workupload page did not expose a public start URL');
  }

  private async findDownloadServerUrl(
    html: string,
    startUrl: string,
    cookieJar: CookieJar,
  ) {
    const apiPath = html.match(
      /url:\s*["']([^"']*\/api\/file\/getDownloadServer\/[^"']+)["']/u,
    )?.[1];

    if (!apiPath) {
      return undefined;
    }

    const response =
      await fetchWorkuploadJson<WorkuploadDownloadServerResponse>(
        toAbsoluteUrl(apiPath, startUrl),
        cookieJar,
      );

    return response.data?.url;
  }
}

class Mp4UploadResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'mp4upload';
  }

  async resolve(option: DownloadOption) {
    const html = await fetchText(option.providerUrl);
    const $ = load(html);
    const form = findFormByOp($, 'download1') ?? findFormByOp($, 'download2');

    if (!form) {
      throw new Error('mp4upload page did not expose a public download form');
    }

    const response = await submitUrlEncodedForm(form, option.providerUrl, {
      redirect: 'follow',
      referer: option.providerUrl,
    });
    const contentType = response.headers.get('content-type') ?? '';

    if (isDirectFileResponse(response, contentType)) {
      return resolvedFromResponse(
        option.hostProvider,
        option.providerUrl,
        response,
      );
    }

    const resultHtml = await response.text();
    const result = load(resultHtml);
    const secondStageForm = findFormByOp(result, 'download2');

    if (!secondStageForm) {
      const directUrl = findMp4Url(resultHtml, response.url);

      if (!directUrl) {
        throw new Error(
          'mp4upload form response did not expose the final download form',
        );
      }

      return probeDirectDownload({
        provider: option.hostProvider,
        sourceUrl: option.providerUrl,
        url: directUrl,
      });
    }

    const finalResponse = await submitUrlEncodedForm(
      secondStageForm,
      response.url,
      {
        redirect: 'manual',
        referer: response.url,
      },
    );
    const location = finalResponse.headers.get('location');

    if (location && finalResponse.status >= 300 && finalResponse.status < 400) {
      await finalResponse.body?.cancel();
      return probeDirectDownload({
        provider: option.hostProvider,
        sourceUrl: option.providerUrl,
        url: toAbsoluteUrl(location, response.url),
      });
    }

    const finalContentType = finalResponse.headers.get('content-type') ?? '';

    if (isDirectFileResponse(finalResponse, finalContentType)) {
      return resolvedFromResponse(
        option.hostProvider,
        option.providerUrl,
        finalResponse,
      );
    }

    const finalHtml = await finalResponse.text();
    const finalDirectUrl = findMp4Url(finalHtml, finalResponse.url);

    if (!finalDirectUrl) {
      throw new Error(
        'mp4upload final form response did not expose a direct file URL',
      );
    }

    return probeDirectDownload({
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      url: finalDirectUrl,
    });
  }
}

class GofileResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'gofile';
  }

  async resolve(option: DownloadOption) {
    const contentId = extractGofileContentId(option.providerUrl);
    const account = await gofileJson<GofileAccountResponse>(
      `${GOFILE_API_BASE_URL}/accounts`,
      {
        method: 'POST',
      },
    );
    const token = account.data?.token;

    if (!token) {
      throw new Error('GoFile did not issue a guest account token');
    }

    await gofileJson<GofileStatusResponse>(
      `${GOFILE_API_BASE_URL}/accounts/website`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    const content = await gofileJson<GofileContentResponse>(
      `${GOFILE_API_BASE_URL}/contents/${encodeURIComponent(
        contentId,
      )}?contentFilter=&page=1&pageSize=1000&sortField=name&sortDirection=1`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          'x-bl': GOFILE_LANGUAGE,
          'x-website-token': createGofileWebsiteToken(token),
        },
      },
    );
    const file = findGofileFile(content.data);

    if (!file?.link) {
      throw new Error('GoFile content API did not expose a downloadable file');
    }

    const requestHeaders = {
      accept: '*/*',
      'accept-language': `${GOFILE_LANGUAGE},en;q=0.9`,
      authorization: `Bearer ${token}`,
      'user-agent': GOFILE_HEADERS['user-agent'],
    };

    return probeDirectDownload({
      provider: option.hostProvider,
      requestHeaders,
      sourceUrl: option.providerUrl,
      url: file.link,
    });
  }
}

class MegaResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'mega';
  }

  async resolve(option: DownloadOption): Promise<ResolvedDownload> {
    const { File } = await import('megajs');
    const file = File.fromURL(option.providerUrl);

    await file.loadAttributes();

    return {
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      filename: file.name ?? undefined,
      sizeBytes: file.size,
      engine: 'custom',
    };
  }
}

class DirectHttpResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    const provider = normalizeProvider(option.hostProvider);

    return !['gofile', 'mega', 'workupload', 'mp4upload'].includes(provider);
  }

  async resolve(option: DownloadOption) {
    return probeDirectDownload({
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      url: option.providerUrl,
    });
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: DEFAULT_HEADERS,
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

async function fetchWorkuploadText(url: string, cookieJar: CookieJar) {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      ...(cookieJar.header ? { cookie: cookieJar.header } : {}),
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  cookieJar.store(response);

  if (!response.ok) {
    throw new Error(
      `Workupload request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

async function solveWorkuploadSecurityCheck(
  providerUrl: string,
  cookieJar: CookieJar,
) {
  const origin = new URL(providerUrl).origin;
  const puzzle = await fetchWorkuploadJson<WorkuploadPuzzleResponse>(
    `${origin}/puzzle`,
    cookieJar,
  );

  if (!puzzle.success || !puzzle.data) {
    throw new Error('Workupload puzzle endpoint did not return a challenge');
  }

  const solutions = solveWorkuploadPuzzle(puzzle.data);
  const response = await fetch(`${origin}/captcha`, {
    body: new URLSearchParams({
      captcha: `${solutions.join(' ')} `,
    }),
    headers: {
      ...DEFAULT_HEADERS,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      cookie: cookieJar.header,
      referer: providerUrl,
      'x-requested-with': 'XMLHttpRequest',
    },
    method: 'POST',
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  cookieJar.store(response);

  if (!response.ok) {
    throw new Error(
      `Workupload captcha endpoint failed: ${response.status} ${response.statusText}`,
    );
  }

  await response.body?.cancel();
}

async function fetchWorkuploadJson<T>(url: string, cookieJar: CookieJar) {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      accept: 'application/json',
      ...(cookieJar.header ? { cookie: cookieJar.header } : {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  cookieJar.store(response);

  if (!response.ok) {
    throw new Error(
      `Workupload request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

function solveWorkuploadPuzzle(
  data: NonNullable<WorkuploadPuzzleResponse['data']>,
) {
  const wanted = new Set(data.find);
  const solutions: number[] = [];

  for (let index = 0; index < data.range; index += 1) {
    const digest = createHash('sha256')
      .update(`${data.puzzle}${index}`)
      .digest('hex');

    if (wanted.has(digest)) {
      solutions.push(index);
    }
  }

  if (solutions.length !== data.find.length) {
    throw new Error('Workupload puzzle did not produce every expected answer');
  }

  return solutions;
}

function findFormByOp($: CheerioAPI, op: string): CheerioSelection | undefined {
  const form = $('form')
    .filter(
      (_, element) =>
        $(element).find(`input[name="op"][value="${op}"]`).length > 0,
    )
    .first();

  return form.length ? form : undefined;
}

async function submitUrlEncodedForm(
  form: CheerioSelection,
  baseUrl: string,
  {
    redirect,
    referer,
  }: {
    redirect: RequestRedirect;
    referer: string;
  },
) {
  const body = formToUrlEncodedBody(form);

  if (!body.has('method_free')) {
    body.set('method_free', 'Free Download');
  }

  return fetch(toAbsoluteUrl(form.attr('action') ?? '', baseUrl), {
    body,
    headers: {
      ...DEFAULT_HEADERS,
      'content-type': 'application/x-www-form-urlencoded',
      referer,
    },
    method: 'POST',
    redirect,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function formToUrlEncodedBody(form: CheerioSelection) {
  const body = new URLSearchParams();
  const inputs = form.find('input[name]');

  inputs.each((index) => {
    const input = inputs.eq(index);
    const name = input.attr('name');

    if (name) {
      body.set(name, input.attr('value') ?? '');
    }
  });

  return body;
}

async function probeDirectDownload({
  provider,
  requestHeaders,
  sourceUrl,
  url,
}: {
  provider: HostProviderId;
  requestHeaders?: Record<string, string>;
  sourceUrl: string;
  url: string;
}): Promise<ResolvedDownload> {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      range: 'bytes=0-0',
      referer: sourceUrl,
      ...requestHeaders,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const contentType = response.headers.get('content-type') ?? '';

  if (!isDirectFileResponse(response, contentType)) {
    await response.body?.cancel();
    throw new Error(
      `Resolved URL returned ${contentType || 'unknown content'} instead of a file connection`,
    );
  }

  return resolvedFromResponse(provider, sourceUrl, response, requestHeaders);
}

function resolvedFromResponse(
  provider: HostProviderId,
  sourceUrl: string,
  response: Response,
  requestHeaders?: Record<string, string>,
): ResolvedDownload {
  const probe = probeFromResponse(response);

  void response.body?.cancel();

  return {
    provider,
    sourceUrl,
    directUrl: probe.finalUrl,
    filename: probe.filename ?? filenameFromUrl(probe.finalUrl),
    sizeBytes: parseSize(probe),
    headers: probe.headers,
    requestHeaders,
    engine: 'http',
  };
}

function probeFromResponse(response: Response): ProbeResult {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const contentDisposition =
    response.headers.get('content-disposition') ?? undefined;
  const contentLength = response.headers.get('content-length') ?? undefined;
  const contentRange = response.headers.get('content-range') ?? undefined;
  const contentType = response.headers.get('content-type') ?? undefined;

  return {
    contentDisposition,
    contentLength,
    contentRange,
    contentType,
    filename: contentDisposition
      ? filenameFromDisposition(contentDisposition)
      : undefined,
    finalUrl: response.url,
    headers,
    ok: response.ok,
    status: response.status,
  };
}

function isDirectFileResponse(response: Response, contentType: string) {
  const contentDisposition = response.headers.get('content-disposition');

  return (
    response.ok &&
    (Boolean(contentDisposition) ||
      (!contentType.toLowerCase().includes('text/html') &&
        !contentType.toLowerCase().includes('application/xhtml')))
  );
}

function findMp4Url(html: string, baseUrl: string) {
  const absolute = html.match(
    /https?:\/\/[^"']+\/[^"']+\.mp4(?:\?[^"']*)?/u,
  )?.[0];

  if (absolute) {
    return absolute;
  }

  const rawPlayerUrl = html.match(/file\s*:\s*["']([^"']+)["']/u)?.[1];

  if (rawPlayerUrl?.includes('.mp4')) {
    return toAbsoluteUrl(rawPlayerUrl, baseUrl);
  }

  return undefined;
}

function extractGofileContentId(url: string) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  const downloadIndex = parts.indexOf('d');
  const id = downloadIndex >= 0 ? parts[downloadIndex + 1] : parts.at(-1);

  if (!id) {
    throw new Error('GoFile URL did not include a content id');
  }

  return id;
}

async function gofileJson<T extends GofileStatusResponse>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...GOFILE_HEADERS,
      ...headersToRecord(init.headers),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json()) as T;

  if (!response.ok || payload.status !== 'ok') {
    throw new Error(
      `GoFile API request failed: ${payload.message ?? response.statusText}`,
    );
  }

  return payload;
}

function createGofileWebsiteToken(token: string) {
  const bucket = Math.floor(Date.now() / 1000 / 14_400).toString();
  const raw = [
    GOFILE_HEADERS['user-agent'],
    GOFILE_LANGUAGE,
    token,
    bucket,
    GOFILE_WEBSITE_TOKEN_SECRET,
  ].join('::');

  return createHash('sha256').update(raw).digest('hex');
}

function findGofileFile(
  node: GofileContentNode | undefined,
): GofileContentNode | undefined {
  if (!node) {
    return undefined;
  }

  if (node.link && node.type !== 'folder') {
    return node;
  }

  const children = Object.values(node.children ?? {});
  const mediaFile = children.find(
    (child) =>
      child.link &&
      (child.mimetype?.startsWith('video/') ||
        child.name?.toLowerCase().endsWith('.mp4') ||
        child.name?.toLowerCase().endsWith('.zip')),
  );

  if (mediaFile) {
    return mediaFile;
  }

  for (const child of children) {
    const nested = findGofileFile(child);

    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function isMp4UploadFileResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const contentDisposition = response.headers.get('content-disposition');
  const finalUrl = response.url.toLowerCase();

  return (
    Boolean(contentDisposition) ||
    contentType.toLowerCase().includes('video/') ||
    finalUrl.includes('.mp4')
  );
}

function parseSize(probe: ProbeResult) {
  const rangeTotal = probe.contentRange?.match(/\/(\d+)$/u)?.[1];
  const raw = rangeTotal ?? probe.contentLength;
  const size = raw ? Number(raw) : undefined;

  return Number.isFinite(size) ? size : undefined;
}

function filenameFromDisposition(disposition: string) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];

  if (encoded) {
    return decodeURIComponent(encoded.replace(/"/gu, ''));
  }

  return disposition.match(/filename="?([^";]+)"?/iu)?.[1];
}

function filenameFromUrl(url: string) {
  const lastSegment = new URL(url).pathname.split('/').filter(Boolean).at(-1);

  return lastSegment ? decodeURIComponent(lastSegment) : undefined;
}

function unsupportedReason(option: DownloadOption) {
  return `No resolver registered for ${option.hostProvider}`;
}

function normalizeProvider(provider: HostProviderId) {
  return provider.toLowerCase().trim();
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).toString();
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

function splitSetCookieHeader(header: string) {
  return header.split(/,\s*(?=[^;,]+=)/u);
}
