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

export interface AuthenticatedUser extends JwtPayload {
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
