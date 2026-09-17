-- Wewenang mengunggah dokumen yang menempel pada jabatan, bukan pada role.
-- Bawaannya false: menyalakannya untuk jabatan yang sudah dipegang orang akan
-- memberi mereka hak tulis atas dokumen tanpa ada yang pernah memutuskannya.
ALTER TABLE "jabatan" ADD COLUMN "can_upload_documents" BOOLEAN NOT NULL DEFAULT false;
