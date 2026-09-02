CREATE TABLE "required_readings" ("id" UUID NOT NULL, "document_id" UUID NOT NULL, "user_id" UUID NOT NULL, "progress" INTEGER NOT NULL DEFAULT 0, "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3), CONSTRAINT "required_readings_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "required_readings_document_id_user_id_key" ON "required_readings"("document_id", "user_id");
CREATE INDEX "required_readings_user_id_completed_at_idx" ON "required_readings"("user_id", "completed_at");
CREATE INDEX "required_readings_document_id_completed_at_idx" ON "required_readings"("document_id", "completed_at");
ALTER TABLE "required_readings" ADD CONSTRAINT "required_readings_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;
ALTER TABLE "required_readings" ADD CONSTRAINT "required_readings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
