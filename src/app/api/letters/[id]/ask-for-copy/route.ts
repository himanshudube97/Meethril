// src/app/api/letters/[id]/ask-for-copy/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPaidUser } from '@/lib/billing/is-paid-user'
import { sendAskForCopyEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, subscriptionStatus: true, currentPeriodEnd: true },
  })
  if (!dbUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPaidUser(dbUser)) {
    return NextResponse.json({ error: 'paid feature' }, { status: 402 })
  }

  const { id } = await params
  const letter = await prisma.letter.findFirst({
    where: { id, userId: user.id, letterType: 'friend' },
    select: { recipientEmail: true, recipientName: true, savedByRecipientAt: true },
  })
  if (!letter) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!letter.savedByRecipientAt) {
    return NextResponse.json({ error: 'recipient has not saved this letter' }, { status: 409 })
  }
  if (!letter.recipientEmail) {
    return NextResponse.json({ error: 'no recipient email' }, { status: 409 })
  }

  await sendAskForCopyEmail({
    to: letter.recipientEmail,
    recipientName: letter.recipientName ?? null,
    senderName: dbUser.name ?? 'A friend',
  })

  return NextResponse.json({ ok: true })
}
