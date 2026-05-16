// src/app/api/letter/[token]/ciphertext/route.ts
//
// Returns the transient ciphertext + IV for a friend letter delivery.
// First call sets `firstReadAt` (starts the 24h read window). Calls
// after 24h return 410. No auth — the URL fragment K is the auth.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const READ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      transientCiphertext: true,
      transientIV: true,
      firstReadAt: true,
      transientExpiresAt: true,
      letter: { select: { id: true, scheduledFor: true } },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  // If unlock date hasn't passed, the client shouldn't be calling this yet —
  // they couldn't have derived K. Still, defend against it.
  if (delivery.letter.scheduledFor && delivery.letter.scheduledFor.getTime() > Date.now()) {
    return NextResponse.json({ reason: 'not_yet' }, { status: 425 })
  }

  // 24h check
  if (delivery.firstReadAt) {
    const expired = delivery.firstReadAt.getTime() + READ_WINDOW_MS < Date.now()
    if (expired) {
      return NextResponse.json({ reason: 'expired' }, { status: 410 })
    }
  } else {
    // First read — set firstReadAt and transientExpiresAt, mirror onto Letter
    const firstReadAt = new Date()
    const transientExpiresAt = new Date(firstReadAt.getTime() + READ_WINDOW_MS)
    await prisma.$transaction([
      prisma.letterDelivery.update({
        where: { id: delivery.id },
        data: { firstReadAt, transientExpiresAt },
      }),
      prisma.letter.update({
        where: { id: delivery.letter.id },
        data: { firstReadAt },
      }),
    ])
  }

  return NextResponse.json({
    transientCiphertext: delivery.transientCiphertext,
    transientIV: delivery.transientIV,
  })
}
