import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createCheckoutUrl } from '@/lib/dodo'
import { isAdminEmail } from '@/lib/auth/admin'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const priceId = body.priceId as string

    if (priceId !== 'monthly' && priceId !== 'yearly' && priceId !== 'test') {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 })
    }

    // The $1 'test' product is an operator-only affordance for smoke-testing the
    // live payment pipeline. Gate it server-side so a tampered client can't
    // reach it. (monthly/yearly stay open to everyone.)
    if (priceId === 'test' && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }

    const checkoutUrl = await createCheckoutUrl(
      priceId,
      user.id,
      user.email,
      user.name || undefined,
    )

    if (!checkoutUrl) {
      return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutUrl })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 },
    )
  }
}
