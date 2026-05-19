import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const partnerId = thread.senderId === user.id ? thread.recipientId : thread.senderId
  if (!partnerId) {
    return NextResponse.json({ error: 'No partner to block on this thread yet' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    // Idempotent: skip if already blocked.
    await tx.strangerBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: partnerId } },
      create: { blockerId: user.id, blockedId: partnerId },
      update: {},
    })

    // Hard-delete THIS thread.
    await tx.strangerThread.delete({ where: { id } })

    // Cascade-close any other threads between these two users (rare but per spec).
    await tx.strangerThread.deleteMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: partnerId },
          { senderId: partnerId, recipientId: user.id },
        ],
      },
    })
  })

  return NextResponse.json({ success: true })
}
