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

  const isSender = thread.senderId === user.id
  const alreadyOffered = isSender ? thread.senderWaveOfferedAt : thread.recipientWaveOfferedAt
  if (alreadyOffered) return NextResponse.json({ success: true, idempotent: true })

  await prisma.strangerThread.update({
    where: { id },
    data: isSender ? { senderWaveOfferedAt: new Date() } : { recipientWaveOfferedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
