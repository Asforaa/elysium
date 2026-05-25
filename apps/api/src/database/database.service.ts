import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { DatabaseHealth } from '@elysium/shared';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';

interface DatabaseHealthRow {
  database: string;
  version: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
}
