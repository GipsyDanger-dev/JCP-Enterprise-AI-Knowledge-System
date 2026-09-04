-- Synchronize schema changes that were previously present only in the
-- development database and Prisma schema.
ALTER TABLE "users"
ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "role" SET DEFAULT 'SUPER_ADMIN';

ALTER TABLE "documents"
ALTER COLUMN "collection" SET DEFAULT 'Umum';

ALTER TABLE "announcements"
ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "required_readings"
DROP CONSTRAINT "required_readings_document_id_fkey",
DROP CONSTRAINT "required_readings_user_id_fkey";

ALTER TABLE "required_readings"
ADD CONSTRAINT "required_readings_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "required_readings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_notifications"
DROP CONSTRAINT "app_notifications_user_id_fkey";

ALTER TABLE "app_notifications"
ADD CONSTRAINT "app_notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
