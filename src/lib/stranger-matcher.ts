import { prisma } from '@/lib/db'

/**
 * Try to find an eligible random recipient for a stranger note from `senderId`.
 * Eligibility:
 *   - id <> senderId
 *   - strangerNotesSendingSuspended = false
 *   - no symmetric block: neither (blockerId=sender, blockedId=candidate)
 *     nor (blockerId=candidate, blockedId=sender) exists in stranger_blocks.
 *
 * Single SQL roundtrip with ORDER BY random(). Acceptable up to ~100k users; revisit if scale grows.
 */
export async function pickRandomRecipient(senderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id FROM users u
    WHERE u.id <> ${senderId}
      AND COALESCE(u."strangerNotesSendingSuspended", false) = false
      AND NOT EXISTS (
        SELECT 1 FROM stranger_blocks sb
        WHERE (sb."blockerId" = ${senderId} AND sb."blockedId" = u.id)
           OR (sb."blockerId" = u.id        AND sb."blockedId" = ${senderId})
      )
    ORDER BY random()
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

/**
 * Atomically transition a thread from 'unmatched' → 'active', assigning a recipient,
 * stamping matchedAt + recipientDisplayName, and bumping the recipient's counter.
 *
 * Returns true if matched, false if the thread was already non-unmatched.
 */
export async function deliverThreadToRecipient(
  threadId: string,
  recipientId: string,
  recipientDisplayName: string
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const update = await tx.strangerThread.updateMany({
      where: { id: threadId, status: 'unmatched' },
      data: {
        recipientId,
        recipientDisplayName,
        matchedAt: new Date(),
        status: 'active',
        lastActivityAt: new Date(),
      },
    })
    if (update.count === 0) return false
    await tx.user.update({
      where: { id: recipientId },
      data: { strangerNotesReceived: { increment: 1 } },
    })
    return true
  })
  return result
}
