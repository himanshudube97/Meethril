// src/app/api/letter/[token]/opened/route.ts
//
// Recipient client calls this after a successful AES-GCM decrypt of the
// letter body. Atomically claims firstReadAt + sets transientExpiresAt
// = firstReadAt + 24h. Idempotent — repeated calls are no-ops because
// the updateMany guard requires firstReadAt: null.
//
// Splitting this from the ciphertext fetch matters because a wrong-
// answer attempt would otherwise burn the 24h window with no way to
// undo it.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const READ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: { id: true, firstReadAt: true, letter: { select: { id: true } } },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  // Already claimed (this is the idempotent path) — succeed.
  if (delivery.firstReadAt) {
    return NextResponse.json({ ok: true, firstReadAt: delivery.firstReadAt.toISOString() })
  }

  const firstReadAt = new Date()
  const transientExpiresAt = new Date(firstReadAt.getTime() + READ_WINDOW_MS)

  // Race guard: only the request that finds firstReadAt still null
  // actually writes. Losers are harmless — they would have written
  // ~the same timestamp anyway.
  const claim = await prisma.letterDelivery.updateMany({
    where: { id: delivery.id, firstReadAt: null },
    data: { firstReadAt, transientExpiresAt },
  })

  if (claim.count > 0) {
    await prisma.letter.update({
      where: { id: delivery.letter.id },
      data: { firstReadAt },
    })
  }

  return NextResponse.json({ ok: true, firstReadAt: firstReadAt.toISOString() })
}
