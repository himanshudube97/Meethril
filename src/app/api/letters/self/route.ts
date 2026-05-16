// src/app/api/letters/self/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  contentCiphertext: string
  contentIVs: { content: string }
  scheduledFor: string
  letterLocation?: string | null
  // If the compose flow had a draft JournalEntry, pass its id here so
  // the server can delete it after the Letter is written. Optional —
  // the caller may have already deleted it.
  draftEntryId?: string | null
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.contentCiphertext || !body.contentIVs?.content) {
    return NextResponse.json({ error: 'missing ciphertext' }, { status: 400 })
  }
  if (!body.scheduledFor) {
    return NextResponse.json({ error: 'missing scheduledFor' }, { status: 400 })
  }
  const scheduledFor = new Date(body.scheduledFor)
  if (Number.isNaN(scheduledFor.valueOf())) {
    return NextResponse.json({ error: 'bad scheduledFor' }, { status: 400 })
  }
  // PRELAUNCH-TEST-PILLS: minimum lead time is 1 minute so SealModal's 5m
  // and 1h test pills work for self-letters too. Tighten back to 7 days
  //   const minSec = 7 * 24 * 60 * 60
  //   if (scheduledFor.getTime() < Date.now() + minSec * 1000 - 60_000) ...
  // before public launch. Grep for "PRELAUNCH-TEST-PILLS" to find every spot.
  // No upper bound for self-letters.
  if (scheduledFor.getTime() < Date.now() + 60_000 - 5_000) {
    return NextResponse.json({ error: 'scheduledFor too soon (min ~1 minute)' }, { status: 400 })
  }

  const letter = await prisma.letter.create({
    data: {
      userId: user.id,
      letterType: 'self',
      contentCiphertext: body.contentCiphertext,
      contentIVs: body.contentIVs,
      scheduledFor,
      letterLocation: body.letterLocation ?? null,
      isSealed: true,
    },
    select: { id: true, scheduledFor: true, createdAt: true },
  })

  // Clean up the draft JournalEntry if the caller provided one and it
  // belongs to this user. Best-effort — we don't fail the write if the
  // delete throws.
  if (body.draftEntryId) {
    await prisma.journalEntry
      .deleteMany({ where: { id: body.draftEntryId, userId: user.id } })
      .catch(() => {})
  }

  return NextResponse.json({ letter })
}
