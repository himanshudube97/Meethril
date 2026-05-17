import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listLettersForRead } from '@/lib/letters/dual-read'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()

    const letters = await listLettersForRead({
      userId: user.id,
      where: {
        entryType: 'letter',
        isSealed: true,
        recipientEmail: null,
        unlockDate: { lte: now },
      },
      orderBy: { unlockDate: 'asc' },
    })

    if (letters.length === 0) {
      return NextResponse.json({ letters: [], count: 0 })
    }

    // Photos/doodles/song are bundled inside contentCiphertext for native
    // letters; the client decrypts the bundle if it wants to render those
    // extras. We no longer look them up from journal_entries — letters live
    // only in the letters table.
    const decryptedLetters = letters.map((letter) => ({
      id: letter.id,
      text: letter.text,
      createdAt: letter.createdAt,
      unlockDate: letter.unlockDate,
      letterLocation: letter.letterLocation,
      isDelivered: letter.isDelivered,
      e2eeIVs: letter.e2eeIVs,
    }))

    return NextResponse.json({
      letters: decryptedLetters,
      count: decryptedLetters.length,
    })
  } catch (error) {
    console.error('Error fetching arrived letters:', error)
    return NextResponse.json(
      { error: 'Failed to fetch arrived letters' },
      { status: 500 }
    )
  }
}
