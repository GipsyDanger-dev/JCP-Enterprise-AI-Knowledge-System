-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PERATURAN_DAERAH', 'PERATURAN_BUPATI', 'KEPUTUSAN_BUPATI', 'INSTRUKSI_BUPATI', 'RANCANGAN_PUU', 'PERATURAN_DESA', 'PUTUSAN_PENGADILAN');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('BERLAKU', 'RANCANGAN', 'DIUBAH', 'DICABUT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE 'BENDAHARA';
ALTER TYPE "UserRole" ADD VALUE 'SEKRETARIS';
ALTER TYPE "UserRole" ADD VALUE 'OPERASIONAL';
ALTER TYPE "UserRole" ADD VALUE 'HUMAS';

-- DropForeignKey
ALTER TABLE "app_notifications" DROP CONSTRAINT "app_notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "required_readings" DROP CONSTRAINT "required_readings_document_id_fkey";

-- DropForeignKey
ALTER TABLE "required_readings" DROP CONSTRAINT "required_readings_user_id_fkey";

-- AlterTable
ALTER TABLE "announcements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "document_categories" ADD COLUMN     "allowed_roles" "UserRole"[];

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "document_type" "DocumentType",
ADD COLUMN     "legal_status" "LegalStatus" NOT NULL DEFAULT 'BERLAKU',
ADD COLUMN     "regulation_number" TEXT,
ADD COLUMN     "regulation_year" INTEGER,
ALTER COLUMN "collection" SET DEFAULT 'Umum';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "role" SET DEFAULT 'SUPER_ADMIN';

-- CreateIndex
CREATE INDEX "documents_category_id_legal_status_idx" ON "documents"("category_id", "legal_status");

-- CreateIndex
CREATE INDEX "documents_regulation_year_regulation_number_idx" ON "documents"("regulation_year", "regulation_number");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_readings" ADD CONSTRAINT "required_readings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "required_readings" ADD CONSTRAINT "required_readings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_notifications" ADD CONSTRAINT "app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

