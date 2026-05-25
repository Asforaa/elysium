import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CreateDownloadJobRequest,
  DownloadJob,
  ResolvedDownload,
} from '@elysium/shared';
import { DownloadConnectionResolver } from '../download-engine/download-connection-resolver';
import { DownloadFileFinalizer } from '../download-engine/download-file-finalizer';
import { LocalDownloader } from '../download-engine/local-downloader';
import { DownloadJobsRepository } from './download-jobs.repository';

const DEFAULT_DOWNLOAD_DIR = resolve(process.cwd(), '../../.local/downloads');
const ACTIVE_DOWNLOAD_STATUSES: DownloadJob['status'][] = [
  'queued',
  'resolving',
  'downloading',
  'paused',
];

interface DownloadJobPatch {
  completedAt?: string | null;
  destinationPath?: string | null;
  engine?: DownloadJob['engine'] | null;
  errorMessage?: string | null;
  filename?: string | null;
  progressBytes?: number;
  resolved?: ResolvedDownload | null;
  speedBytesPerSecond?: number | null;
  status?: DownloadJob['status'];
  totalBytes?: number | null;
}

@Injectable()
export class DownloadJobsService implements OnModuleInit {
  private readonly resolver = new DownloadConnectionResolver();
  private readonly downloader = new LocalDownloader();
  private readonly finalizer = new DownloadFileFinalizer();
  private readonly updateQueues = new Map<
    string,
    Promise<DownloadJob | undefined>
  >();

  constructor(private readonly repository: DownloadJobsRepository) {}

  async onModuleInit() {
    const interruptedJobs = await this.repository.markInterruptedJobsFailed();

    await Promise.all(
      interruptedJobs.map((job) => this.recoverOrCleanupInterruptedJob(job)),
    );
  }

  async createJob(request: CreateDownloadJobRequest): Promise<DownloadJob> {
    const job = await this.repository.createJob({
      id: randomUUID(),
      mediaContext: request.mediaContext,
      option: request.option,
    });

    void this.startJob(job.id);

    return job;
  }

  async listJobs(): Promise<DownloadJob[]> {
    return this.repository.listJobs();
  }

  async getJob(id: string): Promise<DownloadJob> {
    const job = await this.repository.getJob(id);

    if (!job) {
      throw new NotFoundException(`Unknown download job: ${id}`);
    }

    return job;
  }

  async retryJob(id: string): Promise<DownloadJob> {
    const job = await this.getJob(id);

    if (ACTIVE_DOWNLOAD_STATUSES.includes(job.status)) {
      throw new BadRequestException('Download job is already active');
    }

    void this.startJob(job.id);

    return {
      ...job,
      errorMessage: undefined,
      progressBytes: 0,
      speedBytesPerSecond: undefined,
      status: 'queued',
    };
  }

  async finalizeCompletedFiles() {
    const jobs = await this.repository.listJobs();
    const results: Array<{
      id: string;
      changed: boolean;
      errorMessage?: string;
      filename?: string;
    }> = [];

    for (const job of jobs) {
      if (
        job.status === 'failed' &&
        job.destinationPath &&
        job.errorMessage?.includes('interrupted')
      ) {
        const completedAt = new Date().toISOString();

        await this.removePartialDownload(job.destinationPath);
        await this.repository.updateJob(job.id, {
          completedAt,
          destinationPath: null,
          errorMessage: 'Download interrupted by backend restart; partial file removed',
          filename: null,
          progressBytes: 0,
          totalBytes: null,
        });
        await this.repository.updateAttempt(job.id, job.attemptCount, {
          completedAt,
          destinationPath: null,
          errorMessage: 'Download interrupted by backend restart; partial file removed',
          filename: null,
          progressBytes: 0,
          totalBytes: null,
        });
        results.push({
          id: job.id,
          changed: true,
          errorMessage: 'Removed interrupted partial download file',
          filename: job.filename,
        });
        continue;
      }

      if (
        job.status !== 'completed' ||
        !job.destinationPath ||
        !job.filename ||
        !job.engine
      ) {
        continue;
      }

      try {
        const finalized = await this.finalizer.finalize(job, {
          destinationPath: job.destinationPath,
          engine: job.engine,
          filename: job.filename,
          progressBytes: job.progressBytes,
          totalBytes: job.totalBytes,
        });
        const changed =
          finalized.destinationPath !== job.destinationPath ||
          finalized.filename !== job.filename ||
          finalized.totalBytes !== job.totalBytes;

        if (changed) {
          Object.assign(job, {
            destinationPath: finalized.destinationPath,
            filename: finalized.filename,
            progressBytes: finalized.progressBytes,
            totalBytes: finalized.totalBytes,
          });
          await this.repository.updateJob(job.id, {
            destinationPath: finalized.destinationPath,
            filename: finalized.filename,
            progressBytes: finalized.progressBytes,
            totalBytes: finalized.totalBytes,
          });
          await this.repository.upsertLocalMediaFile(job);
        }

        results.push({
          id: job.id,
          changed,
          filename: finalized.filename,
        });
      } catch (error) {
        results.push({
          id: job.id,
          changed: false,
          errorMessage: error instanceof Error ? error.message : String(error),
          filename: job.filename,
        });
      }
    }

    return results;
  }

  private async startJob(id: string) {
    let job = await this.repository.getJob(id);

    if (!job) {
      return;
    }

    job = await this.repository.createAttempt(job);
    const attemptNumber = job.attemptCount;

    try {
      const connection = await this.resolver.resolve(job.option);

      if (connection.status !== 'resolved' || !connection.resolved) {
        const failedAt = new Date().toISOString();
        const status =
          connection.status === 'unsupported' ? 'cancelled' : 'failed';
        const errorMessage =
          connection.message ?? 'Download option could not be resolved';

        await this.updateJob(job, {
          completedAt: failedAt,
          errorMessage,
          speedBytesPerSecond: 0,
          status,
        });
        await this.repository.updateAttempt(job.id, attemptNumber, {
          completedAt: failedAt,
          errorMessage,
          status: connection.status === 'unsupported' ? 'cancelled' : 'failed',
        });
        return;
      }

      job = await this.updateJob(job, {
        filename: connection.resolved.filename,
        resolved: connection.resolved,
        totalBytes: connection.resolved.sizeBytes,
      });
      await this.repository.updateAttempt(job.id, attemptNumber, {
        filename: connection.resolved.filename,
        resolved: connection.resolved,
        status: 'resolving',
        totalBytes: connection.resolved.sizeBytes,
      });

      if (!canDownloadLocally(connection.resolved)) {
        const failedAt = new Date().toISOString();
        const errorMessage =
          'Download option resolved without a local download path';

        await this.updateJob(job, {
          completedAt: failedAt,
          errorMessage,
          speedBytesPerSecond: 0,
          status: 'failed',
        });
        await this.repository.updateAttempt(job.id, attemptNumber, {
          completedAt: failedAt,
          errorMessage,
          status: 'failed',
        });
        return;
      }

      await this.downloadLocally(job, connection.resolved, attemptNumber);
    } catch (error) {
      const failedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);
      const partialDestinationPath = job.destinationPath;

      await this.updateJob(job, {
        completedAt: failedAt,
        destinationPath: null,
        errorMessage,
        filename: null,
        speedBytesPerSecond: 0,
        status: 'failed',
        totalBytes: null,
      });
      await this.removePartialDownload(partialDestinationPath);
      await this.repository.updateAttempt(job.id, attemptNumber, {
        completedAt: failedAt,
        destinationPath: null,
        errorMessage,
        filename: null,
        status: 'failed',
        totalBytes: null,
      });
    }
  }

  private async downloadLocally(
    job: DownloadJob,
    resolvedDownload: ResolvedDownload,
    attemptNumber: number,
  ) {
    const downloadDir =
      process.env.ELYSIUM_DOWNLOAD_DIR ?? DEFAULT_DOWNLOAD_DIR;

    const rawResult = await this.downloader.download(resolvedDownload, {
      downloadDir,
      onProgress: (progress) => {
        void this.updateJob(job, progress).catch(() => undefined);
        void this.repository.updateAttempt(job.id, attemptNumber, progress);
      },
      onStart: (download) => {
        void this.updateJob(job, {
          ...download,
          progressBytes: 0,
          status: 'downloading',
        }).catch(() => undefined);
        void this.repository.updateAttempt(job.id, attemptNumber, {
          ...download,
          progressBytes: 0,
          status: 'downloading',
        });
      },
    });
    const result = await this.finalizer.finalize(job, rawResult);

    const completedAt = new Date().toISOString();

    job = await this.updateJob(job, {
      completedAt,
      destinationPath: result.destinationPath,
      engine: result.engine,
      filename: result.filename,
      progressBytes: result.progressBytes,
      speedBytesPerSecond: 0,
      status: 'completed',
      totalBytes: result.totalBytes,
    });
    await this.repository.updateAttempt(job.id, attemptNumber, {
      completedAt,
      destinationPath: result.destinationPath,
      engine: result.engine,
      filename: result.filename,
      progressBytes: result.progressBytes,
      status: 'completed',
      totalBytes: result.totalBytes,
    });
    await this.repository.upsertLocalMediaFile(job);
  }

  private async recoverOrCleanupInterruptedJob(job: DownloadJob) {
    if (!job.destinationPath || !job.filename || !job.engine) {
      return;
    }

    const fileStats = await stat(job.destinationPath).catch(() => undefined);

    if (!fileStats) {
      return;
    }

    if (job.totalBytes && fileStats.size >= job.totalBytes) {
      try {
        const finalized = await this.finalizer.finalize(job, {
          destinationPath: job.destinationPath,
          engine: job.engine,
          filename: job.filename,
          progressBytes: fileStats.size,
          totalBytes: fileStats.size,
        });
        const completedAt = new Date().toISOString();

        Object.assign(job, {
          completedAt,
          destinationPath: finalized.destinationPath,
          errorMessage: undefined,
          filename: finalized.filename,
          progressBytes: finalized.progressBytes,
          speedBytesPerSecond: 0,
          status: 'completed',
          totalBytes: finalized.totalBytes,
        });

        await this.repository.updateJob(job.id, {
          completedAt,
          destinationPath: finalized.destinationPath,
          errorMessage: null,
          filename: finalized.filename,
          progressBytes: finalized.progressBytes,
          speedBytesPerSecond: 0,
          status: 'completed',
          totalBytes: finalized.totalBytes,
        });
        await this.repository.updateAttempt(job.id, job.attemptCount, {
          completedAt,
          destinationPath: finalized.destinationPath,
          errorMessage: null,
          filename: finalized.filename,
          progressBytes: finalized.progressBytes,
          status: 'completed',
          totalBytes: finalized.totalBytes,
        });
        await this.repository.upsertLocalMediaFile(job);
        return;
      } catch {
        // A preallocated interrupted segmented file can match the expected size
        // while still being corrupt, so fall through to cleanup.
      }
    }

    const completedAt = new Date().toISOString();

    await this.removePartialDownload(job.destinationPath);
    await this.repository.updateJob(job.id, {
      completedAt,
      destinationPath: null,
      errorMessage: 'Download interrupted by backend restart; partial file removed',
      filename: null,
      progressBytes: 0,
      totalBytes: null,
    });
    await this.repository.updateAttempt(job.id, job.attemptCount, {
      completedAt,
      destinationPath: null,
      errorMessage: 'Download interrupted by backend restart; partial file removed',
      filename: null,
      progressBytes: 0,
      totalBytes: null,
    });
  }

  private async removePartialDownload(destinationPath?: string) {
    if (!destinationPath || !isInsideDownloadDir(destinationPath)) {
      return;
    }

    await rm(destinationPath, { force: true });
  }

  private async updateJob(job: DownloadJob, patch: DownloadJobPatch) {
    Object.assign(job, patch);

    const previousUpdate = this.updateQueues.get(job.id) ?? Promise.resolve(job);
    const currentUpdate = previousUpdate
      .catch(() => undefined)
      .then(() => this.repository.updateJob(job.id, patch));

    this.updateQueues.set(job.id, currentUpdate);

    const updated = await currentUpdate;

    if (!updated) {
      throw new NotFoundException(`Unknown download job: ${job.id}`);
    }

    Object.assign(job, updated);

    if (this.updateQueues.get(job.id) === currentUpdate) {
      this.updateQueues.delete(job.id);
    }

    return job;
  }
}

function canDownloadLocally(download: ResolvedDownload) {
  return (
    Boolean(download.directUrl) ||
    (download.engine === 'custom' &&
      download.provider.toLowerCase().trim() === 'mega')
  );
}

function isInsideDownloadDir(destinationPath: string) {
  const downloadDir = process.env.ELYSIUM_DOWNLOAD_DIR ?? DEFAULT_DOWNLOAD_DIR;
  const relativePath = relative(resolve(downloadDir), resolve(destinationPath));

  return (
    Boolean(relativePath) &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  );
}
