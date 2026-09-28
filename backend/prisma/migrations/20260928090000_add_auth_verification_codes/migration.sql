-- CreateEnum
CREATE TYPE "AuthVerificationPurpose" AS ENUM ('PERSONAL_REGISTRATION', 'PASSWORD_RESET');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AUTH_PASSWORD_RESET';

-- CreateTable
CREATE TABLE "auth_verification_codes" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "AuthVerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "payload" JSONB,
    "user_id" UUID,
    "reset_token_hash" TEXT,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_codes_reset_token_hash_key" ON "auth_verification_codes"("reset_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_codes_email_purpose_key" ON "auth_verification_codes"("email", "purpose");

-- CreateIndex
CREATE INDEX "auth_verification_codes_expires_at_idx" ON "auth_verification_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_verification_codes" ADD CONSTRAINT "auth_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
