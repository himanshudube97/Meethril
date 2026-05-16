import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
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

    const journalIds = letters.map((l) => l.id)
    const [photoRows, doodleRows, songRows] = await Promise.all([
      prisma.entryPhoto.findMany({
        where: { entryId: { in: journalIds } },
        select: { entryId: true, url: true, position: true, spread: true, rotation: true },
      }),
      prisma.doodle.findMany({
        where: { journalEntryId: { in: journalIds } },
        select: { journalEntryId: true, strokes: true, positionInEntry: true, spread: true },
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
      song: songByEntry.get(letter.id) ?? null,
      photos: photosByEntry.get(letter.id) ?? [],
      doodles: doodlesByEntry.get(letter.id) ?? [],
      hasArrived: letter.unlockDate ? letter.unlockDate <= now : true,
    }))

    return NextResponse.json({ letters: lettersWithStatus })
  } catch (error) {
    console.error('Failed to fetch received letters:', error)
    return NextResponse.json({ error: 'Failed to fetch received letters' }, { status: 500 })
  }
}
