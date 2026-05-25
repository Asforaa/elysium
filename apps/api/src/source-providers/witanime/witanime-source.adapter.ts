import { load } from 'cheerio';
import type {
  DownloadOption,
  DownloadQuality,
  EpisodeSummary,
  HostProviderId,
  MediaDetails,
  MediaKind,
  MediaSearchResult,
  MediaStatus,
  SourceProvider,
  StreamingOption,
} from '@elysium/shared';
import type { SourceProviderAdapter } from '../source-provider-adapter';

interface EncodedEpisode {
  number: string;
  url: string;
}

interface WitAnimeDownloadAuth {
  t: string;
  h: string;
}

interface WitAnimeEncodedDownloads {
  m: {
    r: string;
  };
  parts: Map<number, string[]>;
  sequences: string[];
  auth: WitAnimeDownloadAuth[];
  total: number;
}

interface WitAnimeStreamingConfig {
  d: number[];
  k: string;
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Elysium/0.1';
const WITANIME_YONAPLAY_API_KEY = '23a97133-caf3-4eb4-9466-93d0a4ff8198';

export class WitAnimeSourceAdapter implements SourceProviderAdapter {
  readonly provider: SourceProvider = {
    id: 'witanime',
    name: 'WitAnime',
    baseUrl: 'https://witanime.life',
    enabled: true,
  };

  async search(query: string): Promise<MediaSearchResult[]> {
    const url = new URL('/', this.provider.baseUrl);
    url.searchParams.set('search_param', 'animes');
    url.searchParams.set('s', query);

    const $ = load(await this.fetchText(url.toString()));

    const results: MediaSearchResult[] = [];

    $('.anime-card-container').each((_, element) => {
      const card = $(element);
      const titleLink = card.find('.anime-card-title a').first();
      const posterLink = card.find('.anime-card-poster a.overlay').first();
      const title = normalizeText(titleLink.text());
      const href = titleLink.attr('href') ?? posterLink.attr('href');

      if (!title || !href) {
        return;
      }

      const typeLabel = normalizeText(card.find('.anime-card-type').text());
      const statusLabel = normalizeText(card.find('.anime-card-status').text());
      const posterUrl = card.find('.anime-card-poster img').first().attr('src');
      const description = titleLink
        .closest('[data-content]')
        .attr('data-content');

      results.push({
        sourceProvider: this.provider.id,
        title,
        url: toAbsoluteUrl(href, this.provider.baseUrl),
        kind: normalizeKind(typeLabel),
        posterUrl,
        status: normalizeStatus(statusLabel),
        description: description ? normalizeText(description) : undefined,
      });
    });

    return results;
  }

  async getMediaDetails(mediaUrl: string): Promise<MediaDetails> {
    const absoluteUrl = toAbsoluteUrl(mediaUrl, this.provider.baseUrl);
    const $ = load(await this.fetchText(absoluteUrl));
    const title = normalizeText($('h1').first().text());
    const posterUrl =
      $('img[alt]')
        .filter((_, element) => normalizeText($(element).attr('alt')) === title)
        .first()
        .attr('src') ?? undefined;
    const description = normalizeText(
      $('.anime-story, .anime-excerpt, p').first().text(),
    );
    const genres = $('a[href*="/anime-genre/"]')
      .map((_, element) => normalizeText($(element).text()))
      .get()
      .filter(Boolean);
    const typeLabel = normalizeInfoValue($, 'النوع');
    const statusLabel = normalizeInfoValue($, 'حالة الأنمي');

    return {
      sourceProvider: this.provider.id,
      title,
      url: absoluteUrl,
      kind: normalizeKind(typeLabel),
      posterUrl,
      status: normalizeStatus(statusLabel),
      description: description || undefined,
      genres,
      releaseYear: normalizeInfoValue($, 'بداية العرض'),
      season: normalizeInfoValue($, 'الموسم'),
      episodeCount: normalizeInfoValue($, 'عدد الحلقات'),
      episodeDuration: normalizeInfoValue($, 'مدة الحلقة'),
      externalUrls: $('a[href*="myanimelist"], a[href*="youtu"]')
        .map((_, element) => ({
          label:
            normalizeText($(element).text()) ||
            normalizeText($(element).attr('href')),
          url: toAbsoluteUrl(
            $(element).attr('href') ?? '',
            this.provider.baseUrl,
          ),
        }))
        .get()
        .filter((link) => Boolean(link.url)),
    };
  }

  async getEpisodes(mediaUrl: string): Promise<EpisodeSummary[]> {
    const absoluteUrl = toAbsoluteUrl(mediaUrl, this.provider.baseUrl);
    const html = await this.fetchText(absoluteUrl);
    const $ = load(html);
    const mediaTitle = normalizeText($('h1').first().text());
    const episodes = decodeEpisodes(html);

    return episodes.map((episode) => ({
      sourceProvider: this.provider.id,
      mediaTitle,
      title: `الحلقة ${episode.number}`,
      number: episode.number,
      url: toAbsoluteUrl(episode.url, this.provider.baseUrl),
    }));
  }

  async getDownloadOptions(episodeUrl: string): Promise<DownloadOption[]> {
    const absoluteUrl = toAbsoluteUrl(episodeUrl, this.provider.baseUrl);
    const html = await this.fetchText(absoluteUrl);
    const $ = load(html);
    const decodedUrls = decodeDownloadResources(html);
    const episodeTitle = normalizeText(
      $('.second-section h3, h3').first().text(),
    );
    const episodeNumber = episodeTitle.match(/الحلقة\s+(\d+)/)?.[1];
    const mediaTitle =
      episodeTitle.replace(/\s*الحلقة\s+\d+.*/, '').trim() || undefined;

    const options: DownloadOption[] = [];

    $('.quality-list').each((_, listElement) => {
      const list = $(listElement);
      const qualityLabel = normalizeText(list.find('li').first().text());
      const quality = normalizeQuality(qualityLabel);

      list.find('.download-link').each((__, linkElement) => {
        const link = $(linkElement);
        const dataIndex = Number(link.attr('data-index'));
        const providerUrl = decodedUrls.get(dataIndex);
        const providerLabel = normalizeText(link.text());

        if (!providerUrl || !providerLabel) {
          return;
        }

        options.push({
          sourceProvider: this.provider.id,
          mediaTitle,
          episodeTitle,
          episodeNumber,
          quality,
          qualityLabel,
          hostProvider: normalizeHostProvider(providerLabel),
          providerLabel,
          providerUrl,
          sourcePageUrl: absoluteUrl,
        });
      });
    });

    return options;
  }

  async getStreamingOptions(episodeUrl: string): Promise<StreamingOption[]> {
    const absoluteUrl = toAbsoluteUrl(episodeUrl, this.provider.baseUrl);
    const html = await this.fetchText(absoluteUrl);
    const $ = load(html);
    const resources = decodeStreamingResources(html);
    const episodeTitle = normalizeText(
      $('.second-section h3, h3').first().text(),
    );
    const episodeNumber = episodeTitle.match(/الحلقة\s+(\d+)/)?.[1];
    const mediaTitle =
      episodeTitle.replace(/\s*الحلقة\s+\d+.*/, '').trim() || undefined;
    const options: StreamingOption[] = [];

    $('#episode-servers .server-link').each((_, linkElement) => {
      const link = $(linkElement);
      const serverId = Number(link.attr('data-server-id'));
      const providerLabel = normalizeText(link.text());
      const embedUrl = resources.get(serverId);

      if (!providerLabel || !embedUrl) {
        return;
      }

      options.push({
        sourceProvider: this.provider.id,
        mediaTitle,
        episodeTitle,
        episodeNumber,
        providerLabel,
        hostProvider: normalizeStreamingHostProvider(providerLabel, embedUrl),
        embedUrl,
        sourcePageUrl: absoluteUrl,
      });
    });

    return options;
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'user-agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(
        `WitAnime request failed: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }
}

function decodeEpisodes(html: string): EncodedEpisode[] {
  const encoded = matchRequired(
    html,
    /var\s+encodedEpisodeData\s*=\s*'([^']+)'/u,
    'encodedEpisodeData',
  );
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const parsed: unknown = JSON.parse(decoded);

  if (!Array.isArray(parsed)) {
    throw new Error('WitAnime encodedEpisodeData did not decode to an array');
  }

  return parsed
    .map((episode) => {
      if (!isRecord(episode)) {
        return null;
      }

      const number =
        typeof episode.number === 'string' ? episode.number.trim() : '';
      const url = typeof episode.url === 'string' ? episode.url.trim() : '';

      return number && url ? { number, url } : null;
    })
    .filter((episode): episode is EncodedEpisode => Boolean(episode));
}

function decodeDownloadResources(html: string): Map<number, string> {
  const encoded = parseEncodedDownloads(html);
  const secret = Buffer.from(encoded.m.r, 'base64').toString('utf8');
  const resources = new Map<number, string>();

  for (let index = 0; index < encoded.total; index += 1) {
    const chunks = encoded.parts.get(index);
    const sequenceRaw = encoded.sequences[index];

    if (!chunks || !sequenceRaw) {
      continue;
    }

    const sequence = JSON.parse(xorHex(sequenceRaw, secret)) as number[];
    const decodedChunks = chunks.map((chunk) => xorHex(chunk, secret));
    const arranged: string[] = [];

    for (let position = 0; position < sequence.length; position += 1) {
      arranged[sequence[position]] = decodedChunks[position] ?? '';
    }

    resources.set(index, arranged.join(''));
  }

  return resources;
}

function decodeStreamingResources(html: string): Map<number, string> {
  const rawResources = parseBase64JsonVariable<string[]>(html, '_zG');
  const configs = parseBase64JsonVariable<WitAnimeStreamingConfig[]>(html, '_zH');
  const resources = new Map<number, string>();

  rawResources.forEach((rawResource, index) => {
    const config = configs[index];

    if (!config) {
      return;
    }

    const reversed = rawResource
      .split('')
      .reverse()
      .join('')
      .replace(/[^A-Za-z0-9+/=]/gu, '');
    const indexKey = Buffer.from(config.k, 'base64').toString('utf8');
    const offset = config.d[Number.parseInt(indexKey, 10)];
    const decoded = Buffer.from(reversed, 'base64')
      .toString('utf8')
      .slice(0, offset ? -offset : undefined);

    if (!decoded) {
      return;
    }

    resources.set(index, appendYonaplayApiKey(decoded));
  });

  return resources;
}

function parseEncodedDownloads(html: string): WitAnimeEncodedDownloads {
  const m = parseJsonVariable<WitAnimeEncodedDownloads['m']>(html, '_m');
  const sequences = parseJsonVariable<string[]>(html, '_s');
  const auth = parseJsonVariable<WitAnimeDownloadAuth[]>(html, '_a');
  const totalConfig = parseJsonVariable<{ l: string }>(html, '_t');
  const total = Number(totalConfig.l);
  const parts = new Map<number, string[]>();

  for (let index = 0; index < total; index += 1) {
    parts.set(index, parseJsonVariable<string[]>(html, `_p${index}`));
  }

  return { m, parts, sequences, auth, total };
}

function parseJsonVariable<T>(html: string, variableName: string): T {
  const value = matchRequired(
    html,
    new RegExp(`var\\s+${escapeRegExp(variableName)}\\s*=\\s*([^;]+);`, 'u'),
    variableName,
  );

  return JSON.parse(value) as T;
}

function parseBase64JsonVariable<T>(html: string, variableName: string): T {
  const value = matchRequired(
    html,
    new RegExp(`var\\s+${escapeRegExp(variableName)}\\s*=\\s*"([^"]+)";`, 'u'),
    variableName,
  );

  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as T;
}

function xorHex(raw: string, secret: string): string {
  let output = '';

  for (let index = 0; index < raw.length; index += 2) {
    const byte = Number.parseInt(raw.slice(index, index + 2), 16);
    output += String.fromCharCode(
      byte ^ secret.charCodeAt((index / 2) % secret.length),
    );
  }

  return output;
}

function normalizeInfoValue(
  $: ReturnType<typeof load>,
  label: string,
): string | undefined {
  const value = $('.anime-info')
    .filter((_, element) => normalizeText($(element).text()).includes(label))
    .first()
    .text()
    .replace(label, '')
    .replace(':', '');

  return normalizeText(value) || undefined;
}

function normalizeKind(label: string | undefined): MediaKind {
  const normalized = normalizeText(label).toLowerCase();

  if (normalized.includes('movie') || normalized.includes('فيلم')) {
    return 'movie';
  }

  if (normalized.includes('tv') || normalized.includes('anime')) {
    return 'anime';
  }

  return 'unknown';
}

function normalizeStatus(label: string | undefined): MediaStatus | undefined {
  const normalized = normalizeText(label);

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes('يعرض')) {
    return 'airing';
  }

  if (
    normalized.includes('مكتمل') ||
    normalized.toLowerCase().includes('completed')
  ) {
    return 'completed';
  }

  return normalized;
}

function normalizeQuality(label: string): DownloadQuality {
  const normalized = normalizeText(label).toUpperCase();

  if (normalized.includes('FHD') || normalized.includes('الخارقة')) {
    return 'FHD';
  }

  if (normalized.includes('HD') || normalized.includes('العالية')) {
    return 'HD';
  }

  if (normalized.includes('SD') || normalized.includes('المتوسطة')) {
    return 'SD';
  }

  return label;
}

function normalizeHostProvider(label: string): HostProviderId {
  const normalized = normalizeText(label).toLowerCase();

  if (normalized === 'mediafir' || normalized.includes('mediafire')) {
    return 'mediafire';
  }

  if (normalized.includes('gofile')) {
    return 'gofile';
  }

  if (normalized.includes('workupload')) {
    return 'workupload';
  }

  if (normalized.includes('mp4upload')) {
    return 'mp4upload';
  }

  return normalized;
}

function normalizeStreamingHostProvider(
  label: string,
  embedUrl: string,
): HostProviderId {
  const normalized = normalizeText(label).toLowerCase();
  const hostname = new URL(embedUrl).hostname.replace(/^www\./u, '');

  if (normalized.includes('yonaplay') || hostname.includes('yonaplay')) {
    return 'yonaplay';
  }

  if (normalized.includes('videa') || hostname.includes('videa')) {
    return 'videa';
  }

  if (
    normalized.includes('streamwish') ||
    hostname.includes('streamwish') ||
    hostname.includes('hgcloud')
  ) {
    return 'streamwish';
  }

  if (normalized.includes('mp4upload') || hostname.includes('mp4upload')) {
    return 'mp4upload';
  }

  return hostname || normalized;
}

function appendYonaplayApiKey(url: string) {
  if (!/^https:\/\/yonaplay\.net\/embed\.php\?id=\d+$/u.test(url)) {
    return url;
  }

  return `${url}&apiKey=${WITANIME_YONAPLAY_API_KEY}`;
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim();
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).toString();
}

function matchRequired(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern);

  if (!match?.[1]) {
    throw new Error(`Missing WitAnime ${label} payload`);
  }

  return match[1];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
