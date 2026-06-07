import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

const CATEGORIES = ['feedback', 'suggestion', 'issue'] as const
const MAX_LENGTH = 2000

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { category?: unknown; message?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.category !== 'string' || !CATEGORIES.includes(body.category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: 'Pick a category.' }, { status: 400 })
  }

  if (typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message must be a string' }, { status: 400 })
  }
  const message = body.message.trim()
  if (message.length === 0) {
    return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  }
  if (message.length > MAX_LENGTH) {
    return NextResponse.json({ error: `A little shorter — at most ${MAX_LENGTH} characters.` }, { status: 400 })
  }

  try {
    await prisma.feedback.create({
      data: {
        userId: user.id,
        category: body.category,
        message,
      },
    })
  } catch (err) {
    console.error('[feedback] failed to save', err)
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
