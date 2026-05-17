// src/app/api/letter/[token]/asset/[assetId]/route.ts
//
// Public GET. Returns one K-encrypted asset blob for a delivery. No auth
// — the URL fragment K is the auth, exactly like /ciphertext. Lifecycle
// matches the parent LetterDelivery: 24h after firstRead, or 60d unread.
// The cleanup cron deletes the parent → asset cascade-deletes.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const READ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; assetId: string }> },
) {
  const { token, assetId } = await params

  const asset = await prisma.letterDeliveryAsset.findUnique({
    where: { id: assetId },
    select: {
      ciphertext: true,
      iv: true,
      type: true,
      position: true,
      spread: true,
      rotation: true,
      ordinal: true,
      delivery: {
        select: {
          publicToken: true,
          firstReadAt: true,
          letter: { select: { scheduledFor: true } },
        },
      },
    },
  })

  if (!asset) return NextResponse.json({ reason: 'not_found' }, { status: 404 })

  // Token must match the asset's delivery — prevents asset-id grinding
  // across deliveries with a stolen URL fragment.
  if (asset.delivery.publicToken !== token) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  // Same not-yet / expired gates as /ciphertext.
  if (
    asset.delivery.letter.scheduledFor &&
    asset.delivery.letter.scheduledFor.getTime() > Date.now()
  ) {
    return NextResponse.json({ reason: 'not_yet' }, { status: 425 })
  }
  if (
    asset.delivery.firstReadAt &&
    asset.delivery.firstReadAt.getTime() + READ_WINDOW_MS < Date.now()
  ) {
    return NextResponse.json({ reason: 'expired' }, { status: 410 })
  }

  return NextResponse.json({
    ciphertext: asset.ciphertext,
    iv: asset.iv,
    type: asset.type,
    position: asset.position,
    spread: asset.spread,
    rotation: asset.rotation,
    ordinal: asset.ordinal,
  })
}
