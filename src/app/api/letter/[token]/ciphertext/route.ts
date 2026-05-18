// src/app/api/letter/[token]/ciphertext/route.ts
//
// Returns the transient ciphertext + IV for a friend letter delivery.
// Idempotent — does NOT claim firstReadAt. (The recipient may fetch
// ciphertext and then fail to decrypt because they typed the wrong
// answer; we don't want to burn the 24h read window on that.) The
// client calls POST /api/letter/[token]/opened after a successful
// client-side decrypt to start the 24h clock.
//
// Calls after the 24h window expires still return 410.

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
      transientCiphertext: true,
      transientIV: true,
      firstReadAt: true,
      letter: { select: { scheduledFor: true } },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  if (delivery.letter.scheduledFor && delivery.letter.scheduledFor.getTime() > Date.now()) {
    return NextResponse.json({ reason: 'not_yet' }, { status: 425 })
  }

  if (
    delivery.firstReadAt &&
    delivery.firstReadAt.getTime() + READ_WINDOW_MS < Date.now()
  ) {
    return NextResponse.json({ reason: 'expired' }, { status: 410 })
  }

  return NextResponse.json({
    transientCiphertext: delivery.transientCiphertext,
    transientIV: delivery.transientIV,
  })
}
