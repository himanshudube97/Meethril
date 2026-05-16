import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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

    const journalIds = letters.map((l) => l.id)
    const [photoRows, doodleRows, songRows] = await Promise.all([
      prisma.entryPhoto.findMany({
        where: { entryId: { in: journalIds } },
        select: {
          entryId: true,
          url: true,
          position: true,
          spread: true,
          rotation: true,
        },
      }),
      prisma.doodle.findMany({
        where: { journalEntryId: { in: journalIds } },
        select: {
          journalEntryId: true,
          strokes: true,
          positionInEntry: true,
          spread: true,
        },
      }),
      prisma.journalEntry.findMany({
        where: { id: { in: journalIds } },
        select: { id: true, song: true },
      }),
    ])

    const photosByEntry = new Map<string, Array<{ url: string | null; position: number; spread: number; rotation: number }>>()
    for (const p of photoRows) {
      const list = photosByEntry.get(p.entryId) ?? []
      list.push({ url: p.url, position: p.position, spread: p.spread, rotation: p.rotation })
      photosByEntry.set(p.entryId, list)
    }
    const doodlesByEntry = new Map<string, Array<{ strokes: unknown; positionInEntry: number; spread: number }>>()
    for (const d of doodleRows) {
      const list = doodlesByEntry.get(d.journalEntryId) ?? []
      list.push({ strokes: d.strokes, positionInEntry: d.positionInEntry, spread: d.spread })
      doodlesByEntry.set(d.journalEntryId, list)
    }
    const songByEntry = new Map(songRows.map((s) => [s.id, s.song]))

    const decryptedLetters = letters.map((letter) => ({
      id: letter.id,
      text: letter.text,
      createdAt: letter.createdAt,
      unlockDate: letter.unlockDate,
      letterLocation: letter.letterLocation,
      isDelivered: letter.isDelivered,
      song: songByEntry.get(letter.id) ?? null,
      e2eeIVs: letter.e2eeIVs,
      photos: photosByEntry.get(letter.id) ?? [],
      doodles: doodlesByEntry.get(letter.id) ?? [],
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
