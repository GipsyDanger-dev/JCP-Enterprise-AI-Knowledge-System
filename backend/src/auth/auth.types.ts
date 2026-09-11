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

/** Wewenang yang menempel pada jabatan, bukan pada tingkat wewenang dokumen. */
export interface JabatanPermissions {
  id: string;
  name: string;
  canManageAnnouncements: boolean;
  canViewAnnouncementReaders: boolean;
  canAssignRequiredReadings: boolean;
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
  /**
   * Baris jabatannya, kalau sudah tertaut. Null untuk akun yang jabatannya
   * masih berupa teks bebas warisan — akun seperti itu tidak punya wewenang
   * tambahan apa pun, persis seperti sebelum jabatan jadi tabel.
   *
   * Ikut dibaca ulang setiap permintaan bersama jobTitle, dengan alasan yang
   * sama: mencabut centang di halaman Orang & akses harus langsung berlaku.
   */
  jabatan?: JabatanPermissions | null;
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}
