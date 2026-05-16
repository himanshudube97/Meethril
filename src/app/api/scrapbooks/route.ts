// src/app/api/scrapbooks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { ScrapbookItem } from '@/lib/scrapbook'
import { makeDateItem } from '@/lib/scrapbook'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.scrapbook.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, items: true, e2eeIVs: true, createdAt: true, updatedAt: true },
  })

  // All scrapbooks are E2EE — title and items are ciphertext.
  // Return them as-is; the client decrypts. Title is null until the client
  // decrypts and reveals it, so the card falls back to its date label.
  const list = rows.map((row) => ({
    id: row.id,
    title: null, // ciphertext is meaningless here; client decrypts on the board page
    e2eeIVs: row.e2eeIVs,
    itemCount: null, // can't count items without decrypting
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))

  return NextResponse.json(list)
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = req.headers.get('content-length') === '0' || req.headers.get('content-type') === null
    ? {}
    : await req.json().catch(() => ({}))

  const { e2eeIVs } = body as { e2eeIVs?: unknown }

  const initialItems: ScrapbookItem[] = [makeDateItem(new Date(), [])]

  const created = await prisma.scrapbook.create({
    data: {
      userId: user.id,
      title: null,
      // Store initial items as plain JSON for now; the client will immediately
      // PUT with encrypted items once it has the master key.
      items: JSON.stringify(initialItems),
      e2eeIVs: e2eeIVs ?? undefined,
    },
  })

  return NextResponse.json({
    id: created.id,
    title: null,
    items: initialItems,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  })
}
