import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  PlaybackProgress,
  SavePlaybackProgressRequest,
} from '@elysium/shared';
import { DatabaseService } from '../database/database.service';

interface PlaybackProgressRow {
  id: string;
  local_media_file_id: string | null;
  metadata_provider: string | null;
  metadata_id: number | null;
  source_provider: string | null;
  source_media_url: string | null;
  episode_url: string | null;
  media_title: string | null;
  episode_title: string | null;
  episode_number: string | null;
  position_seconds: string | number;
  duration_seconds: string | number | null;
  completed: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class PlaybackRepository {
  constructor(private readonly database: DatabaseService) {}

  async saveProgress(input: SavePlaybackProgressRequest) {
    const existing = await this.findExisting(input);
    const payload = normalizeProgressInput(input);

    if (existing) {
      const result = await this.database.query<PlaybackProgressRow>(
        `
          update playback_progress
          set
            local_media_file_id = $2,
            metadata_provider = $3,
            metadata_id = $4,
            source_provider = $5,
            source_media_url = $6,
            episode_url = $7,
            media_title = $8,
            episode_title = $9,
            episode_number = $10,
            position_seconds = $11,
            duration_seconds = $12,
            completed = $13,
            updated_at = now()
          where id = $1
          returning *
        `,
        [
          existing.id,
          payload.localMediaFileId,
          payload.metadataProvider,
          payload.metadataId,
          payload.sourceProvider,
          payload.sourceMediaUrl,
          payload.episodeUrl,
          payload.mediaTitle,
          payload.episodeTitle,
          payload.episodeNumber,
          payload.positionSeconds,
          payload.durationSeconds,
          payload.completed,
        ],
      );

      return mapPlaybackProgress(result.rows[0]);
    }

    const result = await this.database.query<PlaybackProgressRow>(
      `
        insert into playback_progress (
          id,
          local_media_file_id,
          metadata_provider,
          metadata_id,
          source_provider,
          source_media_url,
          episode_url,
          media_title,
          episode_title,
          episode_number,
          position_seconds,
          duration_seconds,
          completed
        )
        values (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13
        )
        returning *
      `,
      [
        randomUUID(),
        payload.localMediaFileId,
        payload.metadataProvider,
        payload.metadataId,
        payload.sourceProvider,
        payload.sourceMediaUrl,
        payload.episodeUrl,
        payload.mediaTitle,
        payload.episodeTitle,
        payload.episodeNumber,
        payload.positionSeconds,
        payload.durationSeconds,
        payload.completed,
      ],
    );

    return mapPlaybackProgress(result.rows[0]);
  }

  async getProgress(query: Partial<SavePlaybackProgressRequest>) {
    return this.findExisting(query);
  }

  async listContinueWatching() {
    const result = await this.database.query<PlaybackProgressRow>(
      `
        select *
        from playback_progress
        where completed = false
          and position_seconds > 0
        order by updated_at desc
        limit 50
      `,
    );

    return result.rows.map(mapPlaybackProgress);
  }

  private async findExisting(input: Partial<SavePlaybackProgressRequest>) {
    if (input.localMediaFileId) {
      const result = await this.database.query<PlaybackProgressRow>(
        'select * from playback_progress where local_media_file_id = $1',
        [input.localMediaFileId],
      );

      return result.rows[0] ? mapPlaybackProgress(result.rows[0]) : undefined;
    }

    if (
      input.metadataProvider &&
      input.metadataId &&
      input.sourceProvider &&
      input.episodeNumber
    ) {
      const result = await this.database.query<PlaybackProgressRow>(
        `
          select *
          from playback_progress
          where local_media_file_id is null
            and metadata_provider = $1
            and metadata_id = $2
            and source_provider = $3
            and episode_number = $4
        `,
        [
          input.metadataProvider,
          input.metadataId,
          input.sourceProvider,
          input.episodeNumber,
        ],
      );

      return result.rows[0] ? mapPlaybackProgress(result.rows[0]) : undefined;
    }

    if (input.episodeUrl) {
      const result = await this.database.query<PlaybackProgressRow>(
        'select * from playback_progress where episode_url = $1',
        [input.episodeUrl],
      );

      return result.rows[0] ? mapPlaybackProgress(result.rows[0]) : undefined;
    }

    return undefined;
  }
}

function normalizeProgressInput(input: SavePlaybackProgressRequest) {
  const durationSeconds =
    input.durationSeconds && Number.isFinite(input.durationSeconds)
      ? input.durationSeconds
      : undefined;
  const completed =
    input.completed ??
    (durationSeconds
      ? input.positionSeconds >= Math.max(durationSeconds - 30, durationSeconds * 0.9)
      : false);

  return {
    localMediaFileId: input.localMediaFileId ?? null,
    metadataProvider: input.metadataProvider ?? null,
    metadataId: input.metadataId ?? null,
    sourceProvider: input.sourceProvider ?? null,
    sourceMediaUrl: input.sourceMediaUrl ?? null,
    episodeUrl: input.episodeUrl ?? null,
    mediaTitle: input.mediaTitle ?? null,
    episodeTitle: input.episodeTitle ?? null,
    episodeNumber: input.episodeNumber ?? null,
    positionSeconds: Math.max(0, input.positionSeconds),
    durationSeconds: durationSeconds ?? null,
    completed,
  };
}

function mapPlaybackProgress(row: PlaybackProgressRow): PlaybackProgress {
  const progress: PlaybackProgress = {
    id: row.id,
    positionSeconds: toNumber(row.position_seconds) ?? 0,
    completed: row.completed,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  if (row.local_media_file_id) {
    progress.localMediaFileId = row.local_media_file_id;
  }

  if (row.metadata_provider) {
    progress.metadataProvider = row.metadata_provider;
  }

  if (row.metadata_id !== null) {
    progress.metadataId = row.metadata_id;
  }

  if (row.source_provider) {
    progress.sourceProvider = row.source_provider;
  }

  if (row.source_media_url) {
    progress.sourceMediaUrl = row.source_media_url;
  }

  if (row.episode_url) {
    progress.episodeUrl = row.episode_url;
  }

  if (row.media_title) {
    progress.mediaTitle = row.media_title;
  }

  if (row.episode_title) {
    progress.episodeTitle = row.episode_title;
  }

  if (row.episode_number) {
    progress.episodeNumber = row.episode_number;
  }

  const durationSeconds = toNumber(row.duration_seconds);

  if (durationSeconds !== undefined) {
    progress.durationSeconds = durationSeconds;
  }

  return progress;
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
