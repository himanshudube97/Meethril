import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  // Pull stranger-note E2EE keys alongside the base user payload so the
  // client can lazily initialize its keypair when entering a pen-pal thread.
  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      strangerPublicKey: true,
      strangerWrappedPrivateKey: true,
    },
  })

  return NextResponse.json({
    user,
    strangerPublicKey: full?.strangerPublicKey ?? null,
    strangerWrappedPrivateKey: full?.strangerWrappedPrivateKey ?? null,
  })
}
