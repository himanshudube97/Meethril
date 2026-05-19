/**
 * One-shot backfill: v1 (StrangerNote + StrangerReply) → v2 (StrangerThread + StrangerMessage).
 *
 * Mapping:
 *   - Each StrangerNote → StrangerThread + first StrangerMessage
 *     status mapping: 'queued' → 'unmatched'; 'delivered' or 'replied' → 'active'
 *     lastActivityAt = matchedAt ?? createdAt
 *   - Each StrangerReply → second StrangerMessage on the corresponding thread,
 *     and bump lastActivityAt = reply.createdAt
 *   - All backfilled messages have encryptionTier='server' (Tier 2, server-encrypted)
 *
 * Idempotent: re-runs are safe — checks for existing thread.id by source note.id.
 *
 * Run: docker compose exec app npx tsx prisma/backfill-stranger-notes-v2.ts
 */

import { PrismaClient } from '@prisma/client'
import { generateDisplayName } from '../src/lib/stranger-names'

const prisma = new PrismaClient()

async function main() {
  const oldNotes = await prisma.strangerNote.findMany({
    include: { reply: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${oldNotes.length} v1 notes to backfill`)

  let createdThreads = 0
  let createdMessages = 0
  let skipped = 0

  for (const note of oldNotes) {
    // Reuse the old note.id as the new thread.id so the backfill is idempotent.
    const existing = await prisma.strangerThread.findUnique({ where: { id: note.id } })
    if (existing) {
      skipped++
      continue
    }

    const statusMap: Record<string, string> = {
      queued: 'unmatched',
      delivered: 'active',
      replied: 'active',
    }
    const newStatus = statusMap[note.status] ?? 'unmatched'
    const lastActivityAt = note.reply?.createdAt ?? note.matchedAt ?? note.createdAt

    const senderDisplayName = generateDisplayName(`${note.id}:sender`)
    const recipientDisplayName = note.recipientId
      ? generateDisplayName(`${note.id}:recipient`)
      : null

    await prisma.$transaction(async (tx) => {
      await tx.strangerThread.create({
        data: {
          id: note.id,
          senderId: note.senderId,
          recipientId: note.recipientId,
          status: newStatus,
          senderDisplayName,
          recipientDisplayName,
          createdAt: note.createdAt,
          matchedAt: note.matchedAt,
          lastActivityAt,
          senderLastViewedAt: null,
          recipientLastViewedAt: note.readAt,
        },
      })

      // First message: the original note content (server-encrypted, Tier 2)
      await tx.strangerMessage.create({
        data: {
          threadId: note.id,
          senderId: note.senderId,
          content: note.content, // already ciphertext
          encryptionTier: 'server',
          createdAt: note.createdAt,
        },
      })

      // Second message: the reply (if any)
      if (note.reply && note.recipientId) {
        await tx.strangerMessage.create({
          data: {
            threadId: note.id,
            senderId: note.recipientId,
            content: note.reply.content, // already ciphertext
            encryptionTier: 'server',
            createdAt: note.reply.createdAt,
          },
        })
        createdMessages++
      }
    })

    createdThreads++
    createdMessages++
  }

  console.log(`Backfill complete: ${createdThreads} threads, ${createdMessages} messages, ${skipped} skipped (already migrated)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
