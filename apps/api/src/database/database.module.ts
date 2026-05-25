import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.constants';
import { getDatabaseUrl } from './database.config';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: () => new Pool({ connectionString: getDatabaseUrl() }),
    },
    DatabaseService,
  ],
  exports: [DATABASE_POOL, DatabaseService],
})
export class DatabaseModule {}
