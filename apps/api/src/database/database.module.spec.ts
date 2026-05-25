import { Test } from '@nestjs/testing';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  it('returns failed health when the database query fails', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: DATABASE_POOL,
          useValue: {
            query: () => Promise.reject(new Error('connection failed')),
            end: () => Promise.resolve(),
          },
        },
      ],
    }).compile();

    await expect(moduleRef.get(DatabaseService).getHealth()).resolves.toEqual({
      ok: false,
      error: 'connection failed',
    });
  });
});
