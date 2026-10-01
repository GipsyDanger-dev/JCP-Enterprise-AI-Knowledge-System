-- Role ADMIN_UNIT dicabut: seluruh pengelolaan dokumen dan akun terpusat di
-- SUPER_ADMIN. Pemegangnya diturunkan menjadi PEGAWAI, bukan dihapus, supaya
-- akun, riwayat percakapan, dan dokumen unggahannya tetap utuh.
--
-- Nilai enum-nya sengaja dibiarkan di tipe "UserRole", sama seperti role warisan
-- lain: membuang nilai enum di PostgreSQL berarti membangun ulang tipenya dan
-- mengubah kolom yang dipakai autentikasi.
UPDATE "users"
SET "role" = 'PEGAWAI', "is_admin" = false
WHERE "role" = 'ADMIN_UNIT';

-- Nama tampilannya ikut dibuang supaya tidak lagi muncul di tab Role.
DELETE FROM "role_labels"
WHERE "role" = 'ADMIN_UNIT';
