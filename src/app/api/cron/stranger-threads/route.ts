import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickRandomRecipient, deliverThreadToRecipient } from '@/lib/stranger-matcher'
import { generateDisplayName } from '@/lib/stranger-names'
import {
  UNMATCHED_LIFETIME_MS,
  ACTIVE_SILENCE_LIFETIME_MS,
  UNWAVED_VANISH_LIFETIME_MS,
  WAVE_DECISION_WINDOW_MS,
} from '@/lib/stranger-notes'
import { checkCronAuth } from '@/lib/cron-auth'

export async function POST(req: NextRequest) {
  const unauthorized = checkCronAuth(req)
  if (unauthorized) return unauthorized

  const now = new Date()
  const summary = { matched: 0, closedUnwaved: 0, deleted: 0 }

  // ── Step 1: Retry matching for unmatched threads ────────────────────────────
  const unmatched = await prisma.strangerThread.findMany({
    where: { status: 'unmatched', matchedAt: null },
    select: { id: true, senderId: true },
    take: 100, // batch
  })
  for (const t of unmatched) {
    const recipientId = await pickRandomRecipient(t.senderId)
    if (!recipientId) continue
    const displayName = generateDisplayName(`${t.id}:recipient`)
    const ok = await deliverThreadToRecipient(t.id, recipientId, displayName)
    if (ok) summary.matched++
  }

  // ── Step 2: Close wave-window threads that didn't reach mutual wave ─────────
  const waveWindowDeadline = new Date(now.getTime() - WAVE_DECISION_WINDOW_MS)
  const toClose = await prisma.strangerThread.findMany({
    where: {
      status: 'active',
      senderWaveOfferedAt: { not: null, lte: waveWindowDeadline },
      recipientWaveOfferedAt: { not: null, lte: waveWindowDeadline },
    },
    select: { id: true, _count: { select: { waves: true } } },
  })
  for (const t of toClose) {
    if (t._count.waves >= 2) continue // already became pen_pal
    await prisma.strangerThread.update({
      where: { id: t.id },
      data: { status: 'closed_unwaved', closedAt: now },
    })
    summary.closedUnwaved++
  }

  // ── Step 3: Cleanup ───────────────────────────────────────────────────────
  // Idempotent. Bounded batch sizes are implicit (DELETE WHERE conditions are precise).
  // We run cleanup on every tick (every 15 min); volume is low enough that this is fine.
  const unmatchedDeadline = new Date(now.getTime() - UNMATCHED_LIFETIME_MS)
  const activeSilenceDeadline = new Date(now.getTime() - ACTIVE_SILENCE_LIFETIME_MS)
  const unwavedVanishDeadline = new Date(now.getTime() - UNWAVED_VANISH_LIFETIME_MS)

  const [d1, d2, d3] = await prisma.$transaction([
    prisma.strangerThread.deleteMany({
      where: { status: 'unmatched', createdAt: { lt: unmatchedDeadline } },
    }),
    prisma.strangerThread.deleteMany({
      where: { status: 'active', lastActivityAt: { lt: activeSilenceDeadline } },
    }),
    prisma.strangerThread.deleteMany({
      where: { status: 'closed_unwaved', closedAt: { lt: unwavedVanishDeadline } },
    }),
  ])
  summary.deleted = d1.count + d2.count + d3.count

  return NextResponse.json({ ok: true, summary })
}

// cron-job.org issues GET requests by default; without this it 405s and the
// job auto-disables. Mirror the GET→POST delegation used by the other cron
// routes (send-reminders, sweep-orphaned-blobs).
export async function GET(req: NextRequest) {
  return POST(req)
}
