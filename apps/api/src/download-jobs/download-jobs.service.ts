import { Injectable, NotFoundException } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { finished } from 'node:stream/promises';
import type {
  DownloadJob,
  DownloadOption,
  ResolvedDownload,
} from '@elysium/shared';
import { DownloadConnectionResolver } from '../download-engine/download-connection-resolver';
import {
  GopeedClient,
  type GopeedTask,
} from '../download-engine/gopeed-client';

const DEFAULT_DOWNLOAD_DIR = resolve(process.cwd(), '../../.local/downloads');
const DOWNLOAD_HEADERS = {
  accept: '*/*',
  'accept-encoding': 'identity',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Elysium/0.1',
};

@Injectable()
export class DownloadJobsService {
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly resolver = new DownloadConnectionResolver();
  private readonly gopeed = new GopeedClient();

  createJob(option: DownloadOption): DownloadJob {
    const now = new Date().toISOString();
    const job: DownloadJob = {
      id: randomUUID(),
      option,
      status: 'queued',
      progressBytes: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    void this.startJob(job.id);

    return job;
  }

  async listJobs(): Promise<DownloadJob[]> {
    await Promise.allSettled(
      Array.from(this.jobs.values()).map((job) => this.syncGopeedJob(job)),
    );

    return Array.from(this.jobs.values()).toSorted((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    );
  }

  async getJob(id: string): Promise<DownloadJob> {
    const job = this.jobs.get(id);

    if (!job) {
      throw new NotFoundException(`Unknown download job: ${id}`);
    }

    await this.syncGopeedJob(job);

    return job;
  }

  private async startJob(id: string) {
    const job = this.jobs.get(id);

    if (!job) {
      return;
    }

    try {
      this.updateJob(job, { status: 'resolving' });
      const connection = await this.resolver.resolve(job.option);

      if (connection.status !== 'resolved' || !connection.resolved?.directUrl) {
        this.updateJob(job, {
          status: connection.status === 'unsupported' ? 'cancelled' : 'failed',
          errorMessage:
            connection.message ?? 'Download option could not be resolved',
        });
        return;
      }

      this.updateJob(job, {
        filename: connection.resolved.filename,
        resolved: connection.resolved,
        totalBytes: connection.resolved.sizeBytes,
      });

      if (process.env.ELYSIUM_DOWNLOAD_ENGINE !== 'local') {
        const startedByGopeed = await this.tryStartGopeedJob(
          job,
          connection.resolved,
        );

        if (startedByGopeed) {
          return;
        }
      }

      await this.downloadLocally(job, connection.resolved);
    } catch (error) {
      this.updateJob(job, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async tryStartGopeedJob(
    job: DownloadJob,
    resolvedDownload: ResolvedDownload,
  ) {
    try {
      await this.gopeed.getInfo();
      const task = await this.gopeed.createTask(resolvedDownload);

      this.updateJob(job, {
        engine: 'gopeed',
        externalTaskId: task.id,
        status: 'downloading',
      });
      await this.syncGopeedJob(job);

      return true;
    } catch (error) {
      this.updateJob(job, {
        errorMessage: `Gopeed unavailable, using local downloader: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });

      return false;
    }
  }

  private async syncGopeedJob(job: DownloadJob) {
    if (
      job.engine !== 'gopeed' ||
      !job.externalTaskId ||
      isTerminal(job.status)
    ) {
      return;
    }

    try {
      const task = await this.gopeed.getTask(job.externalTaskId);
      this.updateJob(job, {
        filename: task.name || job.filename,
        progressBytes: task.progress.downloaded,
        speedBytesPerSecond: task.progress.speed,
        status: mapGopeedStatus(task),
        totalBytes: task.size || job.totalBytes,
      });
    } catch (error) {
      this.updateJob(job, {
        errorMessage: `Could not refresh Gopeed task: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  private async downloadLocally(
    job: DownloadJob,
    resolvedDownload: ResolvedDownload,
  ) {
    if (!resolvedDownload.directUrl) {
      throw new Error('Local download requires a direct URL');
    }

    const downloadDir =
      process.env.ELYSIUM_DOWNLOAD_DIR ?? DEFAULT_DOWNLOAD_DIR;
    const filename = safeFilename(
      resolvedDownload.filename ?? filenameFromUrl(resolvedDownload.directUrl),
    );

    await mkdir(downloadDir, { recursive: true });
    const destinationPath = await nextAvailablePath(downloadDir, filename);
    this.updateJob(job, {
      destinationPath,
      engine: 'local-fetch',
      filename,
      status: 'downloading',
    });

    const response = await fetch(resolvedDownload.directUrl, {
      headers: {
        ...DOWNLOAD_HEADERS,
        referer: resolvedDownload.sourceUrl,
      },
      redirect: 'follow',
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Download request failed: ${response.status} ${response.statusText}`,
      );
    }

    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength
      ? Number(contentLength)
      : resolvedDownload.sizeBytes;
    const writer = createWriteStream(destinationPath, { flags: 'wx' });
    const reader = response.body.getReader();
    const startedAt = Date.now();

    if (Number.isFinite(totalBytes)) {
      this.updateJob(job, { totalBytes });
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
        this.updateJob(job, {
          progressBytes,
          speedBytesPerSecond: bytesPerSecond(progressBytes, startedAt),
        });
      }

      await closeWriter(writer);
      this.updateJob(job, {
        progressBytes:
          totalBytes && totalBytes > progressBytes ? totalBytes : progressBytes,
        speedBytesPerSecond: 0,
        status: 'completed',
      });
    } catch (error) {
      writer.destroy();
      throw error;
    }
  }

  private updateJob(job: DownloadJob, patch: Partial<DownloadJob>) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}

function mapGopeedStatus(task: GopeedTask): DownloadJob['status'] {
  switch (task.status) {
    case 'done':
      return 'completed';
    case 'error':
      return 'failed';
    case 'pause':
      return 'paused';
    case 'ready':
    case 'wait':
      return 'queued';
    case 'running':
      return 'downloading';
  }
}

function isTerminal(status: DownloadJob['status']) {
  return ['completed', 'failed', 'cancelled'].includes(status);
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
