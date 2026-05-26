import { userInfo } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function getDatabaseUrl(): string {
  return (
    getEnvValue('DATABASE_URL') ??
    `postgresql://${userInfo().username}@127.0.0.1:55432/elysium`
  );
}

function getEnvValue(key: string) {
  if (process.env[key]) {
    return process.env[key];
  }

  for (const envPath of findEnvFiles(process.cwd())) {
    const value = readEnvValue(envPath, key);

    if (value) {
      process.env[key] = value;
      return value;
    }
  }

  return undefined;
}

function findEnvFiles(startPath: string) {
  const paths: string[] = [];
  let current = resolve(startPath);

  for (let depth = 0; depth < 8; depth += 1) {
    paths.push(join(current, '.env'));

    const parent = dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  return paths.filter((path) => existsSync(path));
}

function readEnvValue(envPath: string, key: string) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();

    if (name !== key) {
      continue;
    }

    return unquoteEnvValue(trimmed.slice(separatorIndex + 1).trim());
  }

  return undefined;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
