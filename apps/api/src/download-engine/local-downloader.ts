import { createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';
import type { DownloadJobEngine, ResolvedDownload } from '@elysium/shared';

interface LocalDownloadOptions {
  downloadDir: string;
  onProgress: (progress: LocalDownloadProgress) => void;
  onStart: (download: LocalDownloadStart) => void;
}

interface LocalDownloadProgress {
  progressBytes?: number;
  speedBytesPerSecond?: number;
  totalBytes?: number;
}

interface LocalDownloadStart {
  destinationPath: string;
  engine: DownloadJobEngine;
  filename: string;
  totalBytes?: number;
}

interface LocalDownloadResult extends LocalDownloadStart {
  progressBytes: number;
}

interface RangeCapability {
  rangeSupported: boolean;
  totalBytes?: number;
}

interface ByteRange {
  end: number;
  start: number;
}

interface MegaProgress {
  bytesLoaded?: number;
  bytesTotal?: number;
}

const DOWNLOAD_HEADERS = {
  accept: '*/*',
  'accept-encoding': 'identity',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Elysium/0.1',
};
const DEFAULT_CONNECTIONS = 6;
const MAX_CONNECTIONS = 16;
const MIN_SEGMENTED_BYTES = 8 * 1024 * 1024;
const RANGE_PROBE_TIMEOUT_MS = 15_000;

export class LocalDownloader {
  async download(
    resolvedDownload: ResolvedDownload,
    options: LocalDownloadOptions,
  ): Promise<LocalDownloadResult> {
    if (isMegaCustomDownload(resolvedDownload)) {
      return this.downloadMega(resolvedDownload, options);
    }

    return this.downloadHttp(resolvedDownload, options);
  }

  private async downloadHttp(
    resolvedDownload: ResolvedDownload,
    options: LocalDownloadOptions,
  ): Promise<LocalDownloadResult> {
    if (!resolvedDownload.directUrl) {
      throw new Error('Local HTTP download requires a direct URL');
    }

    const filename = safeFilename(
      resolvedDownload.filename ?? filenameFromUrl(resolvedDownload.directUrl),
    );

    await mkdir(options.downloadDir, { recursive: true });
    const destinationPath = await nextAvailablePath(
      options.downloadDir,
      filename,
    );
    const rangeCapability = await inspectRangeCapability(resolvedDownload);
    const totalBytes = rangeCapability.totalBytes ?? resolvedDownload.sizeBytes;
    const connections = segmentedConnectionCount(
      resolvedDownload,
      connectionCount(),
    );
    const useSegmented =
      rangeCapability.rangeSupported &&
      typeof totalBytes === 'number' &&
      totalBytes >= MIN_SEGMENTED_BYTES &&
      connections > 1;
    let engine: DownloadJobEngine = useSegmented
      ? 'local-segmented'
      : 'local-http';

    options.onStart({
      destinationPath,
      engine,
      filename,
      totalBytes,
    });

    if (useSegmented && totalBytes) {
      try {
        await downloadSegmentedHttp({
          destinationPath,
          onProgress: options.onProgress,
          resolvedDownload,
          totalBytes,
          connections,
        });

        return {
          destinationPath,
          engine,
          filename,
          progressBytes: totalBytes,
          totalBytes,
        };
      } catch {
        await rm(destinationPath, { force: true });
        engine = 'local-http';
        options.onStart({
          destinationPath,
          engine,
          filename,
          totalBytes,
        });
      }
    }

    const result = await downloadSingleHttp({
      destinationPath,
      onProgress: options.onProgress,
      resolvedDownload,
      totalBytes,
    });

    return {
      destinationPath,
      engine,
      filename,
      progressBytes: result.progressBytes,
      totalBytes: result.totalBytes,
    };
  }

  private async downloadMega(
    resolvedDownload: ResolvedDownload,
    options: LocalDownloadOptions,
  ): Promise<LocalDownloadResult> {
    const { File } = await import('megajs');
    const file = File.fromURL(resolvedDownload.sourceUrl);

    await file.loadAttributes();

    const filename = safeFilename(
      resolvedDownload.filename ?? file.name ?? `elysium-mega-${Date.now()}`,
    );
    const totalBytes = file.size ?? resolvedDownload.sizeBytes;

    await mkdir(options.downloadDir, { recursive: true });
    const destinationPath = await nextAvailablePath(
      options.downloadDir,
      filename,
    );

    options.onStart({
      destinationPath,
      engine: 'local-mega',
      filename,
      totalBytes,
    });

    const startedAt = Date.now();
    const stream = file.download({ maxConnections: connectionCount() });

    stream.on('progress', (progress: MegaProgress) => {
      const progressBytes = progress.bytesLoaded ?? 0;

      options.onProgress({
        progressBytes,
        speedBytesPerSecond: bytesPerSecond(progressBytes, startedAt),
        totalBytes: progress.bytesTotal ?? totalBytes,
      });
    });

    await pipeline(stream, createWriteStream(destinationPath, { flags: 'wx' }));

    return {
      destinationPath,
      engine: 'local-mega',
      filename,
      progressBytes: totalBytes ?? 0,
      totalBytes,
    };
  }
}

async function inspectRangeCapability(
  resolvedDownload: ResolvedDownload,
): Promise<RangeCapability> {
  if (!resolvedDownload.directUrl) {
    return { rangeSupported: false };
  }

  try {
    const response = await fetch(resolvedDownload.directUrl, {
      headers: downloadHeaders(resolvedDownload, {
        range: 'bytes=0-0',
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(RANGE_PROBE_TIMEOUT_MS),
    });
    const contentRange = response.headers.get('content-range');
    const rangeTotal = contentRange?.match(/\/(\d+)$/u)?.[1];
    const contentLength = response.headers.get('content-length');

    await response.body?.cancel();

    return {
      rangeSupported: response.status === 206 && Boolean(contentRange),
      totalBytes: parseFiniteNumber(
        rangeTotal ?? contentLength ?? resolvedDownload.sizeBytes,
      ),
    };
  } catch {
    return {
      rangeSupported: false,
      totalBytes: resolvedDownload.sizeBytes,
    };
  }
}

async function downloadSegmentedHttp({
  connections,
  destinationPath,
  onProgress,
  resolvedDownload,
  totalBytes,
}: {
  connections: number;
  destinationPath: string;
  onProgress: (progress: LocalDownloadProgress) => void;
  resolvedDownload: ResolvedDownload;
  totalBytes: number;
}) {
  const abortController = new AbortController();
  const file = await open(destinationPath, 'wx');
  const progress = new ProgressReporter(totalBytes, onProgress);

  try {
    await file.truncate(totalBytes);
    await Promise.all(
      splitRanges(totalBytes, connections).map((range) =>
        downloadHttpRange({
          abortController,
          file,
          progress,
          range,
          resolvedDownload,
        }),
      ),
    );
    progress.flush();
  } catch (error) {
    abortController.abort();
    throw error;
  } finally {
    await file.close();
  }
}

async function downloadHttpRange({
  abortController,
  file,
  progress,
  range,
  resolvedDownload,
}: {
  abortController: AbortController;
  file: FileHandle;
  progress: ProgressReporter;
  range: ByteRange;
  resolvedDownload: ResolvedDownload;
}) {
  if (!resolvedDownload.directUrl) {
    throw new Error('Segmented download requires a direct URL');
  }

  const response = await fetch(resolvedDownload.directUrl, {
    headers: downloadHeaders(resolvedDownload, {
      range: `bytes=${range.start}-${range.end}`,
    }),
    redirect: 'follow',
    signal: abortController.signal,
  });

  if (response.status !== 206 || !response.body) {
    await response.body?.cancel();
    throw new Error(
      `Range request failed: ${response.status} ${response.statusText}`,
    );
  }

  const reader = response.body.getReader();
  let position = range.start;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    await file.write(value, 0, value.byteLength, position);
    position += value.byteLength;
    progress.add(value.byteLength);
  }
}

async function downloadSingleHttp({
  destinationPath,
  onProgress,
  resolvedDownload,
  totalBytes,
}: {
  destinationPath: string;
  onProgress: (progress: LocalDownloadProgress) => void;
  resolvedDownload: ResolvedDownload;
  totalBytes?: number;
}) {
  if (!resolvedDownload.directUrl) {
    throw new Error('Single download requires a direct URL');
  }

  const response = await fetch(resolvedDownload.directUrl, {
    headers: downloadHeaders(resolvedDownload),
    redirect: 'follow',
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `Download request failed: ${response.status} ${response.statusText}`,
    );
  }

  const responseTotalBytes =
    parseFiniteNumber(response.headers.get('content-length')) ?? totalBytes;
  const writer = createWriteStream(destinationPath, { flags: 'wx' });
  const reader = response.body.getReader();
  const startedAt = Date.now();

  if (responseTotalBytes) {
    onProgress({ totalBytes: responseTotalBytes });
  }

  try {
    let progressBytes = 0;

    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      progressBytes += value.byteLength;
      await writeChunk(writer, value);
      onProgress({
        progressBytes,
        speedBytesPerSecond: bytesPerSecond(progressBytes, startedAt),
      });
    }

    await closeWriter(writer);

    return {
      progressBytes:
        responseTotalBytes && responseTotalBytes > progressBytes
          ? responseTotalBytes
          : progressBytes,
      totalBytes: responseTotalBytes,
    };
  } catch (error) {
    writer.destroy();
    throw error;
  }
}

function downloadHeaders(
  resolvedDownload: ResolvedDownload,
  extraHeaders: Record<string, string> = {},
) {
  return {
    ...DOWNLOAD_HEADERS,
    referer: resolvedDownload.sourceUrl,
    ...resolvedDownload.requestHeaders,
    ...extraHeaders,
  };
}

function splitRanges(totalBytes: number, connections: number): ByteRange[] {
  const chunkSize = Math.ceil(totalBytes / connections);
  const ranges: ByteRange[] = [];

  for (let start = 0; start < totalBytes; start += chunkSize) {
    ranges.push({
      start,
      end: Math.min(start + chunkSize - 1, totalBytes - 1),
    });
  }

  return ranges;
}

class ProgressReporter {
  private readonly startedAt = Date.now();
  private lastEmitAt = 0;
  private progressBytes = 0;

  constructor(
    private readonly totalBytes: number,
    private readonly onProgress: (progress: LocalDownloadProgress) => void,
  ) {}

  add(bytes: number) {
    this.progressBytes += bytes;
    this.emit(false);
  }

  flush() {
    this.emit(true);
  }

  private emit(force: boolean) {
    const now = Date.now();

    if (!force && now - this.lastEmitAt < 250) {
      return;
    }

    this.lastEmitAt = now;
    this.onProgress({
      progressBytes: this.progressBytes,
      speedBytesPerSecond: bytesPerSecond(this.progressBytes, this.startedAt),
      totalBytes: this.totalBytes,
    });
  }
}

function connectionCount() {
  const parsed = Number(process.env.ELYSIUM_DOWNLOAD_CONNECTIONS);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CONNECTIONS;
  }

  return Math.max(1, Math.min(MAX_CONNECTIONS, Math.round(parsed)));
}

function segmentedConnectionCount(
  resolvedDownload: ResolvedDownload,
  requestedConnections: number,
) {
  if (resolvedDownload.provider.toLowerCase().trim() === 'gofile') {
    return Math.min(requestedConnections, 2);
  }

  return requestedConnections;
}

function parseFiniteNumber(value: string | number | undefined | null) {
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isMegaCustomDownload(download: ResolvedDownload) {
  return (
    download.engine === 'custom' &&
    download.provider.toLowerCase().trim() === 'mega'
  );
}

function safeFilename(filename: string) {
  return filename
    .replace(/[<>:"/\\|?*]/gu, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 180);
}

function filenameFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  const name = decodeURIComponent(
    pathname.split('/').filter(Boolean).at(-1) ?? '',
  );

  return name || `elysium-download-${Date.now()}`;
}

async function nextAvailablePath(downloadDir: string, filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';

  for (let index = 0; index < 1_000; index += 1) {
    const candidate =
      index === 0
        ? join(downloadDir, filename)
        : join(downloadDir, `${baseName} (${index})${extension}`);

    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not create a unique download path for ${filename}`);
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function writeChunk(writer: NodeJS.WritableStream, value: Uint8Array) {
  return new Promise<void>((resolveWrite, rejectWrite) => {
    writer.write(Buffer.from(value), (error) => {
      if (error) {
        rejectWrite(error);
        return;
      }

      resolveWrite();
    });
  });
}

function closeWriter(writer: NodeJS.WritableStream) {
  writer.end();
  return finished(writer);
}

function bytesPerSecond(progressBytes: number, startedAt: number) {
  const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);

  return Math.round(progressBytes / elapsedSeconds);
}
