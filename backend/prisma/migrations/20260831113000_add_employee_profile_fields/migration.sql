ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employee_number" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "division" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" TEXT;

UPDATE "users"
SET
  "employee_number" = CASE WHEN "role" = 'ADMIN' THEN 'ADM-' ELSE 'EMP-' END || UPPER(SUBSTRING(REPLACE("id"::TEXT, '-', '') FROM 1 FOR 8)),
  "division" = CASE WHEN "role" = 'ADMIN' THEN 'Management' ELSE 'Operations' END,
  "job_title" = CASE WHEN "role" = 'ADMIN' THEN 'Administrator' ELSE 'Employee' END
WHERE "employee_number" IS NULL OR "division" IS NULL OR "job_title" IS NULL;

ALTER TABLE "users" ALTER COLUMN "employee_number" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "division" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "job_title" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_employee_number_key" ON "users"("employee_number");
