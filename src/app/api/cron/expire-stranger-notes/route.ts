import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tryDeliverQueued } from '@/lib/stranger-matcher'
import { NOTE_LIFETIME_MS, REPLY_LIFETIME_MS } from '@/lib/stranger-notes'

export async function GET(request: NextRequest) {
  // Cron auth — same Bearer-CRON_SECRET pattern as the other cron routes.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const noteCutoff = new Date(now.getTime() - NOTE_LIFETIME_MS)
  const replyCutoff = new Date(now.getTime() - REPLY_LIFETIME_MS)

  // 1) Hard-delete delivered/replied notes whose 24h is up.
  const deletedNotes = await prisma.strangerNote.deleteMany({
    where: {
      status: { in: ['delivered', 'replied'] },
      matchedAt: { lt: noteCutoff },
    },
  })

  // 2) Hard-delete replies older than 24h (independent — a reply may outlive
  // its parent note if the recipient burned it; here we ensure the reply also
  // dies on schedule).
  const deletedReplies = await prisma.strangerReply.deleteMany({
    where: { createdAt: { lt: replyCutoff } },
  })

  // 3) Retry queued notes — try to match them now.
  const queued = await prisma.strangerNote.findMany({
    where: { status: 'queued' },
    select: { id: true, senderId: true },
    take: 100,
    orderBy: { createdAt: 'asc' },
  })

  let matched = 0
  for (const note of queued) {
    const ok = await tryDeliverQueued(note.id, note.senderId)
    if (ok) matched += 1
  }

  return NextResponse.json({
    deletedNotes: deletedNotes.count,
    deletedReplies: deletedReplies.count,
    queuedScanned: queued.length,
    matched,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
