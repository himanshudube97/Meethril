-- Additive only: new Dodo subscription columns on users + webhook idempotency table.
-- No drops, no NOT NULL on existing data (CLAUDE.md additive-only rule).

-- AlterTable
ALTER TABLE "users" ADD COLUMN "dodoCustomerId" TEXT,
ADD COLUMN "dodoProductId" TEXT,
ADD COLUMN "dodoSubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "processed_webhooks" (
    "id" TEXT NOT NULL,
    "eventType" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_dodoCustomerId_key" ON "users"("dodoCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "users_dodoSubscriptionId_key" ON "users"("dodoSubscriptionId");
