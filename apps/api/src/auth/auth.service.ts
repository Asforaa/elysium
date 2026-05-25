import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  AuthCredentials,
  AuthSessionResponse,
  AuthUser,
} from './auth.types';

const AUTH_COOKIE_NAME = 'elysium_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_USER = {
  email: 'asforaa@elysium.local',
  name: 'Asforaa',
};

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, AuthUser>();

  createSession(credentials?: AuthCredentials) {
    const name = cleanValue(credentials?.name) ?? DEFAULT_USER.name;
    const email = cleanValue(credentials?.email) ?? DEFAULT_USER.email;
    const user = {
      email,
      id: randomUUID(),
      initials: createInitials(name, email),
      name,
    };
    const sessionId = randomUUID();

    this.sessions.set(sessionId, user);

    return {
      cookie: this.createSessionCookie(sessionId),
      response: this.toAuthenticatedResponse(user),
    };
  }

  getSession(cookieHeader?: string): AuthSessionResponse {
    const sessionId = getCookieValue(cookieHeader, AUTH_COOKIE_NAME);
    const user = sessionId ? this.sessions.get(sessionId) : undefined;

    if (!user) {
      return { authenticated: false };
    }

    return this.toAuthenticatedResponse(user);
  }

  clearSession(cookieHeader?: string) {
    const sessionId = getCookieValue(cookieHeader, AUTH_COOKIE_NAME);

    if (sessionId) {
      this.sessions.delete(sessionId);
    }

    return {
      cookie: this.createExpiredCookie(),
      response: { authenticated: false },
    };
  }

  private toAuthenticatedResponse(user: AuthUser): AuthSessionResponse {
    return {
      authenticated: true,
      user,
    };
  }

  private createSessionCookie(sessionId: string) {
    return [
      `${AUTH_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
      `Max-Age=${SESSION_TTL_SECONDS}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      getSecureCookieAttribute(),
    ]
      .filter(Boolean)
      .join('; ');
  }

  private createExpiredCookie() {
    return [
      `${AUTH_COOKIE_NAME}=`,
      'Max-Age=0',
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      getSecureCookieAttribute(),
    ]
      .filter(Boolean)
      .join('; ');
  }
}

function cleanValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function createInitials(name: string, email: string) {
  const parts = name
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }

  return email[0]?.toUpperCase() ?? 'E';
}

function getCookieValue(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) {
    return undefined;
  }

  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function getSecureCookieAttribute() {
  return process.env.NODE_ENV === 'production' ? 'Secure' : '';
}
