// src/app/api/letters/self/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isAdminEmail } from '@/lib/auth/admin'
import { checkQuota, quotaExceededResponse } from '@/lib/billing/quota'

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
  // Minimum lead time: 7 days for everyone, ~1 minute for admins (ADMIN_EMAILS)
  // so operators can smoke-test delivery without waiting a week. No upper bound
  // for self-letters. The matching admin-only 5-min pill lives in SealModal.
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const minLeadMs = isAdminEmail(user.email) ? 60_000 : sevenDaysMs
  if (scheduledFor.getTime() < Date.now() + minLeadMs - 60_000) {
    return NextResponse.json(
      { error: isAdminEmail(user.email) ? 'scheduledFor too soon' : 'scheduledFor too soon (min 1 week)' },
      { status: 400 },
    )
  }

  // Monthly quota for sealed self-letters (free: 2/mo; paid: 10/mo). Promoting
  // a draft seals it, so it counts the same as a fresh sealed letter.
  const tz = request.headers.get('x-user-tz') ?? 'UTC'
  const quota = await checkQuota(user.id, 'letterSelf', tz)
  if (!quota.allowed) return quotaExceededResponse(quota)

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
