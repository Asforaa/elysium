import { Injectable, NotFoundException } from '@nestjs/common';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  DownloadJob,
  DownloadOption,
  ResolvedDownload,
} from '@elysium/shared';
import { DownloadConnectionResolver } from '../download-engine/download-connection-resolver';
import { LocalDownloader } from '../download-engine/local-downloader';

const DEFAULT_DOWNLOAD_DIR = resolve(process.cwd(), '../../.local/downloads');

@Injectable()
export class DownloadJobsService {
  private readonly jobs = new Map<string, DownloadJob>();
  private readonly resolver = new DownloadConnectionResolver();
  private readonly downloader = new LocalDownloader();

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
    return Array.from(this.jobs.values()).toSorted((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    );
  }

  async getJob(id: string): Promise<DownloadJob> {
    const job = this.jobs.get(id);

    if (!job) {
      throw new NotFoundException(`Unknown download job: ${id}`);
    }

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

      if (connection.status !== 'resolved' || !connection.resolved) {
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

      if (!canDownloadLocally(connection.resolved)) {
        this.updateJob(job, {
          status: 'failed',
          errorMessage:
            'Download option resolved without a local download path',
        });
        return;
      }

      await this.downloadLocally(job, connection.resolved);
    } catch (error) {
      this.updateJob(job, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async downloadLocally(
    job: DownloadJob,
    resolvedDownload: ResolvedDownload,
  ) {
    const downloadDir =
      process.env.ELYSIUM_DOWNLOAD_DIR ?? DEFAULT_DOWNLOAD_DIR;

    const result = await this.downloader.download(resolvedDownload, {
      downloadDir,
      onProgress: (progress) => this.updateJob(job, progress),
      onStart: (download) => {
        this.updateJob(job, {
          ...download,
          progressBytes: 0,
          status: 'downloading',
        });
      },
    });

    this.updateJob(job, {
      destinationPath: result.destinationPath,
      engine: result.engine,
      filename: result.filename,
      progressBytes: result.progressBytes,
      speedBytesPerSecond: 0,
      status: 'completed',
      totalBytes: result.totalBytes,
    });
  }

  private updateJob(job: DownloadJob, patch: Partial<DownloadJob>) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  }
}

function canDownloadLocally(download: ResolvedDownload) {
  return (
    Boolean(download.directUrl) ||
    (download.engine === 'custom' &&
      download.provider.toLowerCase().trim() === 'mega')
  );
}
