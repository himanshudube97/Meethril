-- Letter drafts + delivery assets schema catch-up.
--
-- The original Phase-4 migration (20260515000000) created `letters` and
-- `letter_deliveries` but the schema was extended afterwards without new
-- migrations being generated. This migration brings the database back in
-- sync with `schema.prisma`:
--
--   1. ADD the 9 missing columns on `letters` (draft autosave + keep-forever).
--   2. CREATE the `letter_delivery_assets` table (per-photo asset rows for
--      friend letters with attachments).
--
-- Strictly additive — no DROPs, no ALTERs to existing columns, no data
-- changes. Safe to apply in any order. Uses IF NOT EXISTS on the ALTERs so
-- re-running it is a no-op.

-- ── 1. Missing columns on `letters` ─────────────────────────────────────
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "keptPhotoRefs"   JSONB;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftText"       TEXT;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftTextIV"     TEXT;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftTextPreview" TEXT;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftSong"       TEXT;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftSongIV"     TEXT;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftPhotos"     JSONB;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftDoodles"    JSONB;
ALTER TABLE "letters" ADD COLUMN IF NOT EXISTS "draftStyle"      JSONB;

-- ── 2. New table `letter_delivery_assets` ───────────────────────────────
CREATE TABLE IF NOT EXISTS "letter_delivery_assets" (
    "id"         TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv"         TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "position"   INTEGER NOT NULL DEFAULT 0,
    "spread"     INTEGER NOT NULL DEFAULT 1,
    "rotation"   INTEGER NOT NULL DEFAULT 0,
    "ordinal"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_delivery_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "letter_delivery_assets_deliveryId_idx"
    ON "letter_delivery_assets"("deliveryId");

-- Add FK only if not already present (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'letter_delivery_assets_deliveryId_fkey'
  ) THEN
    ALTER TABLE "letter_delivery_assets"
      ADD CONSTRAINT "letter_delivery_assets_deliveryId_fkey"
      FOREIGN KEY ("deliveryId") REFERENCES "letter_deliveries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
