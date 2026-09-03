CREATE TYPE "AccountType" AS ENUM ('COMPANY', 'PERSONAL');

ALTER TABLE "users"
ADD COLUMN "account_type" "AccountType" NOT NULL DEFAULT 'COMPANY',
ADD COLUMN "google_subject" TEXT,
ALTER COLUMN "employee_number" DROP NOT NULL,
ALTER COLUMN "division" DROP NOT NULL,
ALTER COLUMN "job_title" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");
