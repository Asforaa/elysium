import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from './auth.types';
import { DatabaseService } from '../database/database.service';

export interface StoredAuthUser extends AuthUser {
  passwordHash: string;
  passwordSalt: string;
}

interface AuthUserRow {
  id: string;
  email: string;
  name: string;
  initials: string;
  profile_photo_data_url: string | null;
  password_hash: string;
  password_salt: string;
}

interface CreateAuthUserInput {
  email: string;
  initials: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  profilePhotoDataUrl?: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserByEmail(email: string) {
    const result = await this.database.query<AuthUserRow>(
      'select * from auth_users where email = $1',
      [email],
    );

    return result.rows[0] ? mapUser(result.rows[0]) : undefined;
  }

  async createUser(input: CreateAuthUserInput) {
    const result = await this.database.query<AuthUserRow>(
      `
        insert into auth_users (
          id,
          email,
          name,
          initials,
          profile_photo_data_url,
          password_hash,
          password_salt
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        randomUUID(),
        input.email,
        input.name,
        input.initials,
        input.profilePhotoDataUrl ?? null,
        input.passwordHash,
        input.passwordSalt,
      ],
    );

    return mapUser(result.rows[0]);
  }

  async createSession(userId: string, expiresAt: Date) {
    const sessionId = randomUUID();

    await this.database.query(
      `
        insert into auth_sessions (id, user_id, expires_at)
        values ($1, $2, $3)
      `,
      [sessionId, userId, expiresAt],
    );

    return sessionId;
  }

  async findUserBySession(sessionId: string) {
    const result = await this.database.query<AuthUserRow>(
      `
        select
          users.id,
          users.email,
          users.name,
          users.initials,
          users.profile_photo_data_url,
          users.password_hash,
          users.password_salt
        from auth_sessions sessions
        join auth_users users on users.id = sessions.user_id
        where sessions.id = $1 and sessions.expires_at > now()
      `,
      [sessionId],
    );
    const user = result.rows[0] ? mapUser(result.rows[0]) : undefined;

    if (user) {
      await this.database.query(
        `
          update auth_sessions
          set last_seen_at = now(), updated_at = now()
          where id = $1
        `,
        [sessionId],
      );
    }

    return user;
  }

  async deleteSession(sessionId: string) {
    await this.database.query('delete from auth_sessions where id = $1', [
      sessionId,
    ]);
  }

  async deleteExpiredSessions() {
    await this.database.query(
      'delete from auth_sessions where expires_at <= now()',
    );
  }
}

function mapUser(row: AuthUserRow): StoredAuthUser {
  const user: StoredAuthUser = {
    email: row.email,
    id: row.id,
    initials: row.initials,
    name: row.name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
  };

  if (row.profile_photo_data_url) {
    user.profilePhotoDataUrl = row.profile_photo_data_url;
  }

  return user;
}
