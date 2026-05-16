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
  // senderName from client is ignored — server derives it from the
  // authenticated user's profile.nickname / User.name so a sender can't
  // spoof their display name in the delivery email.
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
  // In dev mode the 7-day floor is relaxed to 1 minute so the 5m / 1h
  // SealModal pills work end-to-end. Production keeps the 7-day floor.
  // Remove this dev-mode branch when test scaffolding is no longer needed.
  const isDevAuth = process.env.USE_DEV_AUTH === 'true'
  const minLeadMs = isDevAuth ? 60_000 : sevenDaysMs
  if (scheduledFor.getTime() < Date.now() + minLeadMs - 60_000) {
    return NextResponse.json(
      { error: isDevAuth ? 'scheduledFor too soon (min ~1 minute in dev)' : 'scheduledFor too soon (min 7 days)' },
      { status: 400 },
    )
  }
  if (scheduledFor.getTime() > Date.now() + thirtyDaysMs + 60_000) {
    return NextResponse.json({ error: 'scheduledFor too late (max 30 days)' }, { status: 400 })
  }

  // Derive senderName server-side. Prefer profile.nickname (the user-set
  // display name) and fall back to User.name. Never trust a client-supplied
  // senderName — the email is sent on this user's behalf, so the name in
  // it has to come from the authenticated identity.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, profile: true },
  })
  const profile = (dbUser?.profile ?? null) as { nickname?: string } | null
  const senderName =
    (profile?.nickname && profile.nickname.trim()) ||
    (dbUser?.name && dbUser.name.trim()) ||
    'A friend'

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
        senderName,
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
      senderName,
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
