-- Percakapan ikut terhapus bersama akunnya.
--
-- Berbeda dari dokumen dan pengumuman, yang dilepas dengan SET NULL karena
-- keduanya catatan milik instansi. Riwayat tanya jawab dan pesan langsung
-- adalah data pribadi pemiliknya: kalau alasan menghapus akun adalah permintaan
-- penghapusan data pribadi, justru inilah yang harus ikut hilang.
--
-- messages, direct_messages, dan citations sudah ON DELETE CASCADE terhadap
-- percakapannya, jadi rantainya berlanjut sendiri.
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_id_fkey";
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Perlu disadari: percakapan langsung berdua dengan admin, jadi menghapusnya
-- ikut menghapus salinan milik admin lawan bicaranya.
ALTER TABLE "direct_conversations" DROP CONSTRAINT "direct_conversations_employee_id_fkey";
ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
