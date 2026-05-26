import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { DatabaseHealth } from '@elysium/shared';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.constants';

interface DatabaseHealthRow {
  database: string;
  version: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleInit() {
    await this.migrate();
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ) {
    return this.pool.query<T>(text, params);
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();

    try {
      await client.query('begin');
      const result = await callback(client);
      await client.query('commit');

      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async getHealth(): Promise<DatabaseHealth> {
    try {
      const result = await this.pool.query<DatabaseHealthRow>(
        'select current_database() as database, version() as version',
      );
      const row = result.rows[0];

      return {
        ok: true,
        database: row?.database,
        version: row?.version,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async migrate() {
    await this.transaction(async (client) => {
      await client.query(`
        create table if not exists elysium_migrations (
          id text primary key,
          applied_at timestamptz not null default now()
        )
      `);

      for (const migration of DATABASE_MIGRATIONS) {
        const existing = await client.query(
          'select id from elysium_migrations where id = $1',
          [migration.id],
        );

        if (existing.rowCount) {
          continue;
        }

        for (const statement of migration.statements) {
          await client.query(statement);
        }

        await client.query('insert into elysium_migrations (id) values ($1)', [
          migration.id,
        ]);
      }
    });
  }
}

const DATABASE_MIGRATIONS = [
  {
    id: '001_download_persistence',
    statements: [
      `
        create table if not exists download_jobs (
          id uuid primary key,
          option jsonb not null,
          media_context jsonb,
          status text not null,
          engine text,
          resolved jsonb,
          destination_path text,
          filename text,
          progress_bytes bigint not null default 0,
          total_bytes bigint,
          speed_bytes_per_second bigint,
          error_message text,
          attempt_count integer not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          completed_at timestamptz
        )
      `,
      `
        create index if not exists download_jobs_status_idx
          on download_jobs (status)
      `,
      `
        create index if not exists download_jobs_created_at_idx
          on download_jobs (created_at desc)
      `,
      `
        create table if not exists download_job_attempts (
          id uuid primary key,
          job_id uuid not null references download_jobs(id) on delete cascade,
          attempt_number integer not null,
          status text not null,
          resolved jsonb,
          engine text,
          destination_path text,
          filename text,
          progress_bytes bigint not null default 0,
          total_bytes bigint,
          error_message text,
          started_at timestamptz not null default now(),
          completed_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (job_id, attempt_number)
        )
      `,
      `
        create index if not exists download_job_attempts_job_id_idx
          on download_job_attempts (job_id, attempt_number desc)
      `,
      `
        create table if not exists local_media_files (
          id uuid primary key,
          download_job_id uuid not null unique references download_jobs(id) on delete cascade,
          metadata_provider text,
          metadata_id integer,
          display_title text,
          source_provider text,
          source_media_title text,
          source_media_url text,
          episode_title text,
          episode_number text,
          quality text not null,
          host_provider text not null,
          file_path text not null,
          filename text not null,
          size_bytes bigint,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create index if not exists local_media_files_metadata_idx
          on local_media_files (metadata_provider, metadata_id)
      `,
      `
        create index if not exists local_media_files_created_at_idx
          on local_media_files (created_at desc)
      `,
    ],
  },
  {
    id: '002_auth_persistence',
    statements: [
      `
        create table if not exists auth_users (
          id uuid primary key,
          email text not null unique,
          name text not null,
          initials text not null,
          profile_photo_data_url text,
          password_hash text not null,
          password_salt text not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create index if not exists auth_users_email_idx
          on auth_users (email)
      `,
      `
        create table if not exists auth_sessions (
          id uuid primary key,
          user_id uuid not null references auth_users(id) on delete cascade,
          expires_at timestamptz not null,
          last_seen_at timestamptz not null default now(),
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create index if not exists auth_sessions_user_id_idx
          on auth_sessions (user_id)
      `,
      `
        create index if not exists auth_sessions_expires_at_idx
          on auth_sessions (expires_at)
      `,
    ],
  },
  {
    id: '003_library_playback_and_stream_context',
    statements: [
      `
        alter table local_media_files
          add column if not exists media_context jsonb,
          add column if not exists source_search_title text,
          add column if not exists cover_image_url text,
          add column if not exists banner_image_url text
      `,
      `
        create table if not exists playback_progress (
          id uuid primary key,
          local_media_file_id uuid references local_media_files(id) on delete cascade,
          metadata_provider text,
          metadata_id integer,
          source_provider text,
          source_media_url text,
          episode_url text,
          media_title text,
          episode_title text,
          episode_number text,
          position_seconds double precision not null default 0,
          duration_seconds double precision,
          completed boolean not null default false,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create unique index if not exists playback_progress_local_file_idx
          on playback_progress (local_media_file_id)
          where local_media_file_id is not null
      `,
      `
        create unique index if not exists playback_progress_episode_idx
          on playback_progress (
            metadata_provider,
            metadata_id,
            source_provider,
            episode_number
          )
          where local_media_file_id is null
            and metadata_provider is not null
            and metadata_id is not null
            and source_provider is not null
            and episode_number is not null
      `,
      `
        create index if not exists playback_progress_continue_idx
          on playback_progress (completed, updated_at desc)
      `,
    ],
  },
  {
    id: '004_media_library_import_foundation',
    statements: [
      `
        create table if not exists media_roots (
          id uuid primary key,
          key text not null unique,
          name text not null,
          local_path text,
          server_path text,
          active boolean not null default true,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create table if not exists media_import_runs (
          id uuid primary key,
          media_root_id uuid references media_roots(id) on delete set null,
          root_path text not null,
          mode text not null,
          status text not null,
          summary jsonb,
          started_at timestamptz not null default now(),
          completed_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `,
      `
        create index if not exists media_import_runs_started_at_idx
          on media_import_runs (started_at desc)
      `,
      `
        create table if not exists media_entities (
          id uuid primary key,
          metadata_provider text,
          metadata_id integer,
          media_kind text not null,
          display_title text not null,
          canonical_title text,
          folder_name text,
          relative_folder_path text,
          match_status text not null default 'unmatched',
          match_confidence double precision,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (metadata_provider, metadata_id)
        )
      `,
      `
        create index if not exists media_entities_title_idx
          on media_entities (display_title)
      `,
      `
        create table if not exists media_library_files (
          id uuid primary key,
          media_root_id uuid references media_roots(id) on delete set null,
          import_run_id uuid references media_import_runs(id) on delete set null,
          media_entity_id uuid references media_entities(id) on delete set null,
          relative_path text not null,
          absolute_path text,
          filename text not null,
          extension text not null,
          file_kind text not null,
          category text not null,
          size_bytes bigint,
          modified_at timestamptz,
          guessed_title text,
          parsed_season_number integer,
          parsed_part_number integer,
          parsed_episode_number integer,
          parsed_quality text,
          parsed_source text,
          canonical_relative_path text,
          status text not null default 'discovered',
          issues jsonb not null default '[]'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (media_root_id, relative_path)
        )
      `,
      `
        create index if not exists media_library_files_entity_idx
          on media_library_files (media_entity_id)
      `,
      `
        create index if not exists media_library_files_category_idx
          on media_library_files (category)
      `,
      `
        create table if not exists media_library_notes (
          id uuid primary key,
          media_root_id uuid references media_roots(id) on delete set null,
          import_run_id uuid references media_import_runs(id) on delete set null,
          media_entity_id uuid references media_entities(id) on delete set null,
          relative_path text not null,
          title text not null,
          note_kind text not null,
          content text not null,
          editable boolean not null default true,
          original_modified_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (media_root_id, relative_path)
        )
      `,
      `
        create index if not exists media_library_notes_entity_idx
          on media_library_notes (media_entity_id)
      `,
    ],
  },
  {
    id: '005_elysium_entity_ids_and_external_links',
    statements: [
      `
        create sequence if not exists media_entity_elysium_id_seq
          as integer
          start with 1
          increment by 1
      `,
      `
        alter table media_entities
          add column if not exists elysium_id text,
          add column if not exists title_romaji text,
          add column if not exists title_english text,
          add column if not exists title_native text,
          add column if not exists format text,
          add column if not exists episode_count integer
      `,
      `
        update media_entities
        set elysium_id = 'e' || lpad(nextval('media_entity_elysium_id_seq')::text, 6, '0')
        where elysium_id is null
      `,
      `
        alter table media_entities
          alter column elysium_id set default 'e' || lpad(nextval('media_entity_elysium_id_seq')::text, 6, '0')
      `,
      `
        create unique index if not exists media_entities_elysium_id_idx
          on media_entities (elysium_id)
      `,
      `
        create table if not exists media_external_ids (
          id uuid primary key,
          media_entity_id uuid not null references media_entities(id) on delete cascade,
          provider text not null,
          provider_id text not null,
          provider_url text,
          provider_payload jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (provider, provider_id),
          unique (media_entity_id, provider, provider_id)
        )
      `,
      `
        create index if not exists media_external_ids_entity_idx
          on media_external_ids (media_entity_id)
      `,
    ],
  },
  {
    id: '006_media_library_playback_fields',
    statements: [
      `
        alter table media_entities
          add column if not exists source_search_title text,
          add column if not exists cover_image_url text,
          add column if not exists banner_image_url text,
          add column if not exists metadata jsonb not null default '{}'::jsonb
      `,
      `
        alter table media_library_files
          add column if not exists episode_title text,
          add column if not exists episode_number text,
          add column if not exists sort_order double precision,
          add column if not exists quality text,
          add column if not exists host_provider text,
          add column if not exists media_context jsonb,
          add column if not exists metadata jsonb not null default '{}'::jsonb
      `,
      `
        create index if not exists media_library_files_episode_idx
          on media_library_files (media_entity_id, episode_number)
      `,
      `
        create index if not exists media_library_files_sort_idx
          on media_library_files (media_entity_id, sort_order)
      `,
    ],
  },
];
