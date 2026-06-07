import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  validateMessageContent,
  encryptServerTier,
  countTodaysNewNotes,
  hasWrittenJournalEntry,
  safeIanaTz,
} from '@/lib/stranger-notes'
import { isPaidUser } from '@/lib/billing/is-paid-user'
import { isAdminEmail } from '@/lib/auth/admin'
import { limitsFor } from '@/lib/billing/limits'
import { pickRandomRecipient, deliverThreadToRecipient } from '@/lib/stranger-matcher'
import { generateDisplayName } from '@/lib/stranger-names'
import { moderateText } from '@/lib/moderation'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { content?: unknown; country?: unknown; state?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }
  const validation = validateMessageContent(body.content)
  if (!validation.ok) {
    const map = {
      empty: 'Write something first.',
      too_short: 'A little longer — at least 10 characters.',
      too_long: 'A little shorter — at most 200 characters.',
    } as const
    return NextResponse.json({ error: map[validation.error] }, { status: 400 })
  }
  const country = typeof body.country === 'string' && body.country.length > 0 ? body.country : null
  const stateName = typeof body.state === 'string' && body.state.length > 0 ? body.state : null

  // Cold-start gate
  const hasEntry = await hasWrittenJournalEntry(user.id)
  if (!hasEntry) {
    return NextResponse.json(
      { error: 'Write something for yourself first before reaching out to a stranger.' },
      { status: 403 }
    )
  }

  // Daily limit — tier-dependent (free: 2/day, paid: 5/day).
  const tz = safeIanaTz(req.headers.get('X-User-TZ'))
  const dbUserForTier = await prisma.user.findUnique({
    where: { id: user.id },
    select: { subscriptionStatus: true, currentPeriodEnd: true, complimentaryAccess: true },
  })
  const dailyLimit = limitsFor(
    dbUserForTier ? isPaidUser({ ...dbUserForTier, isAdmin: isAdminEmail(user.email) }) : false
  ).strangerNotesPerDay
  const todaysCount = await countTodaysNewNotes(user.id, tz)
  if (todaysCount >= dailyLimit) {
    return NextResponse.json(
      { error: 'Your lights are on their way. Come back tomorrow.' },
      { status: 429 }
    )
  }

  // Moderation
  const moderation = await moderateText(validation.trimmed)
  if (moderation.rejected) {
    return NextResponse.json(
      { error: 'This note can\'t be sent. Try writing it with more warmth.' },
      { status: 400 }
    )
  }
  // selfHarm is not a rejection here; the client interstitial handles it pre-submit.

  const ciphertext = encryptServerTier(validation.trimmed)

  // Create thread + first message + bump sender counter atomically.
  const senderDisplayName = generateDisplayName(`${user.id}:${Date.now()}:sender`)
  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.strangerThread.create({
      data: {
        senderId: user.id,
        status: 'unmatched',
        senderDisplayName,
        messages: {
          create: {
            senderId: user.id,
            content: ciphertext,
            encryptionTier: 'server',
            countryCode: country,
            stateName,
          },
        },
      },
    })
    await tx.user.update({
      where: { id: user.id },
      data: {
        strangerNotesSent: { increment: 1 },
        lastStrangerNoteSentAt: new Date(),
      },
    })
    return created
  })

  // Synchronous match attempt. If no eligible recipient, thread stays 'unmatched'
  // and the cron retries.
  const recipientId = await pickRandomRecipient(user.id)
  if (recipientId) {
    const recipientDisplayName = generateDisplayName(`${thread.id}:recipient`)
    await deliverThreadToRecipient(thread.id, recipientId, recipientDisplayName)
  }

  const finalThread = await prisma.strangerThread.findUnique({
    where: { id: thread.id },
    select: { id: true, status: true },
  })

  return NextResponse.json({ id: thread.id, status: finalThread?.status ?? 'unmatched' }, { status: 201 })
}
