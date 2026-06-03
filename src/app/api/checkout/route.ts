import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createCheckoutUrl } from '@/lib/dodo'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const priceId = body.priceId as string

    if (priceId !== 'monthly' && priceId !== 'yearly') {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 })
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
