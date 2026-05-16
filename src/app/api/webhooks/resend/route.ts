// src/app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyResendSignature } from '@/lib/letters/resend-webhook'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })

  const svixId = request.headers.get('svix-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? ''
  const rawBody = await request.text()

  if (!verifyResendSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { email_id?: string; reason?: string } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const emailId = event.data?.email_id
  if (!emailId) {
    return NextResponse.json({ ignored: true })
  }

  const delivery = await prisma.letterDelivery.findFirst({
    where: { resendEmailId: emailId },
    select: { id: true, letterId: true },
  })
  if (!delivery) return NextResponse.json({ ignored: 'unknown email id' })

  switch (event.type) {
    case 'email.sent':
    case 'email.delivered':
      await prisma.letter.update({
        where: { id: delivery.letterId },
        data: { isDelivered: true, deliveredAt: new Date() },
      })
      break
    case 'email.bounced':
      await prisma.letter.update({
        where: { id: delivery.letterId },
        data: { bouncedAt: new Date(), bouncedReason: event.data?.reason ?? 'bounced' },
      })
      break
    default:
      // ignore opened/clicked/etc.
      break
  }

  return NextResponse.json({ ok: true })
}
