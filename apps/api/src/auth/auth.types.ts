export interface AuthUser {
  id: string;
  email: string;
  initials: string;
  name: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export interface AuthCredentials {
  email?: string;
  name?: string;
}
