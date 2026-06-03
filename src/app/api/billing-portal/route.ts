import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createPortalSession } from '@/lib/dodo'

export async function POST() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { dodoCustomerId: true },
    })

    if (!dbUser?.dodoCustomerId) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
    }

    const portalUrl = await createPortalSession(dbUser.dodoCustomerId)
    if (!portalUrl) {
      return NextResponse.json({ error: 'Customer portal not available' }, { status: 400 })
    }

    return NextResponse.json({ url: portalUrl })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json({ error: 'Failed to get billing portal' }, { status: 500 })
  }
}
