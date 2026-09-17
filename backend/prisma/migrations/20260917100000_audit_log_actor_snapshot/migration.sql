-- Jejak audit harus tetap terbaca setelah akun pelakunya dihapus.
--
-- actor_user_id memakai ON DELETE SET NULL, jadi menghapus sebuah akun membuat
-- barisnya kehilangan penunjuk ke pelakunya. Dua hal ikut hilang bersamanya:
-- namanya, dan -- untuk baris ber-workspace_id NULL -- satu-satunya cara
-- halaman Log aktivitas menemukan baris itu sama sekali.
ALTER TABLE "audit_logs"
  ADD COLUMN "actor_username" TEXT,
  ADD COLUMN "actor_display_name" TEXT;

-- Isi nama pelaku untuk baris lama, selagi akunnya masih ada.
UPDATE "audit_logs" a
-- COALESCE: akun PERSONAL tidak punya username, identitas loginnya adalah
-- email. Tanpa ini baris milik mereka tersimpan tanpa identitas sama sekali.
SET "actor_username" = COALESCE(u."username", u."email"),
    "actor_display_name" = u."display_name"
FROM "users" u
WHERE a."actor_user_id" = u."id";

-- Lepaskan baris lama dari ketergantungannya pada relasi actorUser. Tanpa ini,
-- baris ber-workspace_id NULL menghilang dari daftar begitu pelakunya dihapus,
-- karena penyaringnya menemukannya lewat workspace milik akun pelaku.
UPDATE "audit_logs" a
SET "workspace_id" = u."workspace_id"
FROM "users" u
WHERE a."workspace_id" IS NULL
  AND a."actor_user_id" = u."id";
