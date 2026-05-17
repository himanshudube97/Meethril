// src/app/api/letters/drafts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { listLettersForRead } from '@/lib/letters/dual-read'

export const dynamic = 'force-dynamic'

interface DraftStamp {
  id: string
  entryType: 'letter' | 'unsent_letter'
  recipientName: string | null
  recipientEmail: string | null
  text: string
  e2eeIV: string | null
  e2eeIVs: Prisma.JsonValue | null
  isSealed: boolean
  createdAt: string
  updatedAt: string
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const letters = await listLettersForRead({
    userId: user.id,
    where: {
      isSealed: false,
      entryType: { in: ['letter', 'unsent_letter'] },
      isArchived: false,
    },
    orderBy: { updatedAt: 'desc' },
  })

  const result: DraftStamp[] = letters.map((l) => ({
    id: l.id,
    entryType: l.entryType as 'letter' | 'unsent_letter', // safe: where-clause filters to these two values
    recipientName: l.recipientName,
    recipientEmail: l.recipientEmail,
    text: l.text,
    e2eeIV: l.e2eeIV,
    e2eeIVs: l.e2eeIVs,
    isSealed: l.isSealed,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  return NextResponse.json({ drafts: result })
}

// POST — create a new letter draft. Called by compose autosave on first
// keystroke. Returns the new Letter id so the client can PUT updates to
// /api/letters/drafts/[id] for subsequent autosave ticks. Letters live ONLY
// in the `letters` table now — journal_entries is journal-only.
interface CreateDraftBody {
  letterType?: 'self' | 'friend'
  contentCiphertext?: string | null
  contentIVs?: { content?: string }
  recipientEmail?: string | null
  recipientName?: string | null
  letterLocation?: string | null
  draftSong?: string | null
  draftSongIV?: string | null
  draftPhotos?: unknown
  draftDoodles?: unknown
  draftStyle?: unknown
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: CreateDraftBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // letterType defaults to 'self' for new drafts — compose flips to 'friend'
  // by PATCHing the draft once a recipient email is entered.
  const letterType = body.letterType === 'friend' ? 'friend' : 'self'

  const letter = await prisma.letter.create({
    data: {
      userId: user.id,
      letterType,
      contentCiphertext: body.contentCiphertext ?? null,
      contentIVs: (body.contentIVs ?? undefined) as Prisma.InputJsonValue | undefined,
      recipientEmail: body.recipientEmail ?? null,
      recipientName: body.recipientName ?? null,
      letterLocation: body.letterLocation ?? null,
      isSealed: false,
      draftSong: body.draftSong ?? null,
      draftSongIV: body.draftSongIV ?? null,
      draftPhotos: (body.draftPhotos ?? undefined) as Prisma.InputJsonValue | undefined,
      draftDoodles: (body.draftDoodles ?? undefined) as Prisma.InputJsonValue | undefined,
      draftStyle: (body.draftStyle ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true, createdAt: true, updatedAt: true },
  })

  return NextResponse.json(
    {
      id: letter.id,
      createdAt: letter.createdAt.toISOString(),
      updatedAt: letter.updatedAt.toISOString(),
    },
    { status: 201 },
  )
}
