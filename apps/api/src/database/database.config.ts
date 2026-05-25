import { userInfo } from 'node:os';

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ??
    `postgresql://${userInfo().username}@127.0.0.1:55432/elysium`
  );
}
