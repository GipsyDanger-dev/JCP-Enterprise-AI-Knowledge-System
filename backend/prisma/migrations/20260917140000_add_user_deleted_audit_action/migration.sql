-- Penghapusan permanen sebuah akun dicatat terpisah dari USER_UPDATED.
-- Menyamakannya dengan perubahan biasa membuat tindakan yang tidak bisa
-- dibatalkan terlihat sama saja dengan mengganti nama.
--
-- ADD VALUE aman di dalam transaksi sejak PostgreSQL 12 selama nilainya belum
-- dipakai pada transaksi yang sama; migration ini memang hanya menambahkannya.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_DELETED';
