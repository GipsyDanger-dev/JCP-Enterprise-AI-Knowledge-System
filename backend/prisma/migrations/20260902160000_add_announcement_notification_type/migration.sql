-- Pengumuman baru menghasilkan notifikasi untuk setiap karyawan.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT_PUBLISHED';
