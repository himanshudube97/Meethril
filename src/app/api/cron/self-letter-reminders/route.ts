// src/app/api/cron/self-letter-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendSelfLetterReminderEmail } from '@/lib/email'
import { checkCronAuth } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  const now = new Date()
  const due = await prisma.letter.findMany({
    where: {
      letterType: 'self',
      deliveredAt: null,
      scheduledFor: { lte: now },
    },
    select: {
      id: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
    take: 100,
  })

  const errors: string[] = []
  let processed = 0
  for (const l of due) {
    // Claim the row before sending so concurrent cron firings can't double-send.
    // updateMany returns count=0 if another worker already flipped deliveredAt.
    const claim = await prisma.letter.updateMany({
      where: { id: l.id, deliveredAt: null },
      data: { deliveredAt: new Date(), isDelivered: true },
    })
    if (claim.count === 0) continue

    try {
      await sendSelfLetterReminderEmail({
        to: l.user.email,
        recipientName: l.user.name ?? null,
        writtenOn: l.createdAt,
      })
      processed++
    } catch (e) {
      // Roll the claim back so a later cron run can retry. Without this, a
      // transient Resend failure would silently swallow the letter forever.
      await prisma.letter.updateMany({
        where: { id: l.id, isDelivered: true },
        data: { deliveredAt: null, isDelivered: false },
      })
      errors.push(`${l.id}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ processed, errors })
}
