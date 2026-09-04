-- Bukti baca per pengumuman.
--
-- Sebelumnya "sudah dibaca" hanya tersimpan sebagai app_notifications.read_at
-- untuk tipe ANNOUNCEMENT_PUBLISHED — satu penanda untuk semua pengumuman
-- sekaligus, sehingga tidak bisa menjawab "siapa yang sudah membaca pengumuman
-- ini". Tabel ini mencatatnya per pasangan pengumuman-pegawai.
--
-- Tidak ada pengisian data lama: notifikasi terdahulu tidak menyimpan
-- pengumuman mana yang dibaca, jadi menebaknya justru akan melaporkan orang
-- sebagai sudah membaca sesuatu yang belum tentu dibukanya. Laporan dimulai
-- kosong dan terisi sejak pegawai membuka halaman pengumuman berikutnya.
CREATE TABLE "announcement_reads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "announcement_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Satu baris per pegawai per pengumuman: pencatatan ulang saat halaman dibuka
-- lagi harus diabaikan, bukan menumpuk dan menggandakan hitungan pembaca.
CREATE UNIQUE INDEX "announcement_reads_announcement_id_user_id_key" ON "announcement_reads"("announcement_id", "user_id");
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads"("user_id");
