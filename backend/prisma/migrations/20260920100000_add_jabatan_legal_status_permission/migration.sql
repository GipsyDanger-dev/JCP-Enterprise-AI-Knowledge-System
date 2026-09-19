-- Wewenang mengubah status keberlakuan dokumen, menempel pada jabatan.
--
-- Terpisah dari can_upload_documents: menetapkan sebuah peraturan sudah dicabut
-- atau diubah adalah pekerjaan bagian hukum, bukan pekerjaan orang yang kebetulan
-- menaikkan berkasnya. Keduanya sering dipegang orang yang berbeda.
--
-- Bawaannya false, sama seperti centang wewenang lain: menyalakannya untuk
-- jabatan yang sudah dipegang orang berarti memberi mereka kuasa menyembunyikan
-- dokumen dari seluruh pegawai tanpa ada yang pernah memutuskannya.
ALTER TABLE "jabatan" ADD COLUMN "can_manage_legal_status" BOOLEAN NOT NULL DEFAULT false;
