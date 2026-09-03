import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  displayName?: string;
  sid: string;
}

export interface AuthenticatedUser extends JwtPayload {
  division?: string;
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  query?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}
