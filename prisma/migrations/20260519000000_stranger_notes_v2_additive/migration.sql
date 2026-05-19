-- AddColumn: Stranger Notes v2 — E2EE keypair + suspension flag on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "strangerPublicKey" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "strangerWrappedPrivateKey" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "strangerNotesSendingSuspended" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: StrangerThread
CREATE TABLE "stranger_threads" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "senderDisplayName" TEXT NOT NULL,
    "recipientDisplayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "senderWaveOfferedAt" TIMESTAMP(3),
    "recipientWaveOfferedAt" TIMESTAMP(3),
    "pendingKeyExchange" BOOLEAN NOT NULL DEFAULT false,
    "wrappedKeyForSender" TEXT,
    "wrappedKeyForRecipient" TEXT,
    "senderDismissedAt" TIMESTAMP(3),
    "recipientDismissedAt" TIMESTAMP(3),
    "senderLastViewedAt" TIMESTAMP(3),
    "recipientLastViewedAt" TIMESTAMP(3),

    CONSTRAINT "stranger_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrangerMessage
CREATE TABLE "stranger_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "encryptionTier" TEXT NOT NULL DEFAULT 'server',
    "countryCode" TEXT,
    "stateName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stranger_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrangerWave
CREATE TABLE "stranger_waves" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stranger_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StrangerBlock
CREATE TABLE "stranger_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stranger_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: StrangerThread
CREATE INDEX "stranger_threads_senderId_status_idx" ON "stranger_threads"("senderId", "status");
CREATE INDEX "stranger_threads_recipientId_status_idx" ON "stranger_threads"("recipientId", "status");
CREATE INDEX "stranger_threads_status_lastActivityAt_idx" ON "stranger_threads"("status", "lastActivityAt");

-- CreateIndex: StrangerMessage
CREATE INDEX "stranger_messages_threadId_createdAt_idx" ON "stranger_messages"("threadId", "createdAt");

-- CreateIndex: StrangerWave
CREATE UNIQUE INDEX "stranger_waves_threadId_userId_key" ON "stranger_waves"("threadId", "userId");

-- CreateIndex: StrangerBlock
CREATE UNIQUE INDEX "stranger_blocks_blockerId_blockedId_key" ON "stranger_blocks"("blockerId", "blockedId");
CREATE INDEX "stranger_blocks_blockedId_idx" ON "stranger_blocks"("blockedId");

-- AddForeignKey: StrangerThread
ALTER TABLE "stranger_threads" ADD CONSTRAINT "stranger_threads_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stranger_threads" ADD CONSTRAINT "stranger_threads_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: StrangerMessage
ALTER TABLE "stranger_messages" ADD CONSTRAINT "stranger_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "stranger_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stranger_messages" ADD CONSTRAINT "stranger_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: StrangerWave
ALTER TABLE "stranger_waves" ADD CONSTRAINT "stranger_waves_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "stranger_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stranger_waves" ADD CONSTRAINT "stranger_waves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: StrangerBlock
ALTER TABLE "stranger_blocks" ADD CONSTRAINT "stranger_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stranger_blocks" ADD CONSTRAINT "stranger_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
