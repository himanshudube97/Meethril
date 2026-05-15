// src/app/api/letters/drafts/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { safeDecrypt } from '@/lib/encryption'
import { listLettersForRead } from '@/lib/letters/dual-read'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface DraftStamp {
  id: string
  recipientName: string | null
  recipientEmail: string | null
  text: string
  encryptionType: string
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
    recipientName:
      l.recipientName && l.encryptionType === 'server'
        ? safeDecrypt(l.recipientName)
        : l.recipientName,
    recipientEmail:
      l.recipientEmail && l.encryptionType === 'server'
        ? safeDecrypt(l.recipientEmail)
        : l.recipientEmail,
    text: l.text,
    encryptionType: l.encryptionType,
    e2eeIV: l.e2eeIV,
    e2eeIVs: l.e2eeIVs,
    isSealed: l.isSealed,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }))

  return NextResponse.json({ drafts: result })
}
