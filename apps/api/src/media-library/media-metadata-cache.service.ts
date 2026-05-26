import { Injectable } from '@nestjs/common';
import type {
  AnimeImage,
  AnimeMetadataDetails,
  DownloadMediaContext,
  MetadataProviderId,
} from '@elysium/shared';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { getEnvValue } from '../database/database.config';
import { AniListMetadataAdapter } from '../metadata-providers/anilist/anilist-metadata.adapter';
import { MediaLibraryRepository } from './media-library.repository';

const MEDIA_METADATA_CACHE_SUBDIR = '.elysium/metadata';
const ARTWORK_REQUEST_HEADERS = {
  accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'user-agent': 'Elysium/0.1',
};

export interface CachedArtworkAsset {
  cachedAt: string;
  contentType?: string;
  filePath: string;
  kind: string;
  localUrl: string;
  originalUrl: string;
}

export type CachedArtworkMap = Record<string, CachedArtworkAsset>;

@Injectable()
export class MediaMetadataCacheService {
  private readonly anilist = new AniListMetadataAdapter();

  constructor(private readonly mediaLibrary: MediaLibraryRepository) {}

  async getCachedAnimeDetails(provider: MetadataProviderId, id: number) {
    return this.mediaLibrary.getCachedAnimeDetails(provider, id);
  }

  async getOrCacheAnimeDetails(provider: MetadataProviderId, id: number) {
    const cached = await this.getCachedAnimeDetails(provider, id);

    if (cached) {
      return cached;
    }

    return this.cacheAnimeDetails(provider, id);
  }

  async cacheFromDownloadContext(context: DownloadMediaContext | undefined) {
    if (
      context?.metadataProvider !== 'anilist' ||
      !context.metadataId ||
      !Number.isInteger(context.metadataId)
    ) {
      return undefined;
    }

    return this.cacheAnimeDetails(context.metadataProvider, context.metadataId);
  }

  async cacheAllKnownAnime({
    delayMs = 2500,
    limit,
    missingOnly = true,
    provider = 'anilist',
  }: {
    delayMs?: number;
    limit?: number;
    missingOnly?: boolean;
    provider?: MetadataProviderId;
  } = {}) {
    const targets = await this.mediaLibrary.listMetadataCacheTargets({
      missingOnly,
      provider,
    });
    const selectedTargets = limit ? targets.slice(0, limit) : targets;
    const results: Array<{
      cached: boolean;
      errorMessage?: string;
      id: number;
      provider: MetadataProviderId;
      title?: string;
    }> = [];

    for (const [index, target] of selectedTargets.entries()) {
      if (index > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      try {
        const cachedDetails = getCachedDetails(target.metadata);
        const details = cachedDetails
          ? await this.storeAnimeDetails(
              target.metadata_provider,
              cachedDetails,
              getCachedArtwork(target.metadata),
            )
          : await this.cacheAnimeDetails(
              target.metadata_provider,
              target.metadata_id,
            );

        results.push({
          cached: true,
          id: target.metadata_id,
          provider: target.metadata_provider,
          title: details.displayTitle,
        });
      } catch (error) {
        results.push({
          cached: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          id: target.metadata_id,
          provider: target.metadata_provider,
        });
      }
    }

    return results;
  }

  async cacheAnimeDetails(provider: MetadataProviderId, id: number) {
    const details = await this.fetchAnimeDetails(provider, id);

    return this.storeAnimeDetails(provider, details);
  }

  async storeAnimeDetails(
    provider: MetadataProviderId,
    details: AnimeMetadataDetails,
    existingArtwork?: CachedArtworkMap,
  ) {
    const cached = await this.cacheArtwork(provider, details, existingArtwork);
    const filePath = await this.writeDetailsFile(provider, cached.details);

    await this.mediaLibrary.upsertCachedAnimeDetails({
      artwork: cached.artwork,
      details: cached.details,
      filePath,
      provider,
    });

    return cached.details;
  }

  async getAssetFile(
    provider: MetadataProviderId,
    id: number,
    filename: string,
  ) {
    if (basename(filename) !== filename || !/^[a-z0-9._-]+$/iu.test(filename)) {
      return undefined;
    }

    const filePath = resolve(this.getCacheRoot(), provider, String(id), filename);
    const fileStat = await stat(filePath).catch(() => undefined);

    if (!fileStat?.isFile()) {
      return undefined;
    }

    return {
      contentType: contentTypeFromFilename(filename),
      filePath,
      size: fileStat.size,
    };
  }

  private fetchAnimeDetails(provider: MetadataProviderId, id: number) {
    if (provider !== 'anilist') {
      throw new Error(`Metadata cache does not support provider yet: ${provider}`);
    }

    return this.anilist.getAnimeDetails(id);
  }

  private async cacheArtwork(
    provider: MetadataProviderId,
    details: AnimeMetadataDetails,
    existingArtwork: CachedArtworkMap = {},
  ) {
    const artwork: CachedArtworkMap = {};
    const coverImage: AnimeImage | undefined = details.coverImage
      ? { ...details.coverImage }
      : undefined;

    const coverExtraLarge = await this.cacheArtworkUrl({
      existingAsset: existingArtwork.coverExtraLarge,
      id: details.id,
      kind: 'cover-extra-large',
      provider,
      url: details.coverImage?.extraLarge,
    });

    if (coverExtraLarge && coverImage) {
      artwork.coverExtraLarge = coverExtraLarge;
      coverImage.extraLarge = coverExtraLarge.localUrl;
    }

    const coverLarge = await this.cacheArtworkUrl({
      existingAsset: existingArtwork.coverLarge,
      id: details.id,
      kind: 'cover-large',
      provider,
      url: details.coverImage?.large,
    });

    if (coverLarge && coverImage) {
      artwork.coverLarge = coverLarge;
      coverImage.large = coverLarge.localUrl;
    }

    const coverMedium = await this.cacheArtworkUrl({
      existingAsset: existingArtwork.coverMedium,
      id: details.id,
      kind: 'cover-medium',
      provider,
      url: details.coverImage?.medium,
    });

    if (coverMedium && coverImage) {
      artwork.coverMedium = coverMedium;
      coverImage.medium = coverMedium.localUrl;
    }

    const banner = await this.cacheArtworkUrl({
      existingAsset: existingArtwork.banner,
      id: details.id,
      kind: 'banner',
      provider,
      url: details.bannerImage,
    });

    if (banner) {
      artwork.banner = banner;
    }

    return {
      artwork,
      details: {
        ...details,
        bannerImage: banner?.localUrl ?? details.bannerImage,
        coverImage,
      },
    };
  }

  private async cacheArtworkUrl({
    existingAsset,
    id,
    kind,
    provider,
    url,
  }: {
    existingAsset?: CachedArtworkAsset;
    id: number;
    kind: string;
    provider: MetadataProviderId;
    url?: string;
  }): Promise<CachedArtworkAsset | undefined> {
    const cacheRoot = this.getCacheRoot();

    if (existingAsset && (await fileExists(existingAsset.filePath))) {
      if (isInsidePath(cacheRoot, existingAsset.filePath)) {
        return existingAsset;
      }

      const copied = await this.copyExistingArtworkAsset({
        cacheRoot,
        existingAsset,
        id,
        kind,
        provider,
      });

      if (copied) {
        return copied;
      }
    }

    const sourceUrl = getRemoteArtworkSourceUrl(url, existingAsset);

    if (!sourceUrl) {
      return existingAsset;
    }

    const response = await fetch(sourceUrl, {
      headers: ARTWORK_REQUEST_HEADERS,
    }).catch(() => undefined);

    if (!response?.ok) {
      return existingAsset;
    }

    const contentType = response.headers.get('content-type')?.split(';')[0];

    if (!contentType?.startsWith('image/')) {
      return existingAsset;
    }

    const extension =
      extensionFromContentType(contentType) ??
      extensionFromUrl(sourceUrl) ??
      extensionFromPath(existingAsset?.filePath) ??
      '.jpg';
    const directory = resolve(cacheRoot, provider, String(id));
    const filename = `${kind}${extension}`;
    const filePath = resolve(directory, filename);

    await mkdir(directory, { recursive: true });
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));

    return {
      cachedAt: new Date().toISOString(),
      contentType,
      filePath,
      kind,
      localUrl: `/metadata/${provider}/assets/${id}/${filename}`,
      originalUrl: sourceUrl,
    };
  }

  private async copyExistingArtworkAsset({
    cacheRoot,
    existingAsset,
    id,
    kind,
    provider,
  }: {
    cacheRoot: string;
    existingAsset: CachedArtworkAsset;
    id: number;
    kind: string;
    provider: MetadataProviderId;
  }) {
    const extension =
      extensionFromContentType(existingAsset.contentType ?? '') ??
      extensionFromPath(existingAsset.filePath) ??
      extensionFromRemoteUrl(existingAsset.originalUrl) ??
      '.jpg';
    const directory = resolve(cacheRoot, provider, String(id));
    const filename = `${kind}${extension}`;
    const filePath = resolve(directory, filename);

    await mkdir(directory, { recursive: true });
    await copyFile(existingAsset.filePath, filePath);

    return {
      ...existingAsset,
      cachedAt: new Date().toISOString(),
      filePath,
      kind,
      localUrl: `/metadata/${provider}/assets/${id}/${filename}`,
    };
  }

  private async writeDetailsFile(
    provider: MetadataProviderId,
    details: AnimeMetadataDetails,
  ) {
    const directory = resolve(this.getCacheRoot(), provider);
    const filePath = resolve(directory, `${details.id}.json`);

    await mkdir(directory, { recursive: true });
    await writeFile(filePath, `${JSON.stringify(details, null, 2)}\n`);

    return filePath;
  }

  private getCacheRoot() {
    const explicitCacheRoot = getEnvValue('ELYSIUM_METADATA_CACHE_DIR');

    if (explicitCacheRoot) {
      return explicitCacheRoot;
    }

    const mediaRoot = getEnvValue('ELYSIUM_MEDIA_ROOT');

    if (!mediaRoot) {
      throw new Error(
        'ELYSIUM_MEDIA_ROOT must be configured before caching metadata artwork.',
      );
    }

    return resolve(mediaRoot, MEDIA_METADATA_CACHE_SUBDIR);
  }
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function getCachedDetails(metadata: Record<string, unknown> | null) {
  const details = metadata?.details;

  return details && typeof details === 'object' && !Array.isArray(details)
    ? (details as AnimeMetadataDetails)
    : undefined;
}

function getCachedArtwork(metadata: Record<string, unknown> | null) {
  const artwork = metadata?.artwork;

  return artwork && typeof artwork === 'object' && !Array.isArray(artwork)
    ? (artwork as CachedArtworkMap)
    : undefined;
}

function isRemoteHttpUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getRemoteArtworkSourceUrl(
  url: string | undefined,
  existingAsset: CachedArtworkAsset | undefined,
) {
  if (isRemoteHttpUrl(url)) {
    return url;
  }

  if (isRemoteHttpUrl(existingAsset?.originalUrl)) {
    return existingAsset.originalUrl;
  }

  return undefined;
}

async function fileExists(filePath: string) {
  return Boolean((await stat(filePath).catch(() => undefined))?.isFile());
}

function isInsidePath(parentPath: string, childPath: string) {
  const path = relative(resolve(parentPath), resolve(childPath));

  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function extensionFromUrl(url: string) {
  const extension = extname(new URL(url).pathname).toLowerCase();

  return extension || undefined;
}

function extensionFromRemoteUrl(url: string | undefined) {
  return isRemoteHttpUrl(url) ? extensionFromUrl(url) : undefined;
}

function extensionFromPath(path: string | undefined) {
  const extension = path ? extname(path).toLowerCase() : '';

  return extension || undefined;
}

function extensionFromContentType(contentType: string) {
  switch (contentType) {
    case 'image/avif':
      return '.avif';
    case 'image/gif':
      return '.gif';
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/svg+xml':
      return '.svg';
    case 'image/webp':
      return '.webp';
    default:
      return undefined;
  }
}

function contentTypeFromFilename(filename: string) {
  switch (extname(filename).toLowerCase()) {
    case '.avif':
      return 'image/avif';
    case '.gif':
      return 'image/gif';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
