-- Normalize roles written by the legacy application before the expanded UserRole enum.
UPDATE "users"
SET "role" = 'USER'
WHERE "role"::text = 'PEGAWAI';
