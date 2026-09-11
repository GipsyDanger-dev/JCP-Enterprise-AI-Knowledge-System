-- Menggabungkan unit kerja yang namanya kembar, lalu mengunci namanya supaya
-- tidak bisa kembar lagi.
--
-- Di basis data yang sudah berjalan ditemukan 5 unit kerja bernama sama dengan
-- yang sudah ada, tetapi `code`-nya berisi nama lengkap ("Dinas Pertanian")
-- alih-alih kode pendek ("PERTANIAN"). Tidak ada kode di repositori ini yang
-- membuat baris seperti itu, jadi asalnya dari luar aplikasi. Akibatnya nyata:
-- dropdown penanda akses dokumen menampilkan dua pilihan yang tidak bisa
-- dibedakan, dan memilih yang keliru berarti dokumennya dikunci untuk unit yang
-- tidak berpenghuni — pegawai yang seharusnya berhak tidak melihat apa pun.
--
-- Sampai unik pada `code` saja tidak cukup mencegahnya: yang dibaca manusia di
-- antarmuka adalah namanya.

-- Baris mana yang dipertahankan untuk setiap nama: yang paling banyak dirujuk,
-- lalu yang paling tua. Bukan yang kodenya paling rapi — yang menentukan adalah
-- ke mana pengguna dan dokumen sudah telanjur menunjuk, karena itulah yang tidak
-- boleh putus.
CREATE TEMPORARY TABLE "unit_kerja_gabung" AS
WITH peringkat AS (
  SELECT
    u."id",
    u."workspace_id",
    u."name",
    ROW_NUMBER() OVER (
      PARTITION BY u."workspace_id", u."name"
      ORDER BY
        (
          (SELECT count(*) FROM "users" x WHERE x."unit_kerja_id" = u."id")
        + (SELECT count(*) FROM "documents" d WHERE d."unit_kerja_id" = u."id" AND d."deleted_at" IS NULL)
        + (SELECT count(*) FROM "_CategoryAccess" c WHERE c."B" = u."id")
        ) DESC,
        u."created_at" ASC,
        u."id" ASC
    ) AS urutan
  FROM "unit_kerja" u
)
SELECT
  buang."id"   AS "id_dibuang",
  simpan."id"  AS "id_disimpan"
FROM peringkat buang
JOIN peringkat simpan
  ON simpan."workspace_id" = buang."workspace_id"
 AND simpan."name" = buang."name"
 AND simpan."urutan" = 1
WHERE buang."urutan" > 1;

-- Pindahkan dulu, baru hapus. Relasinya `onDelete: SetNull`, jadi menghapus
-- lebih dahulu akan mengosongkan unit_kerja_id pegawai dan dokumennya — dan
-- akses mereka menyusut tanpa pesan apa pun.
UPDATE "users" u
SET "unit_kerja_id" = g."id_disimpan"
FROM "unit_kerja_gabung" g
WHERE u."unit_kerja_id" = g."id_dibuang";

UPDATE "documents" d
SET "unit_kerja_id" = g."id_disimpan"
FROM "unit_kerja_gabung" g
WHERE d."unit_kerja_id" = g."id_dibuang";

-- Hak baca kategori ikut dipindahkan. ON CONFLICT karena kategori bisa saja
-- sudah tertaut ke baris yang dipertahankan, dan kunci utamanya (A,B).
INSERT INTO "_CategoryAccess" ("A", "B")
SELECT c."A", g."id_disimpan"
FROM "_CategoryAccess" c
JOIN "unit_kerja_gabung" g ON g."id_dibuang" = c."B"
ON CONFLICT ("A", "B") DO NOTHING;

DELETE FROM "_CategoryAccess" c
USING "unit_kerja_gabung" g
WHERE c."B" = g."id_dibuang";

DELETE FROM "unit_kerja" u
USING "unit_kerja_gabung" g
WHERE u."id" = g."id_dibuang";

DROP TABLE "unit_kerja_gabung";

-- CreateIndex
CREATE UNIQUE INDEX "unit_kerja_workspace_id_name_key" ON "unit_kerja"("workspace_id", "name");
