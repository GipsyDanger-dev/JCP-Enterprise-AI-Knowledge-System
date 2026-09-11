-- Memindahkan nomenklatur jabatan dari konstanta JABATAN di
-- prisma/reference-data.ts menjadi baris tabel, lengkap dengan wewenang yang
-- menempel padanya, plus nama tampilan role yang bisa disesuaikan per instansi.
--
-- Seluruhnya aditif: tidak ada kolom yang dibuang dan tidak ada tipe yang
-- diubah, jadi aman dijalankan pada basis data yang sudah dipakai. Kolom
-- users.job_title tetap ada dan tetap diisi namanya.

-- CreateTable
CREATE TABLE "jabatan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  "name" TEXT NOT NULL,
  "can_manage_announcements" BOOLEAN NOT NULL DEFAULT false,
  "can_view_announcement_readers" BOOLEAN NOT NULL DEFAULT false,
  "can_assign_required_readings" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "jabatan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jabatan_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "jabatan_workspace_id_name_key" ON "jabatan"("workspace_id", "name");
CREATE INDEX "jabatan_workspace_id_is_active_idx" ON "jabatan"("workspace_id", "is_active");

-- CreateTable
CREATE TABLE "role_labels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_labels_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "role_labels_workspace_id_role_key" ON "role_labels"("workspace_id", "role");
-- Nama role juga dikunci: yang dibaca orang di dropdown adalah namanya, bukan
-- nilai enum-nya, jadi dua role bernama sama membuat pilihannya tidak berarti.
CREATE UNIQUE INDEX "role_labels_workspace_id_label_key" ON "role_labels"("workspace_id", "label");

-- AlterTable
ALTER TABLE "users" ADD COLUMN "jabatan_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_jabatan_id_fkey"
  FOREIGN KEY ("jabatan_id") REFERENCES "jabatan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isi kedelapan jabatan bawaan ke setiap workspace, persis seperti isi
-- konstanta JABATAN. Dua di antaranya sudah berwenang menerbitkan pengumuman
-- sebelum migrasi ini (JABATAN_PENERBIT_PENGUMUMAN), jadi centangnya diberikan
-- di sini supaya wewenang yang berjalan tidak hilang saat deploy.
--
-- can_view_announcement_readers mengikuti can_manage_announcements karena dulu
-- keduanya satu paket di canPublish(). can_assign_required_readings dibiarkan
-- mati untuk semua: sebelum ini hanya admin yang boleh, dan admin tetap boleh
-- lewat flag is_admin-nya.
INSERT INTO "jabatan" (
  "workspace_id", "name",
  "can_manage_announcements", "can_view_announcement_readers",
  "sort_order", "updated_at"
)
SELECT w."id", bawaan."name", bawaan."umumkan", bawaan."umumkan", bawaan."urutan", CURRENT_TIMESTAMP
-- Hanya workspace organisasi: akun perorangan tidak punya struktur jabatan.
FROM "workspaces" w
CROSS JOIN (VALUES
  ('Kepala Perangkat Daerah', true,  1),
  ('Sekretaris',              true,  2),
  ('Kepala Bidang',           false, 3),
  ('Kepala Subbagian',        false, 4),
  ('Kepala Seksi',            false, 5),
  ('Kepala Subbidang',        false, 6),
  ('Jabatan Fungsional',      false, 7),
  ('Staf / Pelaksana',        false, 8)
) AS bawaan("name", "umumkan", "urutan")
WHERE w."type" = 'COMPANY'
ON CONFLICT ("workspace_id", "name") DO NOTHING;

-- Jabatan lawas yang terlanjur ditulis bebas di users.job_title ikut diangkat
-- jadi baris, bukan dibuang. Tanpa langkah ini pegawai yang jabatannya di luar
-- daftar bawaan akan tampil kosong di dropdown, dan menyunting profilnya akan
-- diam-diam menghapus jabatannya.
INSERT INTO "jabatan" ("workspace_id", "name", "sort_order", "updated_at")
SELECT DISTINCT ON (u."workspace_id", lower(btrim(u."job_title")))
       u."workspace_id", btrim(u."job_title"), 99, CURRENT_TIMESTAMP
FROM "users" u
WHERE u."account_type" = 'COMPANY'
  AND u."job_title" IS NOT NULL
  AND btrim(u."job_title") <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "jabatan" j
    WHERE j."workspace_id" = u."workspace_id"
      AND lower(j."name") = lower(btrim(u."job_title"))
  )
ORDER BY u."workspace_id", lower(btrim(u."job_title")), u."created_at"
ON CONFLICT ("workspace_id", "name") DO NOTHING;

-- Sambungkan pegawai yang ada ke barisnya. Pencocokan mengabaikan besar-kecil
-- huruf dan spasi di tepi karena job_title sebelumnya teks bebas.
UPDATE "users" u
SET "jabatan_id" = j."id"
FROM "jabatan" j
WHERE j."workspace_id" = u."workspace_id"
  AND u."job_title" IS NOT NULL
  AND lower(btrim(u."job_title")) = lower(j."name");

-- Nama tampilan role sekarang. Sama persis dengan userRoleLabel() di frontend,
-- supaya tampilan tidak berubah sedikit pun sampai ada yang menggantinya.
INSERT INTO "role_labels" ("workspace_id", "role", "label", "description", "updated_at")
SELECT w."id", bawaan."role"::"UserRole", bawaan."label", bawaan."description", CURRENT_TIMESTAMP
FROM "workspaces" w
CROSS JOIN (VALUES
  ('SUPER_ADMIN', 'Admin',      'Mengelola seluruh dokumen, pengguna, dan pengaturan workspace.'),
  ('ADMIN_UNIT',  'Admin Unit', 'Mengelola dokumen milik unit kerjanya sendiri.'),
  ('PEGAWAI',     'Pegawai',    'Membaca dokumen yang terbuka untuk unit kerjanya.')
) AS bawaan("role", "label", "description")
WHERE w."type" = 'COMPANY'
ON CONFLICT ("workspace_id", "role") DO NOTHING;
