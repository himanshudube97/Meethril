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
  photoAssets?: Array<{
    ciphertext: string
    iv: string
    type: 'photo' | 'doodle'
    position: number
    spread: number
    rotation: number
    ordinal: number
  }>
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
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  // PRELAUNCH-TEST-PILLS: minimum lead time is 1 minute so SealModal's 5m
  // and 1h test pills work. Tighten back to 7 days
  //   const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  //   if (scheduledFor.getTime() < Date.now() + sevenDaysMs - 60_000) ...
  // before public launch. Grep for "PRELAUNCH-TEST-PILLS" to find every spot.
  if (scheduledFor.getTime() < Date.now() + 60_000 - 5_000) {
    return NextResponse.json({ error: 'scheduledFor too soon (min ~1 minute)' }, { status: 400 })
  }
  if (scheduledFor.getTime() > Date.now() + thirtyDaysMs + 60_000) {
    return NextResponse.json({ error: 'scheduledFor too late (max 30 days)' }, { status: 400 })
  }

  const photoAssets = body.photoAssets ?? []
  if (photoAssets.length > 20) {
    return NextResponse.json({ error: 'too many assets (max 20)' }, { status: 400 })
  }
  for (const a of photoAssets) {
    if (!a.ciphertext || !a.iv || a.type !== 'photo') {
      return NextResponse.json({ error: 'invalid asset shape' }, { status: 400 })
    }
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
    if (photoAssets.length > 0) {
      await tx.letterDeliveryAsset.createMany({
        data: photoAssets.map((a) => ({
          deliveryId: delivery.id,
          ciphertext: a.ciphertext,
          iv: a.iv,
          type: a.type,
          position: a.position,
          spread: a.spread,
          rotation: a.rotation,
          ordinal: a.ordinal,
        })),
      })
    }
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
    // Rollback rather than leave orphan crypto on disk. Run both deletes
    // in a single transaction so a transient DB failure during cleanup
    // can't leave an orphan Letter ghost in the sender's sent list.
    await prisma
      .$transaction([
        prisma.letterDelivery.delete({ where: { id: created.delivery.id } }),
        prisma.letter.delete({ where: { id: created.letterId } }),
      ])
      .catch(() => {})
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
