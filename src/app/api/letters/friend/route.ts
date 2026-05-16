// src/app/api/letters/friend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendFriendLetterTransientEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

interface Body {
  transientCiphertext: string
  transientIV: string
  tlockedKey: string
  recipientEmail: string
  recipientName: string
  senderName: string
  scheduledFor: string
  letterLocation?: string | null
  draftEntryId?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function newPublicToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.transientCiphertext || !body.transientIV || !body.tlockedKey) {
    return NextResponse.json({ error: 'missing crypto fields' }, { status: 400 })
  }
  if (!EMAIL_RE.test(body.recipientEmail ?? '')) {
    return NextResponse.json({ error: 'bad recipientEmail' }, { status: 400 })
  }
  const scheduledFor = new Date(body.scheduledFor)
  if (Number.isNaN(scheduledFor.valueOf())) {
    return NextResponse.json({ error: 'bad scheduledFor' }, { status: 400 })
  }
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  if (scheduledFor.getTime() < Date.now() + sevenDaysMs - 60_000) {
    return NextResponse.json({ error: 'scheduledFor too soon (min 7 days)' }, { status: 400 })
  }
  if (scheduledFor.getTime() > Date.now() + thirtyDaysMs + 60_000) {
    return NextResponse.json({ error: 'scheduledFor too late (max 30 days)' }, { status: 400 })
  }

  // Create the Letter (receipt, no content) + LetterDelivery in one transaction,
  // then call Resend. If Resend fails, we delete the rows to avoid orphans.
  const publicToken = newPublicToken()
  const created = await prisma.$transaction(async (tx) => {
    const letter = await tx.letter.create({
      data: {
        userId: user.id,
        letterType: 'friend',
        encryptionType: 'e2ee',
        contentCiphertext: null,
        scheduledFor,
        recipientEmail: body.recipientEmail,
        recipientName: body.recipientName,
        senderName: body.senderName,
        letterLocation: body.letterLocation ?? null,
        isSealed: true,
      },
      select: { id: true },
    })
    const delivery = await tx.letterDelivery.create({
      data: {
        letterId: letter.id,
        transientCiphertext: body.transientCiphertext,
        transientIV: body.transientIV,
        tlockedKey: body.tlockedKey,
        publicToken,
      },
      select: { id: true, publicToken: true },
    })
    return { letterId: letter.id, delivery }
  })

  try {
    const { id } = await sendFriendLetterTransientEmail({
      to: body.recipientEmail,
      recipientName: body.recipientName,
      senderName: body.senderName,
      scheduledFor,
      publicToken,
      tlockedKey: body.tlockedKey,
    })
    await prisma.letterDelivery.update({
      where: { id: created.delivery.id },
      data: { resendEmailId: id },
    })
  } catch (e) {
    // Rollback rather than leave orphan crypto on disk.
    await prisma.letterDelivery.delete({ where: { id: created.delivery.id } }).catch(() => {})
    await prisma.letter.delete({ where: { id: created.letterId } }).catch(() => {})
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'resend failed' },
      { status: 502 }
    )
  }

  if (body.draftEntryId) {
    await prisma.journalEntry
      .deleteMany({ where: { id: body.draftEntryId, userId: user.id } })
      .catch(() => {})
  }

  return NextResponse.json({ letterId: created.letterId, publicToken })
}
