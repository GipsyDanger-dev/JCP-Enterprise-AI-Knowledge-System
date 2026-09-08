CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');

ALTER TABLE "workspaces"
  ADD COLUMN "subscription_status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "trial_started_at" TIMESTAMP(3),
  ADD COLUMN "trial_ends_at" TIMESTAMP(3),
  ADD COLUMN "subscription_plan" TEXT;

CREATE INDEX "workspaces_subscription_status_trial_ends_at_idx"
  ON "workspaces"("subscription_status", "trial_ends_at");
