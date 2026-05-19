import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Only expose the public key if there's a pen_pal thread between me and this user.
  // Prevents enumeration of arbitrary public keys.
  const thread = await prisma.strangerThread.findFirst({
    where: {
      status: 'pen_pal',
      OR: [
        { senderId: me.id, recipientId: id },
        { senderId: id, recipientId: me.id },
      ],
    },
    select: { id: true },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const partner = await prisma.user.findUnique({
    where: { id },
    select: { strangerPublicKey: true },
  })
  if (!partner?.strangerPublicKey) {
    return NextResponse.json({ error: 'Partner has no key' }, { status: 404 })
  }

  return NextResponse.json({ publicKey: partner.strangerPublicKey })
}
