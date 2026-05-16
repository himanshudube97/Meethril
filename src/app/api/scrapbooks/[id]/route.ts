import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { ScrapbookItem } from '@/lib/scrapbook'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const row = await prisma.scrapbook.findFirst({
    where: { id, userId: user.id },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // All scrapbooks are E2EE — return ciphertext as-is; client decrypts.
  return NextResponse.json({
    id: row.id,
    title: row.title,
    items: row.items,
    e2eeIVs: row.e2eeIVs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = (await req.json()) as {
    title?: string | null
    // E2EE clients send the already-encrypted ciphertext string; store as-is.
    items?: ScrapbookItem[] | string
    e2eeIVs?: Prisma.InputJsonValue
  }

  const { e2eeIVs } = body

  const data: {
    title?: string | null
    items?: string
    e2eeIVs?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue
  } = {}

  if (body.title !== undefined) {
    // E2EE: title is ciphertext — store as-is.
    data.title = body.title
  }
  if (body.items !== undefined) {
    // E2EE: items is the ciphertext string itself — store as-is. JSON.stringify
    // here would wrap it in literal quote characters, which then break atob()
    // on read.
    data.items = body.items as string
  }
  if (e2eeIVs !== undefined) {
    data.e2eeIVs = e2eeIVs
  }

  const updated = await prisma.scrapbook.updateMany({
    where: { id, userId: user.id },
    data,
  })
  if (updated.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const deleted = await prisma.scrapbook.deleteMany({
    where: { id, userId: user.id },
  })
  if (deleted.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
