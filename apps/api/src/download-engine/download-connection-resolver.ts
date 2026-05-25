import { load } from 'cheerio';
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

const DEFAULT_HEADERS = {
  accept: '*/*',
  'accept-encoding': 'identity',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Elysium/0.1',
};
const REQUEST_TIMEOUT_MS = 15_000;

export class DownloadConnectionResolver {
  private readonly resolvers: HostDownloadResolver[] = [
    new MediaFireResolver(),
    new GoogleDriveResolver(),
    new Mp4UploadResolver(),
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

  async resolve(option: DownloadOption) {
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

class Mp4UploadResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    return normalizeProvider(option.hostProvider) === 'mp4upload';
  }

  async resolve(option: DownloadOption) {
    const html = await fetchText(option.providerUrl);
    const $ = load(html);
    const form = $('form')
      .filter(
        (_, element) =>
          $(element).find('input[name="op"][value="download1"]').length > 0,
      )
      .first();

    if (!form.length) {
      throw new Error('mp4upload page did not expose a public download form');
    }

    const body = new URLSearchParams();
    form.find('input[name]').each((_, element) => {
      const input = $(element);
      const name = input.attr('name');

      if (name) {
        body.set(name, input.attr('value') ?? '');
      }
    });

    if (!body.has('method_free')) {
      body.set('method_free', 'Free Download');
    }

    const response = await fetch(
      toAbsoluteUrl(form.attr('action') ?? '', option.providerUrl),
      {
        body,
        headers: {
          ...DEFAULT_HEADERS,
          'content-type': 'application/x-www-form-urlencoded',
          referer: option.providerUrl,
        },
        method: 'POST',
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const contentType = response.headers.get('content-type') ?? '';

    if (isDirectFileResponse(response, contentType)) {
      return resolvedFromResponse(
        option.hostProvider,
        option.providerUrl,
        response,
      );
    }

    const resultHtml = await response.text();
    const directUrl = findMp4Url(resultHtml, response.url);

    if (!directUrl) {
      throw new Error(
        'mp4upload form response did not expose a direct file URL',
      );
    }

    return probeDirectDownload({
      provider: option.hostProvider,
      sourceUrl: option.providerUrl,
      url: directUrl,
    });
  }
}

class DirectHttpResolver implements HostDownloadResolver {
  canResolve(option: DownloadOption) {
    const provider = normalizeProvider(option.hostProvider);

    return !['gofile', 'mega', 'workupload'].includes(provider);
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

async function probeDirectDownload({
  provider,
  sourceUrl,
  url,
}: {
  provider: HostProviderId;
  sourceUrl: string;
  url: string;
}): Promise<ResolvedDownload> {
  const response = await fetch(url, {
    headers: {
      ...DEFAULT_HEADERS,
      range: 'bytes=0-0',
      referer: sourceUrl,
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

  return resolvedFromResponse(provider, sourceUrl, response);
}

function resolvedFromResponse(
  provider: HostProviderId,
  sourceUrl: string,
  response: Response,
): ResolvedDownload {
  const probe = probeFromResponse(response);

  void response.body?.cancel();

  return {
    provider,
    sourceUrl,
    directUrl: probe.finalUrl,
    filename: probe.filename,
    sizeBytes: parseSize(probe),
    headers: probe.headers,
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

function unsupportedReason(option: DownloadOption) {
  const provider = normalizeProvider(option.hostProvider);

  if (provider === 'mega') {
    return 'Mega links need a Mega-aware engine; Gopeed HTTP core will not resolve the encrypted fragment by itself.';
  }

  if (provider === 'gofile') {
    return 'Gofile public page resolution now requires API/auth handling; direct-link creation is a premium API feature.';
  }

  if (provider === 'workupload') {
    return 'Workupload returned an automated security check, so Elysium will not solve or bypass it.';
  }

  return `No resolver registered for ${option.hostProvider}`;
}

function normalizeProvider(provider: HostProviderId) {
  return provider.toLowerCase().trim();
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).toString();
}
