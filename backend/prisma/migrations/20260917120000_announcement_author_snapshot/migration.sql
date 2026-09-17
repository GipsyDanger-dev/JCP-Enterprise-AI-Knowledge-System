-- Lepaskan pengumuman dari akun penerbitnya, dengan alasan yang sama seperti
-- dokumen: pengumuman adalah catatan resmi instansi, bukan milik pribadi orang
-- yang menerbitkannya. created_by_id memakai ON DELETE RESTRICT, sehingga satu
-- pengumuman saja sudah cukup mengunci akun penerbitnya selamanya.
ALTER TABLE "announcements"
  ADD COLUMN "created_by_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "created_by_username" TEXT;

-- COALESCE: akun PERSONAL tidak punya username, identitas loginnya email.
UPDATE "announcements" a
SET "created_by_name" = u."display_name",
    "created_by_username" = COALESCE(u."username", u."email")
FROM "users" u
WHERE a."created_by_id" = u."id";

ALTER TABLE "announcements" ALTER COLUMN "created_by_id" DROP NOT NULL;

ALTER TABLE "announcements" DROP CONSTRAINT "announcements_created_by_id_fkey";
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
