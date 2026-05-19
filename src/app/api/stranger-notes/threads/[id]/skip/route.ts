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

  // Skip = UI dismiss only. Does NOT affect matching. Partner is not notified.
  const isSender = thread.senderId === user.id
  await prisma.strangerThread.update({
    where: { id },
    data: isSender ? { senderDismissedAt: new Date() } : { recipientDismissedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
