import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  AuthCredentials,
  AuthSessionResponse,
  AuthUser,
} from './auth.types';

const AUTH_COOKIE_NAME = 'elysium_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_KEY_LENGTH = 64;
const MAX_PROFILE_PHOTO_DATA_URL_LENGTH = 750_000;

interface StoredAuthUser extends AuthUser {
  passwordHash: string;
  passwordSalt: string;
}

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, AuthUser>();
  private readonly users = new Map<string, StoredAuthUser>();

  login(credentials?: AuthCredentials) {
    const { email, password } = requireCredentials(credentials);
    const user = this.users.get(email);

    if (!user || !verifyPassword(password, user)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(user);
  }

  signup(credentials?: AuthCredentials) {
    const { email, password } = requireCredentials(credentials);
    const name =
      cleanValue(credentials?.name) ?? email.split('@')[0] ?? 'Elysium';
    const existingUser = this.users.get(email);

    if (existingUser) {
      throw new BadRequestException(
        'A local account already exists for that email',
      );
    }

    const passwordSalt = randomBytes(16).toString('hex');
    const user = {
      email,
      id: randomUUID(),
      initials: createInitials(name, email),
      name,
      passwordHash: hashPassword(password, passwordSalt),
      passwordSalt,
      profilePhotoDataUrl: cleanProfilePhotoDataUrl(
        credentials?.profilePhotoDataUrl,
      ),
    };

    this.users.set(email, user);

    return this.createSession(user);
  }

  private createSession(storedUser: StoredAuthUser) {
    const user = toPublicUser(storedUser);
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

function requireCredentials(credentials: AuthCredentials | undefined) {
  const email = cleanValue(credentials?.email)?.toLowerCase();
  const password = credentials?.password ?? '';

  if (!email || !password) {
    throw new BadRequestException('Email and password are required');
  }

  if (!email.includes('@')) {
    throw new BadRequestException('A valid email is required');
  }

  if (password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters');
  }

  return {
    email,
    password,
  };
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
}

function verifyPassword(password: string, user: StoredAuthUser) {
  const candidateHash = Buffer.from(
    hashPassword(password, user.passwordSalt),
    'hex',
  );
  const storedHash = Buffer.from(user.passwordHash, 'hex');

  if (candidateHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(candidateHash, storedHash);
}

function cleanProfilePhotoDataUrl(value: string | undefined) {
  const photo = cleanValue(value);

  if (!photo) {
    return undefined;
  }

  if (!photo.startsWith('data:image/')) {
    throw new BadRequestException('Profile photo must be an image attachment');
  }

  if (photo.length > MAX_PROFILE_PHOTO_DATA_URL_LENGTH) {
    throw new BadRequestException('Profile photo is too large');
  }

  return photo;
}

function toPublicUser(user: StoredAuthUser): AuthUser {
  const publicUser: AuthUser = {
    email: user.email,
    id: user.id,
    initials: user.initials,
    name: user.name,
  };

  if (user.profilePhotoDataUrl) {
    publicUser.profilePhotoDataUrl = user.profilePhotoDataUrl;
  }

  return publicUser;
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
