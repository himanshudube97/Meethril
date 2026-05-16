// src/app/api/letters/sent/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { safeDecrypt } from '@/lib/encryption'
import { listLettersForRead } from '@/lib/letters/dual-read'

export const dynamic = 'force-dynamic'

interface SentStamp {
  id: string
  recipientName: string | null
  sealedAt: string
  unlockDate: string | null
  isDelivered: boolean
  letterPeekedAt: string | null
  firstReadAt: string | null
  savedByRecipientAt: string | null
  bouncedAt: string | null
  bouncedReason: string | null
  encryptionType: string
  e2eeIVs: unknown
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const letters = await listLettersForRead({
    userId: user.id,
    where: {
      isSealed: true,
      entryType: { in: ['letter', 'unsent_letter'] },
      isReceivedLetter: false,
    },
    orderBy: { createdAt: 'desc' },
  })

  const result: SentStamp[] = letters.map((l) => ({
    id: l.id,
    recipientName:
      l.recipientName && l.encryptionType === 'server'
        ? safeDecrypt(l.recipientName)
        : l.recipientName,
    sealedAt: l.createdAt.toISOString(),
    unlockDate: l.unlockDate ? l.unlockDate.toISOString() : null,
    isDelivered: l.isDelivered,
    letterPeekedAt: l.letterPeekedAt ? l.letterPeekedAt.toISOString() : null,
    firstReadAt: l.firstReadAt ? l.firstReadAt.toISOString() : null,
    savedByRecipientAt: l.savedByRecipientAt ? l.savedByRecipientAt.toISOString() : null,
    bouncedAt: l.bouncedAt ? l.bouncedAt.toISOString() : null,
    bouncedReason: l.bouncedReason ?? null,
    encryptionType: l.encryptionType,
    e2eeIVs: l.e2eeIVs,
  }))

  return NextResponse.json({ stamps: result }) // PRESERVE 'stamps' key — frontend depends on it
}
