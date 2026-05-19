import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { publicKey?: unknown; wrappedPrivateKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.publicKey !== 'string' || typeof body.wrappedPrivateKey !== 'string') {
    return NextResponse.json({ error: 'publicKey and wrappedPrivateKey required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { strangerPublicKey: true },
  })
  if (existing?.strangerPublicKey) {
    return NextResponse.json({ error: 'Keypair already initialized' }, { status: 409 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      strangerPublicKey: body.publicKey,
      strangerWrappedPrivateKey: body.wrappedPrivateKey,
    },
  })

  return NextResponse.json({ success: true })
}
