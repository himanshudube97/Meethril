import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { decryptServerTier, WAVE_ELIGIBLE_PER_SIDE } from '@/lib/stranger-notes'

interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull every thread this user is in (sender OR recipient), excluding dismissed.
  const rows = await prisma.strangerThread.findMany({
    where: {
      OR: [
        { senderId: user.id, senderDismissedAt: null },
        { recipientId: user.id, recipientDismissedAt: null },
      ],
      status: { in: ['unmatched', 'active', 'pen_pal'] },
    },
    orderBy: { lastActivityAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      waves: { where: { userId: user.id }, take: 1 },
    },
  })

  // Per-thread per-sender message counts, for wave eligibility.
  const userMessageCounts = await prisma.strangerMessage.groupBy({
    by: ['threadId', 'senderId'],
    where: { threadId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  })

  const countsByThread = new Map<string, { sender: number; recipient: number }>()
  for (const row of userMessageCounts) {
    const parent = rows.find((r) => r.id === row.threadId)
    if (!parent) continue
    const t = countsByThread.get(row.threadId) ?? { sender: 0, recipient: 0 }
    if (row.senderId === parent.senderId) t.sender = row._count._all
    if (row.senderId === parent.recipientId) t.recipient = row._count._all
    countsByThread.set(row.threadId, t)
  }

  // Batch unread counts in a single query instead of one COUNT per thread.
  // Pull every message sent by the other party across all the user's threads,
  // then tally per-thread in memory using each thread's own lastViewedAt.
  const lastViewedByThread = new Map<string, Date | null>()
  for (const r of rows) {
    lastViewedByThread.set(
      r.id,
      r.senderId === user.id ? r.senderLastViewedAt : r.recipientLastViewedAt,
    )
  }
  const incomingMessages = await prisma.strangerMessage.findMany({
    where: {
      threadId: { in: rows.map((r) => r.id) },
      senderId: { not: user.id },
    },
    select: { threadId: true, createdAt: true },
  })
  const unreadByThread = new Map<string, number>()
  for (const m of incomingMessages) {
    const lvAt = lastViewedByThread.get(m.threadId) ?? null
    if (lvAt && m.createdAt <= lvAt) continue
    unreadByThread.set(m.threadId, (unreadByThread.get(m.threadId) ?? 0) + 1)
  }

  const outgoing: InboxThread[] = []
  const active: InboxThread[] = []
  const penpals: InboxThread[] = []

  for (const t of rows) {
    const isSender = t.senderId === user.id
    const partnerDisplayName = isSender
      ? (t.recipientDisplayName ?? 'A wandering light')
      : t.senderDisplayName
    const myDisplayName = isSender ? t.senderDisplayName : (t.recipientDisplayName ?? '—')
    const unreadCount = unreadByThread.get(t.id) ?? 0

    const c = countsByThread.get(t.id) ?? { sender: 0, recipient: 0 }
    const waveEligible =
      t.status === 'active' &&
      c.sender >= WAVE_ELIGIBLE_PER_SIDE &&
      c.recipient >= WAVE_ELIGIBLE_PER_SIDE
    const waveOfferedToMe = Boolean(isSender ? t.senderWaveOfferedAt : t.recipientWaveOfferedAt)
    const myWaveCast = t.waves.length > 0

    const myWrappedKey = isSender ? t.wrappedKeyForSender : t.wrappedKeyForRecipient

    const lastMsg = t.messages[0] ?? null
    const preview = lastMsg
      ? {
          isMine: lastMsg.senderId === user.id,
          encryptionTier: (lastMsg.encryptionTier as 'server' | 'thread') ?? 'server',
          body:
            lastMsg.encryptionTier === 'thread'
              ? lastMsg.content // ciphertext — client decrypts
              : decryptServerTier(lastMsg.content).slice(0, 80),
        }
      : null

    const inboxThread: InboxThread = {
      id: t.id,
      status: t.status as InboxThread['status'],
      partnerDisplayName,
      myDisplayName,
      lastActivityAt: t.lastActivityAt.toISOString(),
      unreadCount,
      waveEligible,
      waveOfferedToMe,
      myWaveCast,
      pendingKeyExchange: t.pendingKeyExchange,
      myWrappedKey,
      preview,
    }

    if (t.status === 'unmatched' && isSender) outgoing.push(inboxThread)
    else if (t.status === 'pen_pal') penpals.push(inboxThread)
    else active.push(inboxThread)
  }

  return NextResponse.json({
    outgoing,
    active,
    penpals,
    counters: {
      sent: rows.filter((r) => r.senderId === user.id).length,
      received: rows.filter((r) => r.recipientId === user.id).length,
    },
  })
}
