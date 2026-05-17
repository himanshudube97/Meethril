import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listLettersForRead } from '@/lib/letters/dual-read'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const letters = await listLettersForRead({
      userId: user.id,
      where: {
        entryType: 'letter',
        isReceivedLetter: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (letters.length === 0) {
      return NextResponse.json({ letters: [] })
    }

    // Photos/doodles/song are bundled inside contentCiphertext for native
    // letters; the client decrypts the bundle if it wants to render those
    // extras. We no longer look them up from journal_entries — letters live
    // only in the letters table.
    const now = new Date()
    const lettersWithStatus = letters.map((letter) => ({
      id: letter.id,
      text: letter.text,
      createdAt: letter.createdAt.toISOString(),
      unlockDate: letter.unlockDate?.toISOString() || null,
      isSealed: letter.isSealed,
      letterLocation: letter.letterLocation,
      senderName: letter.senderName,
      originalSenderId: letter.originalSenderId,
      isViewed: letter.isViewed,
      isDelivered: letter.isDelivered,
      deliveredAt: letter.deliveredAt?.toISOString() || null,
      e2eeIVs: letter.e2eeIVs,
      hasArrived: letter.unlockDate ? letter.unlockDate <= now : true,
    }))

    return NextResponse.json({ letters: lettersWithStatus })
  } catch (error) {
    console.error('Failed to fetch received letters:', error)
    return NextResponse.json({ error: 'Failed to fetch received letters' }, { status: 500 })
  }
}
