import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  validateMessageContent,
  encryptServerTier,
} from '@/lib/stranger-notes'
import { moderateText } from '@/lib/moderation'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: {
    content?: unknown
    country?: unknown
    state?: unknown
    encryptionTier?: unknown
    ciphertext?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (thread.status === 'closed_unwaved' || thread.status === 'unmatched') {
    return NextResponse.json({ error: 'This thread is not open for replies.' }, { status: 400 })
  }

  const country = typeof body.country === 'string' && body.country.length > 0 ? body.country : null
  const stateName = typeof body.state === 'string' && body.state.length > 0 ? body.state : null

  const tier = body.encryptionTier === 'thread' ? 'thread' : 'server'

  let storedContent: string

  if (tier === 'server') {
    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
    }
    const validation = validateMessageContent(body.content)
    if (!validation.ok) {
      const map = {
        empty: 'Write something first.',
        too_short: 'A little longer — at least 10 characters.',
        too_long: 'A little shorter — at most 200 characters.',
      } as const
      return NextResponse.json({ error: map[validation.error] }, { status: 400 })
    }
    const moderation = await moderateText(validation.trimmed)
    if (moderation.rejected) {
      return NextResponse.json(
        { error: 'This note can\'t be sent. Try writing it with more warmth.' },
        { status: 400 }
      )
    }
    storedContent = encryptServerTier(validation.trimmed)
  } else {
    // Thread-tier: client has already encrypted under the thread key.
    if (typeof body.ciphertext !== 'string' || body.ciphertext.length < 4) {
      return NextResponse.json({ error: 'ciphertext required for thread tier' }, { status: 400 })
    }
    if (thread.status !== 'pen_pal') {
      return NextResponse.json({ error: 'Thread tier only valid for pen-pal threads' }, { status: 400 })
    }
    const myWrappedKey =
      thread.senderId === user.id ? thread.wrappedKeyForSender : thread.wrappedKeyForRecipient
    if (!myWrappedKey) {
      return NextResponse.json({ error: 'Key exchange not complete' }, { status: 400 })
    }
    storedContent = body.ciphertext
  }

  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.strangerMessage.create({
      data: {
        threadId: id,
        senderId: user.id,
        content: storedContent,
        encryptionTier: tier,
        countryCode: country,
        stateName,
      },
    })
    await tx.strangerThread.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    })
    return m
  })

  return NextResponse.json({ messageId: message.id }, { status: 201 })
}
