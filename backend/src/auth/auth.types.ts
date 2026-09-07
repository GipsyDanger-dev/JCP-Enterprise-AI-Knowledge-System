import { AccountType, UserRole } from '@prisma/client';

export interface JwtPayload {
  workspaceId: string;
  accountType: AccountType;
  isPlatformOwner?: boolean;
  sub: string;
  username: string;
  role: UserRole;
  isAdmin: boolean;
  /** Unit kerja penentu akses dokumen. Null untuk akun yang belum ditempatkan. */
  unitKerjaId?: string | null;
  displayName?: string;
  sid: string;
}

export interface AuthenticatedUser extends JwtPayload {
  division?: string | null;
  /**
   * Nomenklatur jabatan pemiliknya. Sengaja tidak ikut ditandatangani di token:
   * diisi ulang dari database oleh JwtAuthGuard, sama seperti unitKerjaId,
   * supaya pencabutan wewenang menerbitkan pengumuman langsung berlaku tanpa
   * menunggu yang bersangkutan login ulang.
   */
  jobTitle?: string | null;
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
