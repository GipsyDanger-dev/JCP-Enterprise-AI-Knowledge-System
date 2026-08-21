-- AlterTable
ALTER TABLE "document_versions" ALTER COLUMN "storage_key" DROP NOT NULL;

-- CreateTable
CREATE TABLE "document_files" (
    "id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "content" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_files_document_version_id_key" ON "document_files"("document_version_id");

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
