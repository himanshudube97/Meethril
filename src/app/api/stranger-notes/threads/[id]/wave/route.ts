import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Body intentionally empty — the act of POSTing is the Yes. There is no "Not now" endpoint;
  // not waving is just not calling this.
  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.strangerThread.findUnique({
      where: { id },
      include: { waves: true },
    })
    if (!thread) return { status: 404 as const, body: { error: 'Not found' } }
    if (thread.senderId !== user.id && thread.recipientId !== user.id) {
      return { status: 404 as const, body: { error: 'Not found' } }
    }
    if (thread.status !== 'active') {
      return { status: 400 as const, body: { error: 'Wave only valid on active threads' } }
    }

    // Upsert this user's wave row (idempotent).
    await tx.strangerWave.upsert({
      where: { threadId_userId: { threadId: id, userId: user.id } },
      create: { threadId: id, userId: user.id },
      update: {},
    })

    // Re-read wave count
    const waveCount = await tx.strangerWave.count({ where: { threadId: id } })

    if (waveCount >= 2) {
      // Mutual wave: flip to pen_pal + flag key exchange needed.
      await tx.strangerThread.update({
        where: { id },
        data: {
          status: 'pen_pal',
          pendingKeyExchange: true,
          lastActivityAt: new Date(),
        },
      })
      return { status: 200 as const, body: { waveCount, status: 'pen_pal' as const } }
    }

    return { status: 200 as const, body: { waveCount, status: 'active' as const } }
  })

  return NextResponse.json(result.body, { status: result.status })
}
