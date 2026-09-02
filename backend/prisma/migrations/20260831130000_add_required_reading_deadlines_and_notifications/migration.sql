CREATE TYPE "NotificationType" AS ENUM ('REQUIRED_READING_ASSIGNED', 'REQUIRED_READING_COMPLETED');

ALTER TABLE "required_readings"
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "last_progress_at" TIMESTAMP(3);

UPDATE "required_readings"
SET "due_at" = CURRENT_TIMESTAMP + INTERVAL '7 days'
WHERE "due_at" IS NULL;

ALTER TABLE "required_readings"
  ALTER COLUMN "due_at" SET NOT NULL;

CREATE TABLE "app_notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "href" TEXT,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_notifications_user_id_read_at_created_at_idx"
  ON "app_notifications"("user_id", "read_at", "created_at");

ALTER TABLE "app_notifications"
  ADD CONSTRAINT "app_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
