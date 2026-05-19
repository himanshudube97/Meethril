import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { decryptServerTier, WAVE_ELIGIBLE_PER_SIDE } from '@/lib/stranger-notes'

interface ThreadMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  body: string
  countryCode: string | null
  stateName: string | null
  createdAt: string
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      waves: true,
    },
  })

  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isSender = thread.senderId === user.id
  const partnerDisplayName = isSender
    ? thread.recipientDisplayName ?? 'A wandering light'
    : thread.senderDisplayName
  const myDisplayName = isSender ? thread.senderDisplayName : thread.recipientDisplayName ?? '—'

  const senderMessageCount = thread.messages.filter((m) => m.senderId === thread.senderId).length
  const recipientMessageCount = thread.messages.filter((m) => m.senderId === thread.recipientId).length

  const waveEligible =
    thread.status === 'active' &&
    senderMessageCount >= WAVE_ELIGIBLE_PER_SIDE &&
    recipientMessageCount >= WAVE_ELIGIBLE_PER_SIDE
  const myWaveCast = thread.waves.some((w) => w.userId === user.id)
  const waveOfferedToMe = Boolean(isSender ? thread.senderWaveOfferedAt : thread.recipientWaveOfferedAt)

  const myWrappedKey = isSender ? thread.wrappedKeyForSender : thread.wrappedKeyForRecipient
  const partnerUserId = isSender ? thread.recipientId : thread.senderId

  // Update lastViewedAt for this user (server-side; never exposed to partner).
  await prisma.strangerThread.update({
    where: { id },
    data: isSender
      ? { senderLastViewedAt: new Date() }
      : { recipientLastViewedAt: new Date() },
  })

  const messages: ThreadMessage[] = thread.messages.map((m) => ({
    id: m.id,
    isMine: m.senderId === user.id,
    encryptionTier: (m.encryptionTier as 'server' | 'thread') ?? 'server',
    body:
      m.encryptionTier === 'thread'
        ? m.content // ciphertext — client decrypts
        : decryptServerTier(m.content),
    countryCode: m.countryCode,
    stateName: m.stateName,
    createdAt: m.createdAt.toISOString(),
  }))

  return NextResponse.json({
    id: thread.id,
    status: thread.status,
    partnerDisplayName,
    myDisplayName,
    partnerUserId,
    waveEligible,
    waveOfferedToMe,
    myWaveCast,
    pendingKeyExchange: thread.pendingKeyExchange,
    myWrappedKey,
    partnerWrappedKey: null,
    messages,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Pen-pal end: hard-delete the thread (cascade deletes messages, waves).
  // Only valid if thread is pen_pal and user is a participant.
  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (thread.status !== 'pen_pal') {
    return NextResponse.json({ error: 'Only pen-pal threads can be ended this way' }, { status: 400 })
  }

  await prisma.strangerThread.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
