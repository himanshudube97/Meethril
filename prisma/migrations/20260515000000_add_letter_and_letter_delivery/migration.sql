-- CreateTable
CREATE TABLE "letters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceJournalEntryId" TEXT,
    "letterType" TEXT NOT NULL,
    "contentCiphertext" TEXT,
    "contentIVs" JSONB,
    "title" TEXT,
    "titleIV" TEXT,
    "encryptionType" TEXT NOT NULL DEFAULT 'server',
    "e2eeIV" TEXT,
    "e2eeIVs" JSONB,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "senderName" TEXT,
    "letterLocation" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "originalSenderId" TEXT,
    "originalLetterId" TEXT,
    "isSealed" BOOLEAN NOT NULL DEFAULT true,
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "isViewed" BOOLEAN NOT NULL DEFAULT false,
    "letterPeekedAt" TIMESTAMP(3),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isReceivedLetter" BOOLEAN NOT NULL DEFAULT false,
    "firstReadAt" TIMESTAMP(3),
    "savedByRecipientAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bouncedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_deliveries" (
    "id" TEXT NOT NULL,
    "letterId" TEXT NOT NULL,
    "transientCiphertext" TEXT NOT NULL,
    "transientIV" TEXT NOT NULL,
    "tlockedKey" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "firstReadAt" TIMESTAMP(3),
    "transientExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "letters_sourceJournalEntryId_key" ON "letters"("sourceJournalEntryId");

-- CreateIndex
CREATE INDEX "letters_userId_letterType_isArchived_idx" ON "letters"("userId", "letterType", "isArchived");

-- CreateIndex
CREATE INDEX "letters_scheduledFor_deliveredAt_idx" ON "letters"("scheduledFor", "deliveredAt");

-- CreateIndex
CREATE INDEX "letters_sourceJournalEntryId_idx" ON "letters"("sourceJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_deliveries_letterId_key" ON "letter_deliveries"("letterId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_deliveries_publicToken_key" ON "letter_deliveries"("publicToken");

-- CreateIndex
CREATE INDEX "letter_deliveries_transientExpiresAt_idx" ON "letter_deliveries"("transientExpiresAt");

-- AddForeignKey
ALTER TABLE "letters" ADD CONSTRAINT "letters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_deliveries" ADD CONSTRAINT "letter_deliveries_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
