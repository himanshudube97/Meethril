// src/app/api/letters/inbox/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { safeDecrypt } from '@/lib/encryption'
import { listLettersForRead } from '@/lib/letters/dual-read'

export const dynamic = 'force-dynamic'

interface InboxLetter {
  id: string
  recipientName: string | null
  sealedAt: string
  unlockDate: string | null
  isViewed: boolean
  encryptionType: string
  e2eeIVs: unknown
  // Included inline so RevealModal can decrypt without a second /api/entries/[id]
  // roundtrip — required for Phase 4 native self-letters whose id is a Letter.id
  // with no corresponding JournalEntry row.
  text: string
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = new Date()
  const letters = await listLettersForRead({
    userId: user.id,
    where: {
      OR: [
        { entryType: 'letter', isSealed: true, unlockDate: { lte: now } },
        { isReceivedLetter: true },
      ],
    },
    orderBy: { unlockDate: 'desc' },
  })

  // For E2EE, return ciphertext + IVs so the client can decrypt with its master key.
  // For server-encrypted, decrypt server-side as before.
  // text is included inline: RevealModal uses it directly for native Phase 4
  // self-letters (Letter.id with no JournalEntry) to avoid a /api/entries/[id]
  // roundtrip that would 404.
  const result: InboxLetter[] = letters.map((l) => ({
    id: l.id,
    recipientName:
      l.recipientName && l.encryptionType === 'server'
        ? safeDecrypt(l.recipientName)
        : l.recipientName,
    sealedAt: l.createdAt.toISOString(),
    unlockDate: l.unlockDate ? l.unlockDate.toISOString() : null,
    isViewed: l.isViewed,
    encryptionType: l.encryptionType,
    e2eeIVs: l.e2eeIVs,
    text: l.encryptionType === 'server' ? safeDecrypt(l.text) : l.text,
  }))

  return NextResponse.json({ letters: result })
}
