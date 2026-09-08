ALTER TABLE "payment_events" ADD COLUMN "provider_payment_id" TEXT;

CREATE INDEX "payment_events_provider_provider_payment_id_idx" ON "payment_events"("provider", "provider_payment_id");
