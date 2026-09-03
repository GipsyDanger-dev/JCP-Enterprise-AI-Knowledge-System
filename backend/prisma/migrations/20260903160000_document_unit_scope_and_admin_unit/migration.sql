-- Kolom account_type / google_subject dan tipe AccountType milik branch
-- `Personal`. Database Neon dipakai bersama, jadi pernyataan DROP yang
-- diusulkan `prisma migrate diff` dari branch ini sengaja dibuang.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ADMIN_UNIT';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "unit_kerja_id" UUID;

-- CreateIndex
CREATE INDEX "documents_unit_kerja_id_idx" ON "documents"("unit_kerja_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_unit_kerja_id_fkey" FOREIGN KEY ("unit_kerja_id") REFERENCES "unit_kerja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

