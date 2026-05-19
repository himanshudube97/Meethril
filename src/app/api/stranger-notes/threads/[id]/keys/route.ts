import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { wrappedKeyForSender?: unknown; wrappedKeyForRecipient?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.wrappedKeyForSender !== 'string' || typeof body.wrappedKeyForRecipient !== 'string') {
    return NextResponse.json({ error: 'Both wrapped keys required' }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.strangerThread.findUnique({ where: { id } })
    if (!thread) return { status: 404 as const, body: { error: 'Not found' } }
    if (thread.senderId !== user.id && thread.recipientId !== user.id) {
      return { status: 404 as const, body: { error: 'Not found' } }
    }
    if (thread.status !== 'pen_pal' || !thread.pendingKeyExchange) {
      return { status: 409 as const, body: { error: 'Keys already exchanged or not pending' } }
    }
    await tx.strangerThread.update({
      where: { id },
      data: {
        wrappedKeyForSender: body.wrappedKeyForSender as string,
        wrappedKeyForRecipient: body.wrappedKeyForRecipient as string,
        pendingKeyExchange: false,
      },
    })
    return { status: 200 as const, body: { success: true } }
  })

  return NextResponse.json(result.body, { status: result.status })
}
