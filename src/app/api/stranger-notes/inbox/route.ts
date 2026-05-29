// src/app/api/stranger-notes/inbox/route.ts
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
  messageCount: number
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

type Filter = 'all' | 'penpals' | 'strangers' | 'sent'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const filter = (params.get('filter') ?? 'all') as Filter
  const cursor = params.get('cursor')
  const limit = Math.min(Math.max(Number(params.get('limit')) || 30, 1), 50)

  // status slice per filter
  const statusWhere =
    filter === 'penpals'
      ? { status: 'pen_pal' as const }
      : filter === 'strangers'
      ? { status: 'active' as const }
      : filter === 'sent'
      ? { status: 'unmatched' as const, senderId: user.id }
      : { status: { in: ['unmatched', 'active', 'pen_pal'] } }

  const rows = await prisma.strangerThread.findMany({
    where: {
      AND: [
        {
          OR: [
            { senderId: user.id, senderDismissedAt: null },
            { recipientId: user.id, recipientDismissedAt: null },
          ],
        },
        statusWhere,
      ],
    },
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      waves: { where: { userId: user.id }, take: 1 },
    },
  })

  const ids = rows.map((r) => r.id)

  // Per-thread per-sender counts (wave eligibility + "N letters deep").
  const userMessageCounts = ids.length
    ? await prisma.strangerMessage.groupBy({
        by: ['threadId', 'senderId'],
        where: { threadId: { in: ids } },
        _count: { _all: true },
      })
    : []

  const countsByThread = new Map<string, { sender: number; recipient: number }>()
  for (const row of userMessageCounts) {
    const parent = rows.find((r) => r.id === row.threadId)
    if (!parent) continue
    const t = countsByThread.get(row.threadId) ?? { sender: 0, recipient: 0 }
    if (row.senderId === parent.senderId) t.sender = row._count._all
    if (row.senderId === parent.recipientId) t.recipient = row._count._all
    countsByThread.set(row.threadId, t)
  }

  // Batch unread counts for this page only.
  const lastViewedByThread = new Map<string, Date | null>()
  for (const r of rows) {
    lastViewedByThread.set(
      r.id,
      r.senderId === user.id ? r.senderLastViewedAt : r.recipientLastViewedAt,
    )
  }
  const incomingMessages = ids.length
    ? await prisma.strangerMessage.findMany({
        where: { threadId: { in: ids }, senderId: { not: user.id } },
        select: { threadId: true, createdAt: true },
      })
    : []
  const unreadByThread = new Map<string, number>()
  for (const m of incomingMessages) {
    const lvAt = lastViewedByThread.get(m.threadId) ?? null
    if (lvAt && m.createdAt <= lvAt) continue
    unreadByThread.set(m.threadId, (unreadByThread.get(m.threadId) ?? 0) + 1)
  }

  const threads: InboxThread[] = rows.map((t) => {
    const isSender = t.senderId === user.id
    const c = countsByThread.get(t.id) ?? { sender: 0, recipient: 0 }
    const lastMsg = t.messages[0] ?? null
    return {
      id: t.id,
      status: t.status as InboxThread['status'],
      partnerDisplayName: isSender
        ? (t.recipientDisplayName ?? 'A wandering light')
        : t.senderDisplayName,
      myDisplayName: isSender ? t.senderDisplayName : (t.recipientDisplayName ?? '—'),
      lastActivityAt: t.lastActivityAt.toISOString(),
      messageCount: c.sender + c.recipient,
      unreadCount: unreadByThread.get(t.id) ?? 0,
      waveEligible:
        t.status === 'active' &&
        c.sender >= WAVE_ELIGIBLE_PER_SIDE &&
        c.recipient >= WAVE_ELIGIBLE_PER_SIDE,
      waveOfferedToMe: Boolean(isSender ? t.senderWaveOfferedAt : t.recipientWaveOfferedAt),
      myWaveCast: t.waves.length > 0,
      pendingKeyExchange: t.pendingKeyExchange,
      myWrappedKey: isSender ? t.wrappedKeyForSender : t.wrappedKeyForRecipient,
      preview: lastMsg
        ? {
            isMine: lastMsg.senderId === user.id,
            encryptionTier: (lastMsg.encryptionTier as 'server' | 'thread') ?? 'server',
            body:
              lastMsg.encryptionTier === 'thread'
                ? lastMsg.content
                : decryptServerTier(lastMsg.content).slice(0, 80),
          }
        : null,
    }
  })

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null

  return NextResponse.json({ threads, nextCursor })
}
