export interface AuthUser {
  id: string;
  email: string;
  initials: string;
  name: string;
  profilePhotoDataUrl?: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export interface AuthCredentials {
  email?: string;
  name?: string;
  password?: string;
  profilePhotoDataUrl?: string;
}
