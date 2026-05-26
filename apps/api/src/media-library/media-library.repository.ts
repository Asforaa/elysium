import { Injectable } from '@nestjs/common';
import type {
  AnimeMetadataDetails,
  DownloadedAnime,
  LocalMediaFile,
  MetadataProviderId,
} from '@elysium/shared';
import type { CachedArtworkMap } from './media-metadata-cache.service';
import type { QueryResultRow } from 'pg';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export interface MediaRootInput {
  key: string;
  localPath?: string;
  name: string;
  serverPath?: string;
}

export interface MediaEntityInput {
  bannerImageUrl?: string;
  canonicalTitle?: string;
  coverImageUrl?: string;
  displayTitle: string;
  elysiumId: string;
  episodeCount?: number;
  folderName?: string;
  format?: string;
  matchConfidence?: number;
  matchStatus?: string;
  mediaKind: string;
  metadata?: Record<string, unknown>;
  metadataId?: number;
  metadataProvider?: string;
  relativeFolderPath?: string;
  sourceSearchTitle?: string;
  titleEnglish?: string;
  titleNative?: string;
  titleRomaji?: string;
}

export interface MediaExternalIdInput {
  mediaEntityId: string;
  provider: string;
  providerId: string;
  providerPayload?: Record<string, unknown>;
  providerUrl?: string;
}

export interface MediaImportRunInput {
  mediaRootId?: string;
  mode: string;
  rootPath: string;
  status: string;
  summary?: Record<string, unknown>;
}

export interface MediaLibraryFileInput {
  absolutePath: string;
  category: string;
  canonicalRelativePath?: string;
  episodeNumber?: string;
  episodeTitle?: string;
  extension: string;
  fileKind: string;
  filename: string;
  guessedTitle?: string;
  hostProvider?: string;
  importRunId?: string;
  issues: string[];
  mediaContext?: Record<string, unknown>;
  mediaEntityId?: string;
  mediaRootId: string;
  metadata?: Record<string, unknown>;
  modifiedAt?: string;
  parsedEpisodeNumber?: number;
  parsedPartNumber?: number;
  parsedQuality?: string;
  parsedSeasonNumber?: number;
  parsedSource?: string;
  quality?: string;
  relativePath: string;
  sizeBytes?: number;
  sortOrder?: number;
  status: string;
}

export interface MediaLibraryNoteInput {
  content: string;
  editable: boolean;
  importRunId?: string;
  mediaEntityId?: string;
  mediaRootId: string;
  noteKind: string;
  originalModifiedAt?: string;
  relativePath: string;
  title: string;
}

interface MediaRootRow extends QueryResultRow {
  id: string;
}

interface MediaEntityRow extends QueryResultRow {
  banner_image_url: string | null;
  cover_image_url: string | null;
  display_title: string;
  elysium_id: string | null;
  id: string;
  media_kind: string;
  metadata: Record<string, unknown>;
  metadata_cached_at: Date | string | null;
  metadata_file_path: string | null;
  metadata_id: number | null;
  metadata_provider: string | null;
  source_search_title: string | null;
  title_romaji: string | null;
  updated_at: Date | string;
}

interface MediaEntityCacheTargetRow extends QueryResultRow {
  id: string;
  metadata: Record<string, unknown> | null;
  metadata_id: number;
  metadata_provider: MetadataProviderId;
}

interface MediaImportRunRow extends QueryResultRow {
  id: string;
}

interface MediaLibraryFileRow extends QueryResultRow {
  absolute_path: string | null;
  banner_image_url: string | null;
  cover_image_url: string | null;
  created_at: Date | string;
  display_title: string | null;
  elysium_id: string | null;
  episode_number: string | null;
  episode_title: string | null;
  entity_metadata: Record<string, unknown> | null;
  file_id: string;
  filename: string;
  host_provider: string | null;
  media_context: Record<string, unknown> | null;
  media_entity_id: string | null;
  media_kind: string | null;
  metadata_id: number | null;
  metadata_provider: string | null;
  quality: string | null;
  relative_path: string;
  size_bytes: number | string | null;
  source_search_title: string | null;
  updated_at: Date | string;
}

@Injectable()
export class MediaLibraryRepository {
  constructor(private readonly database: DatabaseService) {}

  async upsertRoot(input: MediaRootInput) {
    const result = await this.database.query<MediaRootRow>(
      `
        insert into media_roots (id, key, name, local_path, server_path)
        values ($1, $2, $3, $4, $5)
        on conflict (key) do update set
          name = excluded.name,
          local_path = excluded.local_path,
          server_path = excluded.server_path,
          active = true,
          updated_at = now()
        returning id
      `,
      [
        randomUUID(),
        input.key,
        input.name,
        input.localPath ?? null,
        input.serverPath ?? null,
      ],
    );

    return result.rows[0].id;
  }

  async createImportRun(input: MediaImportRunInput) {
    const result = await this.database.query<MediaImportRunRow>(
      `
        insert into media_import_runs (
          id,
          media_root_id,
          root_path,
          mode,
          status,
          summary
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [
        randomUUID(),
        input.mediaRootId ?? null,
        input.rootPath,
        input.mode,
        input.status,
        toJson(input.summary ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async completeImportRun(
    id: string,
    status: string,
    summary: Record<string, unknown>,
  ) {
    await this.database.query(
      `
        update media_import_runs
        set status = $2,
          summary = $3,
          completed_at = now(),
          updated_at = now()
        where id = $1
      `,
      [id, status, toJson(summary)],
    );
  }

  async upsertEntity(input: MediaEntityInput) {
    const existing = await this.findExistingEntity(input);

    if (existing) {
      const result = await this.database.query<MediaEntityRow>(
        `
          update media_entities
          set metadata_provider = coalesce($2, metadata_provider),
            metadata_id = coalesce($3, metadata_id),
            media_kind = $4,
            display_title = $5,
            canonical_title = $6,
            folder_name = $7,
            relative_folder_path = $8,
            match_status = $9,
            match_confidence = $10,
            elysium_id = $11,
            title_romaji = $12,
            title_english = $13,
            title_native = $14,
            format = $15,
            episode_count = $16,
            source_search_title = $17,
            cover_image_url = $18,
            banner_image_url = $19,
            metadata = $20,
            updated_at = now()
          where id = $1
          returning *
        `,
        [
          existing.id,
          input.metadataProvider ?? null,
          input.metadataId ?? null,
          input.mediaKind,
          input.displayTitle,
          input.canonicalTitle ?? input.displayTitle,
          input.folderName ?? null,
          input.relativeFolderPath ?? null,
          input.matchStatus ?? 'matched',
          input.matchConfidence ?? null,
          input.elysiumId,
          input.titleRomaji ?? input.displayTitle,
          input.titleEnglish ?? null,
          input.titleNative ?? null,
          input.format ?? null,
          input.episodeCount ?? null,
          input.sourceSearchTitle ?? input.titleRomaji ?? input.displayTitle,
          input.coverImageUrl ?? null,
          input.bannerImageUrl ?? null,
          toJson(input.metadata ?? {}),
        ],
      );

      return result.rows[0].id;
    }

    const result = await this.database.query<MediaEntityRow>(
      `
        insert into media_entities (
          id,
          metadata_provider,
          metadata_id,
          media_kind,
          display_title,
          canonical_title,
          folder_name,
          relative_folder_path,
          match_status,
          match_confidence,
          elysium_id,
          title_romaji,
          title_english,
          title_native,
          format,
          episode_count,
          source_search_title,
          cover_image_url,
          banner_image_url,
          metadata
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20
        )
        returning *
      `,
      [
        randomUUID(),
        input.metadataProvider ?? null,
        input.metadataId ?? null,
        input.mediaKind,
        input.displayTitle,
        input.canonicalTitle ?? input.displayTitle,
        input.folderName ?? null,
        input.relativeFolderPath ?? null,
        input.matchStatus ?? 'matched',
        input.matchConfidence ?? null,
        input.elysiumId,
        input.titleRomaji ?? input.displayTitle,
        input.titleEnglish ?? null,
        input.titleNative ?? null,
        input.format ?? null,
        input.episodeCount ?? null,
        input.sourceSearchTitle ?? input.titleRomaji ?? input.displayTitle,
        input.coverImageUrl ?? null,
        input.bannerImageUrl ?? null,
        toJson(input.metadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async upsertExternalId(input: MediaExternalIdInput) {
    await this.database.query(
      `
        insert into media_external_ids (
          id,
          media_entity_id,
          provider,
          provider_id,
          provider_url,
          provider_payload
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (provider, provider_id) do update set
          media_entity_id = excluded.media_entity_id,
          provider_url = excluded.provider_url,
          provider_payload = excluded.provider_payload,
          updated_at = now()
      `,
      [
        randomUUID(),
        input.mediaEntityId,
        input.provider,
        input.providerId,
        input.providerUrl ?? null,
        toJson(input.providerPayload ?? {}),
      ],
    );
  }

  async upsertFile(input: MediaLibraryFileInput) {
    await this.database.query(
      `
        insert into media_library_files (
          id,
          media_root_id,
          import_run_id,
          media_entity_id,
          relative_path,
          absolute_path,
          filename,
          extension,
          file_kind,
          category,
          size_bytes,
          modified_at,
          guessed_title,
          parsed_season_number,
          parsed_part_number,
          parsed_episode_number,
          parsed_quality,
          parsed_source,
          canonical_relative_path,
          status,
          issues,
          episode_title,
          episode_number,
          sort_order,
          quality,
          host_provider,
          media_context,
          metadata
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25,
          $26, $27, $28
        )
        on conflict (media_root_id, relative_path) do update set
          import_run_id = excluded.import_run_id,
          media_entity_id = excluded.media_entity_id,
          absolute_path = excluded.absolute_path,
          filename = excluded.filename,
          extension = excluded.extension,
          file_kind = excluded.file_kind,
          category = excluded.category,
          size_bytes = excluded.size_bytes,
          modified_at = excluded.modified_at,
          guessed_title = excluded.guessed_title,
          parsed_season_number = excluded.parsed_season_number,
          parsed_part_number = excluded.parsed_part_number,
          parsed_episode_number = excluded.parsed_episode_number,
          parsed_quality = excluded.parsed_quality,
          parsed_source = excluded.parsed_source,
          canonical_relative_path = excluded.canonical_relative_path,
          status = excluded.status,
          issues = excluded.issues,
          episode_title = excluded.episode_title,
          episode_number = excluded.episode_number,
          sort_order = excluded.sort_order,
          quality = excluded.quality,
          host_provider = excluded.host_provider,
          media_context = excluded.media_context,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        randomUUID(),
        input.mediaRootId,
        input.importRunId ?? null,
        input.mediaEntityId ?? null,
        input.relativePath,
        input.absolutePath,
        input.filename,
        input.extension,
        input.fileKind,
        input.category,
        input.sizeBytes ?? null,
        input.modifiedAt ?? null,
        input.guessedTitle ?? null,
        input.parsedSeasonNumber ?? null,
        input.parsedPartNumber ?? null,
        input.parsedEpisodeNumber ?? null,
        input.parsedQuality ?? null,
        input.parsedSource ?? null,
        input.canonicalRelativePath ?? input.relativePath,
        input.status,
        toJson(input.issues),
        input.episodeTitle ?? null,
        input.episodeNumber ?? null,
        input.sortOrder ?? null,
        input.quality ?? null,
        input.hostProvider ?? null,
        toJson(input.mediaContext ?? null),
        toJson(input.metadata ?? {}),
      ],
    );
  }

  async upsertNote(input: MediaLibraryNoteInput) {
    await this.database.query(
      `
        insert into media_library_notes (
          id,
          media_root_id,
          import_run_id,
          media_entity_id,
          relative_path,
          title,
          note_kind,
          content,
          editable,
          original_modified_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        on conflict (media_root_id, relative_path) do update set
          import_run_id = excluded.import_run_id,
          media_entity_id = excluded.media_entity_id,
          title = excluded.title,
          note_kind = excluded.note_kind,
          content = excluded.content,
          editable = excluded.editable,
          original_modified_at = excluded.original_modified_at,
          updated_at = now()
      `,
      [
        randomUUID(),
        input.mediaRootId,
        input.importRunId ?? null,
        input.mediaEntityId ?? null,
        input.relativePath,
        input.title,
        input.noteKind,
        input.content,
        input.editable,
        input.originalModifiedAt ?? null,
      ],
    );
  }

  async getImportedLocalMediaFile(id: string) {
    const result = await this.database.query<MediaLibraryFileRow>(
      `${LOCAL_FILE_SELECT} where files.id = $1`,
      [id],
    );

    return result.rows[0] ? mapLocalMediaFile(result.rows[0]) : undefined;
  }

  async listImportedLocalMediaFiles() {
    const result = await this.database.query<MediaLibraryFileRow>(
      `${LOCAL_FILE_SELECT}
        where files.file_kind = 'video'
          and files.status = 'imported'
        order by coalesce(entities.display_title, files.filename), files.sort_order nulls last, files.filename
      `,
    );

    return result.rows.map(mapLocalMediaFile);
  }

  async listImportedDownloadedAnime(): Promise<DownloadedAnime[]> {
    const result = await this.database.query<MediaLibraryFileRow>(
      `${LOCAL_FILE_SELECT}
        where files.file_kind = 'video'
          and files.status = 'imported'
          and entities.media_kind = 'anime'
          and entities.metadata_provider = 'anilist'
          and entities.metadata_id is not null
        order by coalesce(entities.display_title, files.filename), files.sort_order nulls last, files.filename
      `,
    );

    return groupFilesByMedia(result.rows.map(mapLocalMediaFile));
  }

  async findEntityByElysiumId(elysiumId: string) {
    const result = await this.database.query<MediaEntityRow>(
      'select * from media_entities where elysium_id = $1 limit 1',
      [elysiumId],
    );

    return result.rows[0];
  }

  async getCachedAnimeDetails(
    provider: MetadataProviderId,
    metadataId: number,
  ) {
    const result = await this.database.query<MediaEntityRow>(
      `
        select *
        from media_entities
        where metadata_provider = $1
          and metadata_id = $2
          and metadata_cached_at is not null
        limit 1
      `,
      [provider, metadataId],
    );
    const row = result.rows[0];
    const details = row?.metadata?.details;

    return isObject(details)
      ? (details as unknown as AnimeMetadataDetails)
      : undefined;
  }

  async listMetadataCacheTargets({
    missingOnly = true,
    provider,
  }: {
    missingOnly?: boolean;
    provider?: MetadataProviderId;
  } = {}) {
    const result = await this.database.query<MediaEntityCacheTargetRow>(
      `
        select id, metadata_provider, metadata_id, metadata
        from media_entities
        where metadata_provider is not null
          and metadata_id is not null
          and ($1::text is null or metadata_provider = $1)
          and ($2::boolean is false or metadata_cached_at is null)
        order by metadata_cached_at asc nulls first, display_title
      `,
      [provider ?? null, missingOnly],
    );

    return result.rows;
  }

  async upsertCachedAnimeDetails({
    details,
    filePath,
    artwork,
    provider,
  }: {
    artwork?: CachedArtworkMap;
    details: AnimeMetadataDetails;
    filePath: string;
    provider: MetadataProviderId;
  }) {
    const mediaEntityId = await this.upsertCachedEntity({
      artwork,
      details,
      filePath,
      provider,
    });

    await this.upsertExternalId({
      mediaEntityId,
      provider,
      providerId: String(details.id),
      providerPayload: { cachedAt: new Date().toISOString() },
      providerUrl: details.siteUrl,
    });

    if (details.idMal) {
      await this.upsertExternalId({
        mediaEntityId,
        provider: 'myanimelist',
        providerId: String(details.idMal),
        providerPayload: { sourceProvider: provider },
        providerUrl: `https://myanimelist.net/anime/${details.idMal}`,
      });
    }

    return mediaEntityId;
  }

  private async findExistingEntity(input: MediaEntityInput) {
    const result = await this.database.query<MediaEntityRow>(
      `
        select *
        from media_entities
        where elysium_id = $1
          or (
            $2::text is not null
            and $3::integer is not null
            and metadata_provider = $2
            and metadata_id = $3
          )
        order by
          case when elysium_id = $1 then 0 else 1 end
        limit 1
      `,
      [
        input.elysiumId,
        input.metadataProvider ?? null,
        input.metadataId ?? null,
      ],
    );

    return result.rows[0];
  }

  private async upsertCachedEntity({
    artwork,
    details,
    filePath,
    provider,
  }: {
    artwork?: CachedArtworkMap;
    details: AnimeMetadataDetails;
    filePath: string;
    provider: MetadataProviderId;
  }) {
    const result = await this.database.query<MediaEntityRow>(
      `
        insert into media_entities (
          id,
          metadata_provider,
          metadata_id,
          media_kind,
          display_title,
          canonical_title,
          match_status,
          title_romaji,
          title_english,
          title_native,
          format,
          episode_count,
          source_search_title,
          cover_image_url,
          banner_image_url,
          metadata,
          metadata_file_path,
          metadata_cached_at
        )
        values (
          $1, $2, $3, 'anime', $4,
          $5, 'matched', $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, now()
        )
        on conflict (metadata_provider, metadata_id) do update set
          media_kind = excluded.media_kind,
          display_title = excluded.display_title,
          canonical_title = excluded.canonical_title,
          match_status = excluded.match_status,
          title_romaji = excluded.title_romaji,
          title_english = excluded.title_english,
          title_native = excluded.title_native,
          format = excluded.format,
          episode_count = excluded.episode_count,
          source_search_title = excluded.source_search_title,
          cover_image_url = excluded.cover_image_url,
          banner_image_url = excluded.banner_image_url,
          metadata = excluded.metadata,
          metadata_file_path = excluded.metadata_file_path,
          metadata_cached_at = excluded.metadata_cached_at,
          updated_at = now()
        returning *
      `,
      [
        randomUUID(),
        provider,
        details.id,
        details.displayTitle,
        details.displayTitle,
        details.title.romaji ?? details.displayTitle,
        details.title.english ?? null,
        details.title.native ?? null,
        details.format ?? null,
        details.episodes ?? null,
        details.sourceSearchTitle,
        details.coverImage?.extraLarge ??
          details.coverImage?.large ??
          details.coverImage?.medium ??
          null,
        details.bannerImage ?? null,
        toJson({
          artwork: artwork ?? {},
          details,
          cachedAt: new Date().toISOString(),
          provider,
        }),
        filePath,
      ],
    );

    return result.rows[0].id;
  }
}

const LOCAL_FILE_SELECT = `
  select
    files.id as file_id,
    files.relative_path,
    files.absolute_path,
    files.filename,
    files.size_bytes,
    files.episode_title,
    files.episode_number,
    files.quality,
    files.host_provider,
    files.media_context,
    files.media_entity_id,
    files.created_at,
    files.updated_at,
    entities.media_kind,
    entities.metadata_provider,
    entities.metadata_id,
    entities.display_title,
    entities.source_search_title,
    entities.cover_image_url,
    entities.banner_image_url,
    entities.metadata as entity_metadata,
    entities.elysium_id
  from media_library_files files
  left join media_entities entities on entities.id = files.media_entity_id
`;

function mapLocalMediaFile(row: MediaLibraryFileRow): LocalMediaFile {
  const file: LocalMediaFile = {
    id: row.file_id,
    downloadJobId: `media-library:${row.file_id}`,
    quality: row.quality ?? 'Local',
    hostProvider: row.host_provider ?? 'local-library',
    filePath: row.absolute_path ?? row.relative_path,
    filename: row.filename,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };

  const cachedDetails = row.entity_metadata?.details;
  const mediaContext =
    row.media_context || isObject(cachedDetails)
      ? {
          ...(row.media_context ?? {}),
          ...(isObject(cachedDetails) ? { metadataDetails: cachedDetails } : {}),
        }
      : undefined;

  if (mediaContext) {
    file.mediaContext = mediaContext as unknown as LocalMediaFile['mediaContext'];
  }

  if (row.metadata_provider) {
    file.metadataProvider = row.metadata_provider;
  }

  if (row.metadata_id !== null) {
    file.metadataId = row.metadata_id;
  }

  if (row.display_title) {
    file.displayTitle = row.display_title;
  }

  if (row.source_search_title) {
    file.sourceSearchTitle = row.source_search_title;
  }

  if (row.cover_image_url) {
    file.coverImageUrl = row.cover_image_url;
  }

  if (row.banner_image_url) {
    file.bannerImageUrl = row.banner_image_url;
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

export function groupFilesByMedia(files: LocalMediaFile[]) {
  const animeByKey = new Map<string, DownloadedAnime>();

  for (const file of files) {
    const importedContext = file.mediaContext as
      | (Record<string, unknown> & { elysiumId?: string })
      | undefined;
    const key =
      file.metadataProvider && file.metadataId
        ? `${file.metadataProvider}:${file.metadataId}`
        : importedContext?.elysiumId ?? file.displayTitle ?? file.id;
    const cachedDetails = getCachedDetails(file.mediaContext);
    const existing = animeByKey.get(key);

    if (existing) {
      existing.files.push(file);
      existing.updatedAt =
        file.updatedAt > existing.updatedAt ? file.updatedAt : existing.updatedAt;
      continue;
    }

    animeByKey.set(key, {
      key,
      metadataProvider: file.metadataProvider,
      metadataId: file.metadataId,
      displayTitle:
        cachedDetails?.displayTitle ??
        file.displayTitle ??
        file.mediaContext?.displayTitle?.toString() ??
        file.filename,
      sourceSearchTitle:
        cachedDetails?.sourceSearchTitle ??
        file.sourceSearchTitle ??
        file.mediaContext?.sourceSearchTitle?.toString(),
      coverImageUrl:
        cachedDetails?.coverImage?.extraLarge ??
        cachedDetails?.coverImage?.large ??
        cachedDetails?.coverImage?.medium ??
        file.coverImageUrl,
      bannerImageUrl: cachedDetails?.bannerImage ?? file.bannerImageUrl,
      files: [file],
      updatedAt: file.updatedAt,
    });
  }

  return Array.from(animeByKey.values()).sort((first, second) =>
    second.updatedAt.localeCompare(first.updatedAt),
  );
}

function getCachedDetails(mediaContext: LocalMediaFile['mediaContext']) {
  const details = (mediaContext as Record<string, unknown> | undefined)
    ?.metadataDetails;

  return isObject(details)
    ? (details as unknown as AnimeMetadataDetails)
    : undefined;
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

function toJson(value: unknown) {
  return value === null ? null : JSON.stringify(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
