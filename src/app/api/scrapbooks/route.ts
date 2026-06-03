// src/app/api/scrapbooks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { checkQuota, quotaExceededResponse } from '@/lib/billing/quota'

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

  const body =
    req.headers.get('content-length') === '0' || req.headers.get('content-type') === null
      ? {}
      : await req.json().catch(() => ({}))

  const { items, e2eeIVs } = body as { items?: unknown; e2eeIVs?: unknown }

  // All scrapbooks are E2EE. The client must encrypt the initial items with
  // the master key and send ciphertext + IVs, so the row lands on disk in a
  // decryptable state. Creating a row without IVs leaves it permanently
  // unopenable on the board page.
  if (typeof items !== 'string' || !e2eeIVs || typeof e2eeIVs !== 'object') {
    return NextResponse.json(
      { error: 'Scrapbook creation requires encrypted items and e2eeIVs.' },
      { status: 400 },
    )
  }

  // Monthly quota (free: 10/mo; paid: 30/mo).
  const tz = req.headers.get('x-user-tz') ?? 'UTC'
  const quota = await checkQuota(user.id, 'scrapbook', tz)
  if (!quota.allowed) return quotaExceededResponse(quota)

  const created = await prisma.scrapbook.create({
    data: {
      userId: user.id,
      title: null,
      items,
      e2eeIVs: e2eeIVs as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({
    id: created.id,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  })
}
