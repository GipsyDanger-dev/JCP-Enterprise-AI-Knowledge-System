-- Migrasi 20260831113000 sudah memuat SET NOT NULL untuk ketiga kolom ini, tetapi
-- di database batasannya tidak menempel — kemungkinan besar tersapu `prisma db push`
-- yang dijalankan setelahnya. Selama itu schema.prisma menyatakan ketiganya wajib
-- sementara database tetap menerima NULL.
--
-- Akibatnya nyata: satu baris user tanpa employee_number cukup untuk membuat
-- SETIAP pembacaan user gagal dengan P2032, termasuk login — bukan hanya untuk
-- pemilik baris itu, tetapi juga untuk daftar pengguna dan pengiriman pengumuman
-- yang membaca seluruh tabel. Batasan ini dipasang ulang supaya database yang
-- menolak baris cacat sejak awal, bukan Prisma yang tersandung saat membacanya.

UPDATE "users"
SET
  "employee_number" = COALESCE("employee_number", 'EMP-' || UPPER(SUBSTRING(REPLACE("id"::TEXT, '-', '') FROM 1 FOR 8))),
  "division"        = COALESCE("division", 'Belum diisi'),
  "job_title"       = COALESCE("job_title", 'Belum diisi')
WHERE "employee_number" IS NULL OR "division" IS NULL OR "job_title" IS NULL;

ALTER TABLE "users" ALTER COLUMN "employee_number" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "division" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "job_title" SET NOT NULL;
