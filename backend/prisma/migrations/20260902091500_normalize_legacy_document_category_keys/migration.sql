-- Normalize the previous frontend collection key to its user-facing category.
UPDATE "documents"
SET "collection" = 'IT & Security'
WHERE lower(btrim("collection")) = 'it-security';

DELETE FROM "document_categories"
WHERE "key" = 'it-security';
