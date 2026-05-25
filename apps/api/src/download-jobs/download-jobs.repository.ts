import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  DownloadJob,
  DownloadJobEngine,
  DownloadJobStatus,
  DownloadMediaContext,
  DownloadOption,
  LocalMediaFile,
  ResolvedDownload,
} from '@elysium/shared';
import { DatabaseService } from '../database/database.service';

type DownloadJobPatch = Partial<
  Pick<
    DownloadJob,
    | 'attemptCount'
    | 'completedAt'
    | 'destinationPath'
    | 'engine'
    | 'errorMessage'
    | 'filename'
    | 'mediaContext'
    | 'progressBytes'
    | 'resolved'
    | 'speedBytesPerSecond'
    | 'status'
    | 'totalBytes'
  >
>;

interface DownloadJobRow {
  id: string;
  option: DownloadOption;
  media_context: DownloadMediaContext | null;
  status: DownloadJobStatus;
  engine: DownloadJobEngine | null;
  resolved: ResolvedDownload | null;
  destination_path: string | null;
  filename: string | null;
  progress_bytes: string | number;
  total_bytes: string | number | null;
  speed_bytes_per_second: string | number | null;
  error_message: string | null;
  attempt_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at: Date | string | null;
}

interface LocalMediaFileRow {
  id: string;
  download_job_id: string;
  metadata_provider: string | null;
  metadata_id: number | null;
  display_title: string | null;
  source_provider: string | null;
  source_media_title: string | null;
  source_media_url: string | null;
  episode_title: string | null;
  episode_number: string | null;
  quality: string;
  host_provider: string;
  file_path: string;
  filename: string;
  size_bytes: string | number | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AttemptPatch {
  completedAt?: string;
  destinationPath?: string;
  engine?: DownloadJobEngine;
  errorMessage?: string;
  filename?: string;
  progressBytes?: number;
  resolved?: ResolvedDownload;
  status?: DownloadJobStatus;
  totalBytes?: number;
}

const ACTIVE_STATUSES: DownloadJobStatus[] = [
  'queued',
  'resolving',
  'downloading',
];

@Injectable()
export class DownloadJobsRepository {
  constructor(private readonly database: DatabaseService) {}

  async createJob({
    id,
    mediaContext,
    option,
  }: {
    id: string;
    mediaContext?: DownloadMediaContext;
    option: DownloadOption;
  }) {
    const result = await this.database.query<DownloadJobRow>(
      `
        insert into download_jobs (
          id,
          option,
          media_context,
          status,
          progress_bytes,
          attempt_count
        )
        values ($1, $2::jsonb, $3::jsonb, 'queued', 0, 0)
        returning *
      `,
      [
        id,
        JSON.stringify(option),
        mediaContext ? JSON.stringify(mediaContext) : null,
      ],
    );

    return mapDownloadJob(result.rows[0]);
  }

  async listJobs() {
    const result = await this.database.query<DownloadJobRow>(
      'select * from download_jobs order by created_at desc',
    );

    return result.rows.map(mapDownloadJob);
  }

  async getJob(id: string) {
    const result = await this.database.query<DownloadJobRow>(
      'select * from download_jobs where id = $1',
      [id],
    );

    return result.rows[0] ? mapDownloadJob(result.rows[0]) : undefined;
  }

  async updateJob(id: string, patch: DownloadJobPatch) {
    const updates = toDownloadJobUpdate(patch);

    if (!updates.values.length) {
      return this.getJob(id);
    }

    const setClauses = updates.values.map(
      (_, index) => `${updates.columns[index]} = $${index + 2}`,
    );
    const result = await this.database.query<DownloadJobRow>(
      `
        update download_jobs
        set ${setClauses.join(', ')}, updated_at = now()
        where id = $1
        returning *
      `,
      [id, ...updates.values],
    );

    return result.rows[0] ? mapDownloadJob(result.rows[0]) : undefined;
  }

  async markInterruptedJobsFailed() {
    const result = await this.database.query<DownloadJobRow>(
      `
        update download_jobs
        set
          status = 'failed',
          speed_bytes_per_second = 0,
          error_message = coalesce(error_message, 'Download interrupted by backend restart'),
          updated_at = now()
        where status = any($1::text[])
        returning *
      `,
      [ACTIVE_STATUSES],
    );

    await this.database.query(
      `
        update download_job_attempts
        set
          status = 'failed',
          error_message = coalesce(error_message, 'Download interrupted by backend restart'),
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
        where status = any($1::text[]) and completed_at is null
      `,
      [ACTIVE_STATUSES],
    );

    return result.rows.map(mapDownloadJob);
  }

  async createAttempt(job: DownloadJob) {
    const attemptNumber = job.attemptCount + 1;

    await this.database.transaction(async (client) => {
      await client.query(
        `
          update download_jobs
          set
            attempt_count = $2,
            completed_at = null,
            destination_path = null,
            engine = null,
            error_message = null,
            filename = null,
            progress_bytes = 0,
            resolved = null,
            speed_bytes_per_second = null,
            status = 'resolving',
            total_bytes = null,
            updated_at = now()
          where id = $1
        `,
        [job.id, attemptNumber],
      );
      await client.query(
        `
          insert into download_job_attempts (
            id,
            job_id,
            attempt_number,
            status
          )
          values ($1, $2, $3, 'resolving')
        `,
        [randomUUID(), job.id, attemptNumber],
      );
    });

    const updated = await this.getJob(job.id);

    if (!updated) {
      throw new Error(`Unknown download job after attempt creation: ${job.id}`);
    }

    return updated;
  }

  async updateAttempt(
    jobId: string,
    attemptNumber: number,
    patch: AttemptPatch,
  ) {
    const updates = toAttemptUpdate(patch);

    if (!updates.values.length) {
      return;
    }

    const setClauses = updates.values.map(
      (_, index) => `${updates.columns[index]} = $${index + 3}`,
    );

    await this.database.query(
      `
        update download_job_attempts
        set ${setClauses.join(', ')}, updated_at = now()
        where job_id = $1 and attempt_number = $2
      `,
      [jobId, attemptNumber, ...updates.values],
    );
  }

  async upsertLocalMediaFile(job: DownloadJob) {
    if (!job.destinationPath || !job.filename) {
      return undefined;
    }

    const context = job.mediaContext;
    const result = await this.database.query<LocalMediaFileRow>(
      `
        insert into local_media_files (
          id,
          download_job_id,
          metadata_provider,
          metadata_id,
          display_title,
          source_provider,
          source_media_title,
          source_media_url,
          episode_title,
          episode_number,
          quality,
          host_provider,
          file_path,
          filename,
          size_bytes
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15
        )
        on conflict (download_job_id) do update
        set
          metadata_provider = excluded.metadata_provider,
          metadata_id = excluded.metadata_id,
          display_title = excluded.display_title,
          source_provider = excluded.source_provider,
          source_media_title = excluded.source_media_title,
          source_media_url = excluded.source_media_url,
          episode_title = excluded.episode_title,
          episode_number = excluded.episode_number,
          quality = excluded.quality,
          host_provider = excluded.host_provider,
          file_path = excluded.file_path,
          filename = excluded.filename,
          size_bytes = excluded.size_bytes,
          updated_at = now()
        returning *
      `,
      [
        randomUUID(),
        job.id,
        context?.metadataProvider ?? null,
        context?.metadataId ?? null,
        context?.displayTitle ?? job.option.mediaTitle ?? null,
        context?.sourceProvider ?? job.option.sourceProvider,
        context?.sourceMediaTitle ?? job.option.mediaTitle ?? null,
        context?.sourceMediaUrl ?? job.option.sourcePageUrl,
        context?.episodeTitle ?? job.option.episodeTitle ?? null,
        context?.episodeNumber ?? job.option.episodeNumber ?? null,
        job.option.quality,
        job.option.hostProvider,
        job.destinationPath,
        job.filename,
        job.totalBytes ?? null,
      ],
    );

    return mapLocalMediaFile(result.rows[0]);
  }

  async listLocalMediaFiles() {
    const result = await this.database.query<LocalMediaFileRow>(
      'select * from local_media_files order by created_at desc',
    );

    return result.rows.map(mapLocalMediaFile);
  }
}

function toDownloadJobUpdate(patch: DownloadJobPatch) {
  const columns: string[] = [];
  const values: unknown[] = [];

  addJsonUpdate(columns, values, 'media_context', patch.mediaContext);
  addUpdate(columns, values, 'status', patch.status);
  addUpdate(columns, values, 'engine', patch.engine);
  addJsonUpdate(columns, values, 'resolved', patch.resolved);
  addUpdate(columns, values, 'destination_path', patch.destinationPath);
  addUpdate(columns, values, 'filename', patch.filename);
  addUpdate(columns, values, 'progress_bytes', patch.progressBytes);
  addUpdate(columns, values, 'total_bytes', patch.totalBytes);
  addUpdate(
    columns,
    values,
    'speed_bytes_per_second',
    patch.speedBytesPerSecond,
  );
  addUpdate(columns, values, 'error_message', patch.errorMessage);
  addUpdate(columns, values, 'attempt_count', patch.attemptCount);
  addUpdate(columns, values, 'completed_at', patch.completedAt);

  return { columns, values };
}

function toAttemptUpdate(patch: AttemptPatch) {
  const columns: string[] = [];
  const values: unknown[] = [];

  addUpdate(columns, values, 'status', patch.status);
  addUpdate(columns, values, 'engine', patch.engine);
  addJsonUpdate(columns, values, 'resolved', patch.resolved);
  addUpdate(columns, values, 'destination_path', patch.destinationPath);
  addUpdate(columns, values, 'filename', patch.filename);
  addUpdate(columns, values, 'progress_bytes', patch.progressBytes);
  addUpdate(columns, values, 'total_bytes', patch.totalBytes);
  addUpdate(columns, values, 'error_message', patch.errorMessage);
  addUpdate(columns, values, 'completed_at', patch.completedAt);

  return { columns, values };
}

function addUpdate(
  columns: string[],
  values: unknown[],
  column: string,
  value: unknown,
) {
  if (value === undefined) {
    return;
  }

  columns.push(column);
  values.push(value);
}

function addJsonUpdate(
  columns: string[],
  values: unknown[],
  column: string,
  value: unknown,
) {
  if (value === undefined) {
    return;
  }

  columns.push(column);
  values.push(value === null ? null : JSON.stringify(value));
}

function mapDownloadJob(row: DownloadJobRow): DownloadJob {
  const job: DownloadJob = {
    id: row.id,
    option: row.option,
    status: row.status,
    progressBytes: toNumber(row.progress_bytes) ?? 0,
    attemptCount: row.attempt_count,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  if (row.media_context) {
    job.mediaContext = row.media_context;
  }

  if (row.engine) {
    job.engine = row.engine;
  }

  if (row.resolved) {
    job.resolved = row.resolved;
  }

  if (row.destination_path) {
    job.destinationPath = row.destination_path;
  }

  if (row.filename) {
    job.filename = row.filename;
  }

  const totalBytes = toNumber(row.total_bytes);

  if (totalBytes !== undefined) {
    job.totalBytes = totalBytes;
  }

  const speedBytesPerSecond = toNumber(row.speed_bytes_per_second);

  if (speedBytesPerSecond !== undefined) {
    job.speedBytesPerSecond = speedBytesPerSecond;
  }

  if (row.error_message) {
    job.errorMessage = row.error_message;
  }

  if (row.completed_at) {
    job.completedAt = toIsoString(row.completed_at);
  }

  return job;
}

function mapLocalMediaFile(row: LocalMediaFileRow): LocalMediaFile {
  const file: LocalMediaFile = {
    id: row.id,
    downloadJobId: row.download_job_id,
    quality: row.quality,
    hostProvider: row.host_provider,
    filePath: row.file_path,
    filename: row.filename,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  if (row.metadata_provider) {
    file.metadataProvider = row.metadata_provider;
  }

  if (row.metadata_id !== null) {
    file.metadataId = row.metadata_id;
  }

  if (row.display_title) {
    file.displayTitle = row.display_title;
  }

  if (row.source_provider) {
    file.sourceProvider = row.source_provider;
  }

  if (row.source_media_title) {
    file.sourceMediaTitle = row.source_media_title;
  }

  if (row.source_media_url) {
    file.sourceMediaUrl = row.source_media_url;
  }

  if (row.episode_title) {
    file.episodeTitle = row.episode_title;
  }

  if (row.episode_number) {
    file.episodeNumber = row.episode_number;
  }

  const sizeBytes = toNumber(row.size_bytes);

  if (sizeBytes !== undefined) {
    file.sizeBytes = sizeBytes;
  }

  return file;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
