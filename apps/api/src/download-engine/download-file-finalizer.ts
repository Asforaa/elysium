import { createWriteStream } from 'node:fs';
import {
  mkdir,
  open as openFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { DownloadJob, DownloadJobEngine } from '@elysium/shared';
import * as yauzl from 'yauzl';

export interface DownloadedFile {
  destinationPath: string;
  engine: DownloadJobEngine;
  filename: string;
  progressBytes: number;
  totalBytes?: number;
}

interface ZipEntrySummary {
  fileName: string;
  uncompressedSize: number;
}

const ARCHIVE_EXTENSIONS = new Set(['.zip']);
const VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ts',
  '.webm',
]);
const ZIP_MAGIC_HEADERS = [
  '504b0304',
  '504b0506',
  '504b0708',
];

export class DownloadFileFinalizer {
  async finalize(job: DownloadJob, downloaded: DownloadedFile) {
    await mkdir(dirname(downloaded.destinationPath), { recursive: true });

    if (await isZipFile(downloaded.destinationPath, downloaded.filename)) {
      return this.finalizeZip(job, downloaded);
    }

    const extension =
      extensionFromFilename(downloaded.filename) ??
      (await extensionFromMagic(downloaded.destinationPath)) ??
      '';

    return this.renameDownloadedFile(job, downloaded, extension);
  }

  private async finalizeZip(job: DownloadJob, downloaded: DownloadedFile) {
    const selectedEntry = await selectPrimaryZipMedia(downloaded.destinationPath);

    if (!selectedEntry) {
      throw new Error(
        `Downloaded zip did not contain a supported media file: ${downloaded.filename}`,
      );
    }

    const extension = extensionFromFilename(selectedEntry.fileName) ?? '';
    const finalFilename = canonicalFilename(job, extension);
    const finalPath = await nextAvailablePath(
      dirname(downloaded.destinationPath),
      finalFilename,
    );

    try {
      await extractZipEntry(
        downloaded.destinationPath,
        selectedEntry.fileName,
        finalPath,
      );
    } catch (error) {
      await rm(finalPath, { force: true });
      throw error;
    }

    try {
      await rm(downloaded.destinationPath, { force: true });
    } catch {
      await rm(finalPath, { force: true });
      throw new Error(`Extracted media but failed to remove ${downloaded.filename}`);
    }

    const finalStats = await stat(finalPath);

    return {
      ...downloaded,
      destinationPath: finalPath,
      filename: finalFilename,
      progressBytes: finalStats.size,
      totalBytes: finalStats.size,
    };
  }

  private async renameDownloadedFile(
    job: DownloadJob,
    downloaded: DownloadedFile,
    extension: string,
  ) {
    const finalFilename = canonicalFilename(job, extension);

    if (downloaded.filename === finalFilename) {
      const fileStats = await stat(downloaded.destinationPath);

      return {
        ...downloaded,
        progressBytes: fileStats.size,
        totalBytes: fileStats.size,
      };
    }

    const finalPath = await nextAvailablePath(
      dirname(downloaded.destinationPath),
      finalFilename,
    );

    await rename(downloaded.destinationPath, finalPath);

    const finalStats = await stat(finalPath);

    return {
      ...downloaded,
      destinationPath: finalPath,
      filename: finalFilename,
      progressBytes: finalStats.size,
      totalBytes: finalStats.size,
    };
  }
}

async function selectPrimaryZipMedia(zipPath: string) {
  const entries = await listZipEntries(zipPath);
  const files = entries.filter((entry) => !isDirectoryEntry(entry.fileName));
  const mediaFiles = files.filter((entry) =>
    VIDEO_EXTENSIONS.has(extensionFromFilename(entry.fileName) ?? ''),
  );
  const candidates = mediaFiles.length ? mediaFiles : files.length === 1 ? files : [];

  return candidates.sort(
    (first, second) => second.uncompressedSize - first.uncompressedSize,
  )[0];
}

function listZipEntries(zipPath: string) {
  return new Promise<ZipEntrySummary[]>((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError) {
          reject(openError);
          return;
        }

        if (!zipFile) {
          reject(new Error(`Could not open zip file: ${zipPath}`));
          return;
        }

        const entries: ZipEntrySummary[] = [];

        zipFile.on('entry', (entry: yauzl.Entry) => {
          entries.push({
            fileName: entry.fileName,
            uncompressedSize: entry.uncompressedSize,
          });
          zipFile.readEntry();
        });
        zipFile.once('end', () => {
          zipFile.close();
          resolve(entries);
        });
        zipFile.once('error', (error) => {
          zipFile.close();
          reject(error);
        });
        zipFile.readEntry();
      },
    );
  });
}

function extractZipEntry(
  zipPath: string,
  entryFileName: string,
  destinationPath: string,
) {
  return new Promise<void>((resolve, reject) => {
    yauzl.open(
      zipPath,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipFile) => {
        if (openError) {
          reject(openError);
          return;
        }

        if (!zipFile) {
          reject(new Error(`Could not open zip file: ${zipPath}`));
          return;
        }

        let matched = false;

        zipFile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName !== entryFileName) {
            zipFile.readEntry();
            return;
          }

          matched = true;
          zipFile.openReadStream(entry, (streamError, stream) => {
            if (streamError) {
              zipFile.close();
              reject(streamError);
              return;
            }

            pipeline(stream, createWriteStream(destinationPath, { flags: 'wx' }))
              .then(() => {
                zipFile.close();
                resolve();
              })
              .catch((error: unknown) => {
                zipFile.close();
                reject(error);
              });
          });
        });
        zipFile.once('end', () => {
          zipFile.close();

          if (!matched) {
            reject(new Error(`Zip entry was not found: ${entryFileName}`));
          }
        });
        zipFile.once('error', (error) => {
          zipFile.close();
          reject(error);
        });
        zipFile.readEntry();
      },
    );
  });
}

async function isZipFile(filePath: string, filename: string) {
  const extension = extensionFromFilename(filename);

  return (
    (extension ? ARCHIVE_EXTENSIONS.has(extension) : false) ||
    (await hasZipMagic(filePath))
  );
}

async function hasZipMagic(filePath: string) {
  const bytes = await readMagic(filePath, 4);
  const signature = bytes.toString('hex');

  return ZIP_MAGIC_HEADERS.includes(signature);
}

async function extensionFromMagic(filePath: string) {
  const bytes = await readMagic(filePath, 16);

  if (bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    return '.mp4';
  }

  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return '.mkv';
  }

  if (ZIP_MAGIC_HEADERS.includes(bytes.subarray(0, 4).toString('hex'))) {
    return '.zip';
  }

  return undefined;
}

async function readMagic(filePath: string, length: number) {
  const handle = await openFile(filePath, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);

    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function canonicalFilename(job: DownloadJob, extension: string) {
  const title =
    job.mediaContext?.displayTitle ??
    job.mediaContext?.sourceMediaTitle ??
    job.option.mediaTitle ??
    'Unknown title';
  const episodeNumber =
    job.mediaContext?.episodeNumber ?? job.option.episodeNumber ?? undefined;
  const parts = [
    title,
    episodeNumber ? episodeToken(episodeNumber) : undefined,
    job.option.quality ? cleanToken(job.option.quality) : undefined,
  ].filter(Boolean);
  const base = safeFilename(parts.join(' - '));
  const normalizedExtension = normalizeExtension(extension);

  return `${base || 'Elysium download'}${normalizedExtension}`;
}

function episodeToken(episodeNumber: string) {
  const trimmed = episodeNumber.trim();
  const parsed = Number(trimmed);

  if (Number.isFinite(parsed)) {
    return `EP ${String(parsed).padStart(2, '0')}`;
  }

  return `EP ${cleanToken(trimmed)}`;
}

function cleanToken(value: string) {
  return safeFilename(value).replace(/\s+/gu, ' ').trim();
}

function extensionFromFilename(filename: string) {
  const extension = normalizeExtension(extname(filename));

  return extension || undefined;
}

function normalizeExtension(extension: string) {
  if (!extension) {
    return '';
  }

  const normalized = extension.toLowerCase().replace(/[^.\da-z]/gu, '');

  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function isDirectoryEntry(fileName: string) {
  return fileName.endsWith('/') || fileName.endsWith('\\');
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

async function nextAvailablePath(downloadDir: string, filename: string) {
  for (let index = 0; index < 1_000; index += 1) {
    const candidate =
      index === 0
        ? join(downloadDir, filename)
        : join(downloadDir, withNumericSuffix(filename, index));

    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Could not create a unique download path for ${filename}`);
}

function withNumericSuffix(filename: string, index: number) {
  const extension = extname(filename);
  const baseName = extension ? filename.slice(0, -extension.length) : filename;

  return `${baseName} (${index})${extension}`;
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
