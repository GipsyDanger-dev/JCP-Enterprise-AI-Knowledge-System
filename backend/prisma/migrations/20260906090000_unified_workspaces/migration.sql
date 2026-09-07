-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('COMPANY', 'PERSONAL');

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


ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN_UNIT';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PEGAWAI';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'DOCUMENT_UPDATED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT_PUBLISHED';

-- DropIndex
DROP INDEX "users_employee_number_key";

-- DropIndex
DROP INDEX "document_categories_key_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_type" "AccountType" NOT NULL DEFAULT 'COMPANY',
ADD COLUMN     "google_subject" TEXT,
ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_platform_owner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit_kerja_id" UUID,
ADD COLUMN     "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ALTER COLUMN "employee_number" DROP NOT NULL,
ALTER COLUMN "division" DROP NOT NULL,
ALTER COLUMN "job_title" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category_id" UUID,
ADD COLUMN     "document_type" "DocumentType",
ADD COLUMN     "legal_status" "LegalStatus" NOT NULL DEFAULT 'BERLAKU',
ADD COLUMN     "regulation_number" TEXT,
ADD COLUMN     "regulation_year" INTEGER,
ADD COLUMN     "unit_kerja_id" UUID,
ADD COLUMN     "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
ALTER COLUMN "collection" SET DEFAULT 'Umum';

-- AlterTable
ALTER TABLE "document_categories" ADD COLUMN     "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'COMPANY',
    "ai_profile" TEXT NOT NULL DEFAULT 'general',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_kerja" (
    "workspace_id" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_kerja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_reads" (
    "id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CategoryAccess" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_CategoryAccess_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "unit_kerja_name_idx" ON "unit_kerja"("name");

-- CreateIndex
CREATE UNIQUE INDEX "unit_kerja_workspace_id_code_key" ON "unit_kerja"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reads_announcement_id_user_id_key" ON "announcement_reads"("announcement_id", "user_id");

-- CreateIndex
CREATE INDEX "_CategoryAccess_B_index" ON "_CategoryAccess"("B");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_workspace_id_employee_number_key" ON "users"("workspace_id", "employee_number");

-- CreateIndex
CREATE INDEX "documents_category_id_legal_status_idx" ON "documents"("category_id", "legal_status");

-- CreateIndex
CREATE INDEX "documents_unit_kerja_id_idx" ON "documents"("unit_kerja_id");

-- CreateIndex
CREATE INDEX "documents_regulation_year_regulation_number_idx" ON "documents"("regulation_year", "regulation_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_workspace_id_key_key" ON "document_categories"("workspace_id", "key");

-- AddForeignKey
-- Existing main data remains together. Never assign platform ownership implicitly.
INSERT INTO "workspaces" ("id", "name") VALUES ('00000000-0000-4000-8000-000000000001', 'Jogja Creative');
UPDATE "users"
SET "is_admin" = CASE
  WHEN "role" IN ('ADMIN'::"UserRole", 'SUPER_ADMIN'::"UserRole") THEN true
  ELSE false
END;
INSERT INTO "unit_kerja" ("id", "workspace_id", "name", "code")
SELECT gen_random_uuid(), '00000000-0000-4000-8000-000000000001', division, division
FROM (SELECT DISTINCT trim(division) AS division FROM users WHERE nullif(trim(division), '') IS NOT NULL
      UNION SELECT DISTINCT trim(division) FROM documents WHERE nullif(trim(division), '') IS NOT NULL) AS divisions;
UPDATE users AS u SET unit_kerja_id = k.id FROM unit_kerja AS k WHERE trim(u.division) = k.name AND u.workspace_id = k.workspace_id;
UPDATE documents AS d SET unit_kerja_id = k.id FROM unit_kerja AS k WHERE trim(d.division) = k.name AND d.workspace_id = k.workspace_id;
UPDATE documents AS d SET category_id = c.id FROM document_categories AS c WHERE lower(trim(d.collection)) = c.key AND d.workspace_id = c.workspace_id;

ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_unit_kerja_id_fkey" FOREIGN KEY ("unit_kerja_id") REFERENCES "unit_kerja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "document_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_unit_kerja_id_fkey" FOREIGN KEY ("unit_kerja_id") REFERENCES "unit_kerja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_kerja" ADD CONSTRAINT "unit_kerja_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryAccess" ADD CONSTRAINT "_CategoryAccess_A_fkey" FOREIGN KEY ("A") REFERENCES "document_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CategoryAccess" ADD CONSTRAINT "_CategoryAccess_B_fkey" FOREIGN KEY ("B") REFERENCES "unit_kerja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
