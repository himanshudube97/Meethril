/**
 * Phase 2 backfill: copy every JournalEntry letter into the new Letter table
 * as letterType='self'. Idempotent (uses upsert keyed on sourceJournalEntryId).
 *
 * Usage:
 *   docker compose exec app npx tsx scripts/backfill-letters.ts --dry-run
 *   docker compose exec app npx tsx scripts/backfill-letters.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const BATCH = 200

  const total = await prisma.journalEntry.count({
    where: { entryType: { in: ['letter', 'unsent_letter'] } },
  })
  console.log(`Found ${total} JournalEntry letter rows to backfill.`)
  if (total === 0) {
    console.log('Nothing to do.')
    return
  }

  let processed = 0
  let created = 0
  let updated = 0
  let cursor: string | undefined

  while (processed < total) {
    const batch: Array<{
      id: string
      userId: string
      text: string
      encryptionType: string
      e2eeIV: string | null
      e2eeIVs: unknown
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
    }> = await prisma.journalEntry.findMany({
      where: { entryType: { in: ['letter', 'unsent_letter'] } },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        userId: true,
        text: true,
        encryptionType: true,
        e2eeIV: true,
        e2eeIVs: true,
        recipientEmail: true,
        recipientName: true,
        senderName: true,
        letterLocation: true,
        unlockDate: true,
        isSealed: true,
        isDelivered: true,
        deliveredAt: true,
        isViewed: true,
        letterPeekedAt: true,
        isArchived: true,
        isReceivedLetter: true,
        originalSenderId: true,
        originalEntryId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (batch.length === 0) break

    for (const e of batch) {
      const data = {
        userId: e.userId,
        sourceJournalEntryId: e.id,
        letterType: 'self', // per Phase 2 spec — all backfilled rows are 'self'
        contentCiphertext: e.text,
        contentIVs: null,
        encryptionType: e.encryptionType,
        e2eeIV: e.e2eeIV,
        e2eeIVs: e.e2eeIVs ?? null,
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
      }

      if (dryRun) {
        const existing = await prisma.letter.findUnique({
          where: { sourceJournalEntryId: e.id },
          select: { id: true },
        })
        if (existing) updated++
        else created++
      } else {
        const existing = await prisma.letter.findUnique({
          where: { sourceJournalEntryId: e.id },
          select: { id: true },
        })
        await prisma.letter.upsert({
          where: { sourceJournalEntryId: e.id },
          create: data,
          update: data,
        })
        if (existing) updated++
        else created++
      }
      processed++
    }

    cursor = batch[batch.length - 1].id
    console.log(`Processed ${processed} / ${total}`)
  }

  console.log(`Done. ${dryRun ? '[DRY RUN] ' : ''}Created: ${created}, Updated: ${updated}, Total: ${processed}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
