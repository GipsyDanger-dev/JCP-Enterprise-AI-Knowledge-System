-- Kolom account_type / google_subject dan tipe AccountType milik branch
-- `Personal` (fitur login Google). Keduanya sengaja TIDAK disentuh dari sini:
-- database Neon dipakai bersama kedua branch, dan menghapusnya akan
-- membatalkan fitur di branch sebelah.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PEGAWAI';

-- AlterTable
ALTER TABLE "document_categories" DROP COLUMN "allowed_roles";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "unit_kerja_id" UUID;

-- CreateTable
CREATE TABLE "unit_kerja" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_kerja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoryAccess" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CategoryAccess_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_kerja_code_key" ON "unit_kerja"("code");

-- CreateIndex
CREATE INDEX "unit_kerja_name_idx" ON "unit_kerja"("name");

-- CreateIndex
CREATE INDEX "_CategoryAccess_B_index" ON "_CategoryAccess"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_kerja_id_fkey" FOREIGN KEY ("unit_kerja_id") REFERENCES "unit_kerja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryAccess" ADD CONSTRAINT "_CategoryAccess_A_fkey" FOREIGN KEY ("A") REFERENCES "document_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryAccess" ADD CONSTRAINT "_CategoryAccess_B_fkey" FOREIGN KEY ("B") REFERENCES "unit_kerja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

