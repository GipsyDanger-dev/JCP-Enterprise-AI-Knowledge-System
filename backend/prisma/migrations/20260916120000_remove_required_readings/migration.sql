-- Fitur wajib baca dibuang seluruhnya. Tabel penugasan beserta progresnya ikut
-- hilang; tidak ada jalan mundur selain restore dari backup.
DROP TABLE IF EXISTS "required_readings";

-- Wewenang jabatan yang hanya dipakai fitur ini.
ALTER TABLE "jabatan" DROP COLUMN IF EXISTS "can_assign_required_readings";

-- Postgres tidak bisa membuang satu nilai dari enum, jadi tipenya dibuat ulang.
-- Notifikasi lama yang bertipe wajib baca dihapus dulu supaya konversi kolom
-- tidak gagal karena ada baris yang nilainya tidak ada di tipe baru.
DELETE FROM "app_notifications"
WHERE "type" IN ('REQUIRED_READING_ASSIGNED', 'REQUIRED_READING_COMPLETED');

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";

CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT_PUBLISHED', 'MESSAGE_RECEIVED');

ALTER TABLE "app_notifications"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING ("type"::text::"NotificationType");

DROP TYPE "NotificationType_old";
