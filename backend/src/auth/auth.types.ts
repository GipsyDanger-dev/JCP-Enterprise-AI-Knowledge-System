import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  isAdmin: boolean;
  /** Unit kerja penentu akses dokumen. Null untuk akun yang belum ditempatkan. */
  unitKerjaId?: string | null;
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
