-- Lama AI menjawab, disimpan bersama jawabannya.
--
-- Sebelumnya angka ini hanya hidup di memori browser: begitu riwayat dibuka
-- ulang atau pengguna keluar lalu masuk lagi, penghitungnya hilang.
ALTER TABLE "messages" ADD COLUMN "duration_ms" INTEGER;

-- Jawaban lama diisi dari selisih waktu simpan jawaban dengan pertanyaan
-- sebelumnya. Pertanyaan disimpan tepat sebelum AI dipanggil dan jawaban tepat
-- sesudahnya, jadi selisihnya mendekati lama menjawab — hanya kurang sedikit
-- dari pekerjaan yang terjadi sebelum pertanyaan tersimpan.
UPDATE "messages" AS a
SET "duration_ms" = (
  SELECT ROUND(EXTRACT(EPOCH FROM (a."created_at" - u."created_at")) * 1000)::INTEGER
  FROM "messages" AS u
  WHERE u."conversation_id" = a."conversation_id"
    AND u."role" = 'USER'
    AND u."created_at" <= a."created_at"
  ORDER BY u."created_at" DESC
  LIMIT 1
)
WHERE a."role" = 'ASSISTANT';
