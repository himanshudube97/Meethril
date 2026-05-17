// src/app/api/letters/drafts/[id]/route.ts
//
// Per-draft routes: GET (hydrate on resume), PUT (autosave update), DELETE
// (discard). All require the caller to own the draft. Sealed letters cannot
// be edited through these routes — only unsealed Letter rows count as drafts.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface UpdateDraftBody {
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

async function ownedDraft(userId: string, id: string) {
  return prisma.letter.findFirst({
    where: { id, userId, isSealed: false, isArchived: false },
    select: { id: true },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const draft = await prisma.letter.findFirst({
    where: { id, userId: user.id, isSealed: false, isArchived: false },
    select: {
      id: true,
      letterType: true,
      contentCiphertext: true,
      contentIVs: true,
      recipientEmail: true,
      recipientName: true,
      letterLocation: true,
      draftSong: true,
      draftSongIV: true,
      draftPhotos: true,
      draftDoodles: true,
      draftStyle: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    ...draft,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await ownedDraft(user.id, id)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let body: UpdateDraftBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  // Partial update — only set keys that are present in the body. `undefined`
  // means "leave as-is"; explicit `null` means "clear it." JSON columns use
  // `Prisma.DbNull` for SQL NULL because Prisma treats `null` in JSON columns
  // as the JSON literal `null` by default.
  const data: Prisma.LetterUpdateInput = {}
  if (body.letterType !== undefined) {
    data.letterType = body.letterType === 'friend' ? 'friend' : 'self'
  }
  if (body.contentCiphertext !== undefined) data.contentCiphertext = body.contentCiphertext
  if (body.contentIVs !== undefined) {
    data.contentIVs = (body.contentIVs ?? Prisma.DbNull) as Prisma.InputJsonValue
  }
  if (body.recipientEmail !== undefined) data.recipientEmail = body.recipientEmail
  if (body.recipientName !== undefined) data.recipientName = body.recipientName
  if (body.letterLocation !== undefined) data.letterLocation = body.letterLocation
  if (body.draftSong !== undefined) data.draftSong = body.draftSong
  if (body.draftSongIV !== undefined) data.draftSongIV = body.draftSongIV
  if (body.draftPhotos !== undefined) {
    data.draftPhotos = (body.draftPhotos ?? Prisma.DbNull) as Prisma.InputJsonValue
  }
  if (body.draftDoodles !== undefined) {
    data.draftDoodles = (body.draftDoodles ?? Prisma.DbNull) as Prisma.InputJsonValue
  }
  if (body.draftStyle !== undefined) {
    data.draftStyle = (body.draftStyle ?? Prisma.DbNull) as Prisma.InputJsonValue
  }

  await prisma.letter.update({ where: { id }, data })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await ownedDraft(user.id, id)
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  await prisma.letter.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
