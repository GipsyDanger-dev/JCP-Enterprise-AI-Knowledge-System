-- Kategori kembali menjadi label subjek, bukan pagar akses.
--
-- Seed sebelumnya mengunci hampir setiap kategori ke satu dinas, sehingga
-- dokumen JDIH — yang isinya peraturan publik — hanya terbaca oleh satu unit
-- kerja tanpa ada yang pernah memilih pembatasan itu. Barisnya dikosongkan di
-- sini supaya keadaan awalnya terbuka; pembatasan sekarang ditetapkan sadar
-- per dokumen lewat kolom documents.unit_kerja_id.
DELETE FROM "_CategoryAccess";

-- Mengubah kategori/penanda unit sebuah dokumen adalah perubahan hak akses,
-- jadi harus punya jejaknya sendiri di audit log.
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UPDATED';
