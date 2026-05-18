// src/app/api/letters/self/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  contentCiphertext: string
  contentIVs: { content: string }
  scheduledFor: string
  letterLocation?: string | null
  // If the compose flow had a draft Letter row (from /api/letters/drafts),
  // pass its id so we promote that row in-place instead of creating a new
  // Letter. The draft scratch fields (draftSong/draftPhotos/draftDoodles/...)
  // are nulled — the sealed content lives bundled in contentCiphertext.
  draftLetterId?: string | null
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
  // TEST-PILL: minimum lead time relaxed to ~1 hour so SealModal's 1h test
  // pill works end-to-end on staging. Tighten back to 7 days
  //   const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  //   if (scheduledFor.getTime() < Date.now() + sevenDaysMs - 60_000) ...
  // before a real public launch. Grep for TEST-PILL to find every spot.
  // No upper bound for self-letters.
  const oneHourMs = 60 * 60 * 1000
  if (scheduledFor.getTime() < Date.now() + oneHourMs - 60_000) {
    return NextResponse.json({ error: 'scheduledFor too soon (min 1 hour)' }, { status: 400 })
  }

  let letter: { id: string; scheduledFor: Date | null; createdAt: Date }

  if (body.draftLetterId) {
    // Promote an existing draft Letter to sealed in place. The draft scratch
    // columns are cleared — sealed self-letters carry the full bundle inside
    // contentCiphertext, so the per-field draftSong/draftPhotos/draftDoodles
    // would just be stale duplicates.
    const existing = await prisma.letter.findFirst({
      where: { id: body.draftLetterId, userId: user.id, isSealed: false, isArchived: false },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'draft not found' }, { status: 404 })
    }
    letter = await prisma.letter.update({
      where: { id: body.draftLetterId },
      data: {
        letterType: 'self',
        contentCiphertext: body.contentCiphertext,
        contentIVs: body.contentIVs as Prisma.InputJsonValue,
        scheduledFor,
        letterLocation: body.letterLocation ?? null,
        isSealed: true,
        draftSong: null,
        draftSongIV: null,
        draftPhotos: Prisma.DbNull,
        draftDoodles: Prisma.DbNull,
        draftStyle: Prisma.DbNull,
      },
      select: { id: true, scheduledFor: true, createdAt: true },
    })
  } else {
    // No draft id — create a brand new sealed letter. Kept for compose flows
    // that bypass the draft autosave entirely.
    letter = await prisma.letter.create({
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
  }

  return NextResponse.json({ letter })
}
