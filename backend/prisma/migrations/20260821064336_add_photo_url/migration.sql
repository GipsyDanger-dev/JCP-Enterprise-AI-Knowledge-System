-- DropIndex
DROP INDEX "chunks_embedding_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "photo_url" TEXT;
