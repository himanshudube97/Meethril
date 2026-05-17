-- Cleanup of legacy letter / encryption columns that older migrations created
-- but the current Prisma schema no longer declares. This brings a freshly-
-- migrated database in line with `schema.prisma`.
--
-- For databases that already accumulated data into these columns (i.e. your
-- existing staging), DO NOT run this migration's SQL — just mark it as
-- applied in `_prisma_migrations`. The app code already ignores these
-- columns, so leaving them in place is harmless and avoids destroying the
-- legacy data they contain.
--
-- A fresh prod database created via `prisma migrate deploy` WILL run this
-- migration end-to-end and produce a fully schema-aligned schema.
--
-- All DROPs guarded with IF EXISTS so re-applying is a no-op.

-- ── Drop the orphan letter_access_tokens table ──────────────────────────
-- (Stale from the pre-tlock letter URL scheme; replaced by
--  LetterDelivery.publicToken.)
DROP TABLE IF EXISTS "letter_access_tokens";

-- ── Drop legacy indexes on letters ──────────────────────────────────────
DROP INDEX IF EXISTS "letters_sourceJournalEntryId_idx";
DROP INDEX IF EXISTS "letters_sourceJournalEntryId_key";

-- ── Drop legacy index on journal_entries ────────────────────────────────
DROP INDEX IF EXISTS "journal_entries_unlockDate_isDelivered_idx";

-- ── Drop legacy letter metadata from journal_entries ────────────────────
-- All of these moved to the dedicated `letters` table after the Phase-4
-- refactor. journal_entries is journal-only now.
ALTER TABLE "journal_entries"
  DROP COLUMN IF EXISTS "deliveredAt",
  DROP COLUMN IF EXISTS "e2eeIV",
  DROP COLUMN IF EXISTS "encryptionType",
  DROP COLUMN IF EXISTS "isDelivered",
  DROP COLUMN IF EXISTS "isReceivedLetter",
  DROP COLUMN IF EXISTS "isSealed",
  DROP COLUMN IF EXISTS "isViewed",
  DROP COLUMN IF EXISTS "letterLocation",
  DROP COLUMN IF EXISTS "letterPeekedAt",
  DROP COLUMN IF EXISTS "originalEntryId",
  DROP COLUMN IF EXISTS "originalSenderId",
  DROP COLUMN IF EXISTS "recipientEmail",
  DROP COLUMN IF EXISTS "recipientName",
  DROP COLUMN IF EXISTS "senderName",
  DROP COLUMN IF EXISTS "unlockDate";

-- ── Drop legacy fields from letters ─────────────────────────────────────
-- sourceJournalEntryId: provenance link removed after Phase-4 refactor.
-- encryptionType / e2eeIV / e2eeIVs: per-letter encryption metadata is now
-- folded into contentIVs (Json) on the same row.
ALTER TABLE "letters"
  DROP COLUMN IF EXISTS "e2eeIV",
  DROP COLUMN IF EXISTS "e2eeIVs",
  DROP COLUMN IF EXISTS "encryptionType",
  DROP COLUMN IF EXISTS "sourceJournalEntryId";

-- ── Drop unused encryptionType on scrapbooks ────────────────────────────
-- All scrapbooks are E2EE; encryptionType was redundant.
ALTER TABLE "scrapbooks"
  DROP COLUMN IF EXISTS "encryptionType";
