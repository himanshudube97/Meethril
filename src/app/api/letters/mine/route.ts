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
        isReceivedLetter: false,
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
      recipientEmail: letter.recipientEmail,
      recipientName: letter.recipientName,
      isViewed: letter.isViewed,
      e2eeIVs: letter.e2eeIVs,
      hasArrived: letter.unlockDate && letter.unlockDate <= now && !letter.recipientEmail,
    }))

    return NextResponse.json({ letters: lettersWithStatus })
  } catch (error) {
    console.error('Failed to fetch letters:', error)
    return NextResponse.json({ error: 'Failed to fetch letters' }, { status: 500 })
  }
}
