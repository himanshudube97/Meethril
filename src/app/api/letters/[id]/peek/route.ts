// src/app/api/letters/[id]/peek/route.ts
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

  const letter = await findLetterForRead({ id, userId: user.id, requireSealed: true })
  if (!letter) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Record the peek. Scope by userId at the DB layer so the predicate is
  // enforced beyond the prior findLetterForRead check — closes the same
  // structural TOCTOU pattern as /viewed.
  if (!letter.letterPeekedAt) {
    await prisma.letter.updateMany({
      where: { id, userId: user.id },
      data: { letterPeekedAt: new Date() },
    })
  }

  // Return ciphertext + IVs so client decrypts with its master key.
  return NextResponse.json({
    body: letter.text,
    e2eeIVs: letter.e2eeIVs,
  })
}
