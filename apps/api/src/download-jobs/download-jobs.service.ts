import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CreateDownloadJobRequest,
  DownloadJob,
  ResolvedDownload,
} from '@elysium/shared';
import { DownloadConnectionResolver } from '../download-engine/download-connection-resolver';
import { LocalDownloader } from '../download-engine/local-downloader';
import { DownloadJobsRepository } from './download-jobs.repository';

const DEFAULT_DOWNLOAD_DIR = resolve(process.cwd(), '../../.local/downloads');
const ACTIVE_DOWNLOAD_STATUSES: DownloadJob['status'][] = [
  'queued',
  'resolving',
  'downloading',
  'paused',
];

@Injectable()
export class DownloadJobsService implements OnModuleInit {
  private readonly resolver = new DownloadConnectionResolver();
  private readonly downloader = new LocalDownloader();
  private readonly updateQueues = new Map<
    string,
    Promise<DownloadJob | undefined>
  >();

  constructor(private readonly repository: DownloadJobsRepository) {}

  async onModuleInit() {
    await this.repository.markInterruptedJobsFailed();
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
    }
  }

  private async downloadLocally(
    job: DownloadJob,
    resolvedDownload: ResolvedDownload,
    attemptNumber: number,
  ) {
    const downloadDir =
      process.env.ELYSIUM_DOWNLOAD_DIR ?? DEFAULT_DOWNLOAD_DIR;

    const result = await this.downloader.download(resolvedDownload, {
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

  private async updateJob(job: DownloadJob, patch: Partial<DownloadJob>) {
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
