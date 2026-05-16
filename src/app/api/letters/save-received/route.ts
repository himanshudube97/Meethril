// src/app/api/letters/save-received/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  publicToken: string
  contentCiphertext: string
  contentIVs: { content: string }
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
  if (!body.publicToken || !body.contentCiphertext || !body.contentIVs?.content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: body.publicToken },
    select: {
      id: true,
      firstReadAt: true,
      letter: {
        select: {
          id: true,
          userId: true, // original sender
          senderName: true,
          recipientName: true,
          letterLocation: true,
          scheduledFor: true,
          savedByRecipientAt: true,
        },
      },
    },
  })
  if (!delivery) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Must have been read at least once (otherwise client doesn't have the
  // plaintext to re-encrypt). Outside the 24h window we still allow the
  // save because the client already decrypted — but the LetterDelivery
  // ciphertext fetch would have already returned 410 anyway, so this is
  // a belt-and-braces check.
  if (!delivery.firstReadAt) {
    return NextResponse.json({ error: 'letter not opened yet' }, { status: 409 })
  }
  if (delivery.letter.savedByRecipientAt) {
    return NextResponse.json({ error: 'already saved' }, { status: 409 })
  }

  const savedAt = new Date()
  const [letter] = await prisma.$transaction([
    prisma.letter.create({
      data: {
        userId: user.id,
        letterType: 'received-friend',
        encryptionType: 'e2ee',
        contentCiphertext: body.contentCiphertext,
        contentIVs: body.contentIVs,
        scheduledFor: delivery.letter.scheduledFor,
        senderName: delivery.letter.senderName,
        recipientName: delivery.letter.recipientName,
        letterLocation: delivery.letter.letterLocation,
        originalSenderId: delivery.letter.userId,
        originalLetterId: delivery.letter.id,
        isSealed: true,
        isReceivedLetter: true,
        savedByRecipientAt: savedAt,
      },
      select: { id: true },
    }),
    prisma.letter.update({
      where: { id: delivery.letter.id },
      data: { savedByRecipientAt: savedAt },
    }),
    prisma.letterDelivery.update({
      where: { id: delivery.id },
      data: { firstReadAt: delivery.firstReadAt }, // no-op; force write to invalidate any caches
    }),
  ])

  return NextResponse.json({ letterId: letter.id })
}
