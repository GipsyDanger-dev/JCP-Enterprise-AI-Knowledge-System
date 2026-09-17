-- Lepaskan arsip dari akun pengunggahnya.
--
-- uploaded_by_id memakai ON DELETE RESTRICT, sehingga satu dokumen saja sudah
-- cukup membuat sebuah akun tidak bisa dihapus selamanya. Memaksanya lewat
-- CASCADE bukan jalan keluar: itu ikut menghapus dokumennya, padahal arsip ini
-- milik instansi, bukan milik orang yang kebetulan menaikkannya.
--
-- Jalan keluarnya adalah menyimpan identitas pengunggah sebagai teks di baris
-- dokumennya, lalu membiarkan tautan ke akunnya boleh putus.
ALTER TABLE "documents"
  ADD COLUMN "uploaded_by_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "uploaded_by_username" TEXT;

-- Salin identitas pengunggah selagi akunnya masih ada.
-- COALESCE: akun PERSONAL tidak punya username, identitas loginnya email.
UPDATE "documents" d
SET "uploaded_by_name" = u."display_name",
    "uploaded_by_username" = COALESCE(u."username", u."email")
FROM "users" u
WHERE d."uploaded_by_id" = u."id";

ALTER TABLE "documents" ALTER COLUMN "uploaded_by_id" DROP NOT NULL;

ALTER TABLE "documents" DROP CONSTRAINT "documents_uploaded_by_id_fkey";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
