ALTER TABLE "audit_logs" ADD COLUMN "workspace_id" UUID;

UPDATE "audit_logs" AS a
SET "workspace_id" = u."workspace_id"
FROM "users" AS u
WHERE a."actor_user_id" = u."id" AND a."workspace_id" IS NULL;

UPDATE "audit_logs" AS a
SET "workspace_id" = d."workspace_id"
FROM "documents" AS d
WHERE a."target_type" = 'DOCUMENT' AND a."target_id" = d."id" AND a."workspace_id" IS NULL;

UPDATE "audit_logs" AS a
SET "workspace_id" = d."workspace_id"
FROM "processing_jobs" AS p
JOIN "document_versions" AS v ON v."id" = p."document_version_id"
JOIN "documents" AS d ON d."id" = v."document_id"
WHERE a."target_type" = 'PROCESSING_JOB' AND a."target_id" = p."id" AND a."workspace_id" IS NULL;

CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
