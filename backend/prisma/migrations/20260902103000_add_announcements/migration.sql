CREATE TABLE "announcements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" VARCHAR(180) NOT NULL,
  "body" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by_id" UUID NOT NULL,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "announcements_is_active_published_at_idx" ON "announcements"("is_active", "published_at");
CREATE INDEX "announcements_created_by_id_idx" ON "announcements"("created_by_id");
