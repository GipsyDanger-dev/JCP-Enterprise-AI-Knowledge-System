-- CreateTable
CREATE TABLE "document_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_categories_key_key" ON "document_categories"("key");

-- CreateIndex
CREATE INDEX "document_categories_name_idx" ON "document_categories"("name");

-- Seed the categories previously offered by the application.
INSERT INTO "document_categories" ("id", "name", "key") VALUES
    ('10000000-0000-4000-8000-000000000001', 'Operations', 'operations'),
    ('10000000-0000-4000-8000-000000000002', 'IT & Security', 'it & security'),
    ('10000000-0000-4000-8000-000000000003', 'Finance', 'finance'),
    ('10000000-0000-4000-8000-000000000004', 'People', 'people'),
    ('10000000-0000-4000-8000-000000000005', 'Legal', 'legal'),
    ('10000000-0000-4000-8000-000000000006', 'Marketing', 'marketing')
ON CONFLICT ("key") DO NOTHING;

-- Normalize the legacy frontend key before preserving any custom category names.
UPDATE "documents"
SET "collection" = 'IT & Security'
WHERE lower(btrim("collection")) = 'it-security';

-- Preserve categories that were created before categories became managed data.
INSERT INTO "document_categories" ("id", "name", "key")
SELECT
    (substring(md5('document-category:' || btrim("collection")) from 1 for 8) || '-' ||
     substring(md5('document-category:' || btrim("collection")) from 9 for 4) || '-' ||
     substring(md5('document-category:' || btrim("collection")) from 13 for 4) || '-' ||
     substring(md5('document-category:' || btrim("collection")) from 17 for 4) || '-' ||
     substring(md5('document-category:' || btrim("collection")) from 21 for 12))::uuid,
    btrim("collection"),
    lower(btrim("collection"))
FROM "documents"
WHERE "collection" IS NOT NULL AND btrim("collection") <> ''
GROUP BY btrim("collection")
ON CONFLICT ("key") DO NOTHING;

-- Normalize existing document values to the managed category display name.
UPDATE "documents" AS document
SET "collection" = category."name"
FROM "document_categories" AS category
WHERE document."collection" IS NOT NULL
  AND lower(btrim(document."collection")) = category."key";
