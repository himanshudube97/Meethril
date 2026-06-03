import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { planFromProductId } from '@/lib/dodo'
import { isPaidUser } from '@/lib/billing/is-paid-user'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        subscriptionStatus: true,
        dodoProductId: true,
        currentPeriodEnd: true,
        complimentaryAccess: true,
      },
    })

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const premium = isPaidUser(dbUser)
    const plan = planFromProductId(dbUser.dodoProductId)

    return NextResponse.json({
      isPremium: premium,
      // Complimentary (friends & family) access: premium with no Dodo plan.
      complimentary: dbUser.complimentaryAccess,
      plan,
      status: dbUser.complimentaryAccess ? 'complimentary' : dbUser.subscriptionStatus,
      currentPeriodEnd: dbUser.currentPeriodEnd,
    })
  } catch (error) {
    console.error('Subscription status error:', error)
    return NextResponse.json(
      { error: 'Failed to get subscription status' },
      { status: 500 },
    )
  }
}
