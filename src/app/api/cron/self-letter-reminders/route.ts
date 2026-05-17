// src/app/api/cron/self-letter-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendSelfLetterReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  // Fail-closed in production: a missing CRON_SECRET would otherwise leave
  // this endpoint publicly callable, which could be used to spam Resend
  // reminders. Dev keeps fail-open so local cron testing works without
  // any extra env setup.
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'cron not configured' }, { status: 500 })
  }
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

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
    try {
      await sendSelfLetterReminderEmail({
        to: l.user.email,
        recipientName: l.user.name ?? null,
        writtenOn: l.createdAt,
      })
      await prisma.letter.update({ where: { id: l.id }, data: { deliveredAt: new Date(), isDelivered: true } })
      processed++
    } catch (e) {
      errors.push(`${l.id}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ processed, errors })
}
