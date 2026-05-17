/**
 * Phase 2 backfill: copy every JournalEntry letter into the new Letter table
 * as letterType='self'. Idempotent (skip-existing keyed on sourceJournalEntryId).
 *
 * The journal_entries table still has its legacy letter columns
 * (encryptionType, recipientEmail, isSealed, etc.) but the Prisma schema no
 * longer exposes them, so the source rows are read via raw SQL.
 *
 * Usage (script connects to whatever DATABASE_URL points at):
 *   docker compose exec app npx tsx scripts/backfill-letters.ts --dry-run
 *   docker compose exec app npx tsx scripts/backfill-letters.ts
 *
 * To target staging/prod from your laptop, prefix with an inline DATABASE_URL:
 *   docker compose exec -e DATABASE_URL='postgresql://...' app \
 *     npx tsx scripts/backfill-letters.ts --dry-run
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

interface SourceRow {
  id: string
  userId: string
  text: string
  encryptionType: string
  e2eeIV: string | null
  e2eeIVs: Prisma.JsonValue | null
  recipientEmail: string | null
  recipientName: string | null
  senderName: string | null
  letterLocation: string | null
  unlockDate: Date | null
  isSealed: boolean
  isDelivered: boolean
  deliveredAt: Date | null
  isViewed: boolean
  letterPeekedAt: Date | null
  isArchived: boolean
  isReceivedLetter: boolean
  originalSenderId: string | null
  originalEntryId: string | null
  createdAt: Date
  updatedAt: Date
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const sourceRows = await prisma.$queryRaw<SourceRow[]>`
    SELECT
      id,
      "userId",
      text,
      "encryptionType",
      "e2eeIV",
      "e2eeIVs",
      "recipientEmail",
      "recipientName",
      "senderName",
      "letterLocation",
      "unlockDate",
      "isSealed",
      "isDelivered",
      "deliveredAt",
      "isViewed",
      "letterPeekedAt",
      "isArchived",
      "isReceivedLetter",
      "originalSenderId",
      "originalEntryId",
      "createdAt",
      "updatedAt"
    FROM journal_entries
    WHERE "entryType" IN ('letter', 'unsent_letter')
    ORDER BY id ASC
  `

  console.log(`Found ${sourceRows.length} JournalEntry letter rows to backfill.`)
  if (sourceRows.length === 0) {
    console.log('Nothing to do.')
    return
  }

  let created = 0
  let skipped = 0

  for (const e of sourceRows) {
    const existing = await prisma.letter.findUnique({
      where: { sourceJournalEntryId: e.id },
      select: { id: true },
    })
    if (existing) {
      skipped++
      continue
    }
    if (dryRun) {
      created++
      continue
    }

    await prisma.letter.create({
      data: {
        userId: e.userId,
        sourceJournalEntryId: e.id,
        letterType: 'self', // per Phase 2 spec — all backfilled rows are 'self'
        contentCiphertext: e.text,
        contentIVs: Prisma.JsonNull,
        encryptionType: e.encryptionType,
        e2eeIV: e.e2eeIV,
        e2eeIVs: (e.e2eeIVs ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        recipientEmail: e.recipientEmail,
        recipientName: e.recipientName,
        senderName: e.senderName,
        letterLocation: e.letterLocation,
        scheduledFor: e.unlockDate,
        originalSenderId: e.originalSenderId,
        originalLetterId: e.originalEntryId,
        isSealed: e.isSealed,
        isDelivered: e.isDelivered,
        deliveredAt: e.deliveredAt,
        isViewed: e.isViewed,
        letterPeekedAt: e.letterPeekedAt,
        isArchived: e.isArchived,
        isReceivedLetter: e.isReceivedLetter,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      },
    })
    created++
  }

  console.log(`Done. ${dryRun ? '[DRY RUN] ' : ''}Created: ${created}, Skipped (already in letters): ${skipped}, Total source rows: ${sourceRows.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
