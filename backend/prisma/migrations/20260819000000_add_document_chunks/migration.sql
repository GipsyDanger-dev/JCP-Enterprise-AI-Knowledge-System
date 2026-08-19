-- EnableExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "chunks" (
    "chunk_id" TEXT NOT NULL,
    "document_version_id" UUID NOT NULL,
    "page_number" INTEGER,
    "section_title" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("chunk_id")
);

-- CreateIndex
CREATE INDEX "chunks_document_version_id_idx" ON "chunks"("document_version_id");

-- CreateIndex
CREATE INDEX "chunks_embedding_idx"
    ON "chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "chunks"
    ADD CONSTRAINT "chunks_document_version_id_fkey"
    FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
