import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  isAdmin: boolean;
  displayName?: string;
  sid: string;
}

export interface AuthenticatedUser extends JwtPayload {}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
