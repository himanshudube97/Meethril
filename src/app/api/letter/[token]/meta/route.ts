// src/app/api/letter/[token]/meta/route.ts
//
// Public, no-auth metadata for a friend letter delivery. Returns the
// scheduledFor (so the client can compute the drand round to fetch),
// sender/recipient display names (plaintext on the row), and a flag
// indicating whether the 24h read window is already used up.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: {
      firstReadAt: true,
      letter: {
        select: {
          scheduledFor: true,
          recipientName: true,
          senderName: true,
        },
      },
      assets: {
        select: {
          id: true,
          type: true,
          position: true,
          spread: true,
          rotation: true,
          ordinal: true,
        },
        orderBy: { ordinal: 'asc' },
      },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  const alreadyExpired =
    delivery.firstReadAt !== null &&
    delivery.firstReadAt.getTime() + 24 * 60 * 60 * 1000 < Date.now()

  return NextResponse.json({
    scheduledFor: delivery.letter.scheduledFor?.toISOString() ?? null,
    senderName: delivery.letter.senderName ?? null,
    recipientName: delivery.letter.recipientName ?? null,
    alreadyExpired,
    firstReadAt: delivery.firstReadAt?.toISOString() ?? null,
    assets: delivery.assets, // [{id, type, position, spread, rotation, ordinal}]
  })
}
