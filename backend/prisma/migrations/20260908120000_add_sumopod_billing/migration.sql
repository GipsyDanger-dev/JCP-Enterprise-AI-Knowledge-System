CREATE TYPE "WorkspaceSubscriptionStatus_new" AS ENUM ('PENDING_PAYMENT', 'TRIAL', 'ACTIVE', 'EXPIRED');

ALTER TABLE "workspaces"
  ALTER COLUMN "subscription_status" DROP DEFAULT,
  ALTER COLUMN "subscription_status" TYPE "WorkspaceSubscriptionStatus_new"
    USING ("subscription_status"::text::"WorkspaceSubscriptionStatus_new");

DROP TYPE "WorkspaceSubscriptionStatus";
ALTER TYPE "WorkspaceSubscriptionStatus_new" RENAME TO "WorkspaceSubscriptionStatus";
ALTER TABLE "workspaces"
  ALTER COLUMN "subscription_status" SET DEFAULT 'ACTIVE';

ALTER TABLE "workspaces"
  ADD COLUMN "current_period_started_at" TIMESTAMP(3),
  ADD COLUMN "current_period_ends_at" TIMESTAMP(3);

CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

CREATE TABLE "billing_plans" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "monthly_amount" INTEGER NOT NULL,
  "yearly_amount" INTEGER NOT NULL,
  "max_members" INTEGER,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "discount_type" "DiscountType" NOT NULL,
  "value" INTEGER NOT NULL,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "max_redemptions" INTEGER,
  "redemption_count" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_orders" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "coupon_id" UUID,
  "provider" TEXT NOT NULL DEFAULT 'sumopod',
  "provider_payment_id" TEXT,
  "provider_order_id" TEXT NOT NULL,
  "cycle" "BillingCycle" NOT NULL,
  "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
  "subtotal" INTEGER NOT NULL,
  "discount_amount" INTEGER NOT NULL DEFAULT 0,
  "total_amount" INTEGER NOT NULL,
  "provider_fee" INTEGER,
  "provider_net_amount" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "coupon_snapshot" JSONB,
  "payment_link_url" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_events" (
  "id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "payment_order_id" UUID,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_plans_slug_key" ON "billing_plans"("slug");
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");
CREATE UNIQUE INDEX "payment_orders_provider_payment_id_key" ON "payment_orders"("provider_payment_id");
CREATE UNIQUE INDEX "payment_orders_provider_order_id_key" ON "payment_orders"("provider_order_id");
CREATE UNIQUE INDEX "payment_events_event_id_key" ON "payment_events"("event_id");
CREATE INDEX "payment_orders_workspace_id_status_idx" ON "payment_orders"("workspace_id", "status");
CREATE INDEX "payment_orders_expires_at_status_idx" ON "payment_orders"("expires_at", "status");
CREATE INDEX "payment_events_payment_order_id_idx" ON "payment_events"("payment_order_id");

ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_order_id_fkey"
  FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "billing_plans" ("id", "slug", "name", "description", "monthly_amount", "yearly_amount", "max_members", "updated_at")
VALUES ('10000000-0000-4000-8000-000000000001', 'starter', 'Starter', 'Paket awal untuk workspace perusahaan', 99000, 990000, 25, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
