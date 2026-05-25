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
    await this.runMigrations();
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

  private async runMigrations() {
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
];
