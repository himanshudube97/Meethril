// src/app/api/letters/[id]/read/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findLetterForRead } from '@/lib/letters/dual-read'

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const letter = await findLetterForRead({ id, userId: user.id })
  if (!letter) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const result = await prisma.journalEntry.updateMany({
    where: { id, userId: user.id, isViewed: false },
    data: { isViewed: true },
  })

  return NextResponse.json({ ok: true, updated: result.count })
}
