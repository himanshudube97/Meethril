import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { verifyDodoWebhookSignature, createPortalSession } from '@/lib/dodo'
import { sendPaymentFailedEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

/**
 * Dodo Payments webhook (Standard Webhooks envelope).
 *
 * Correctness guarantees (per Dodo docs):
 *  - Events may be DUPLICATED (retries up to 8×) → we dedupe on the unique
 *    `webhook-id` header via the ProcessedWebhook table.
 *  - Events may arrive OUT OF ORDER, but each payload always carries the
 *    LATEST subscription state at delivery time → we write `data.status` and
 *    `next_billing_date` straight from the payload for every subscription.*
 *    event, so last-write converges to truth regardless of order. We do NOT
 *    branch the state write on event type.
 */
interface DodoWebhookEnvelope {
  type: string // e.g. 'subscription.active', 'subscription.renewed'
  timestamp?: string
  data: {
    payload_type?: string
    subscription_id?: string
    customer?: { customer_id?: string; email?: string; name?: string }
    product_id?: string
    status?: string // active | on_hold | cancelled | expired | pending
    next_billing_date?: string | null
    cancelled_at?: string | null
    metadata?: Record<string, string>
    [key: string]: unknown
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const webhookId = request.headers.get('webhook-id')
  const webhookTimestamp = request.headers.get('webhook-timestamp')
  const webhookSignature = request.headers.get('webhook-signature')

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  const isValid = verifyDodoWebhookSignature(
    webhookId,
    webhookTimestamp,
    rawBody,
    webhookSignature,
    process.env.DODO_WEBHOOK_SECRET!,
  )
  if (!isValid) {
    console.error('Invalid Dodo webhook signature', { webhookId })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let payload: DodoWebhookEnvelope
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Idempotency: claim this webhook-id. A duplicate delivery hits the unique
  // PK and we short-circuit without touching subscription state. Returning 200
  // stops Dodo's retries.
  try {
    await prisma.processedWebhook.create({
      data: { id: webhookId, eventType: payload.type },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ received: true, duplicate: true })
    }
    throw err
  }

  console.log(`Dodo webhook: ${payload.type} (webhook-id: ${webhookId})`)

  try {
    if (payload.type.startsWith('subscription.')) {
      if (payload.type === 'subscription.failed') {
        // Mandate setup failed before activation — nothing to entitle. Log only.
        console.warn('Dodo subscription.failed:', payload.data.subscription_id)
      } else {
        await applySubscriptionState(payload)
      }
    }
    // payment.* and any other events: already recorded as processed; no state change.

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Dodo webhook handler error:', error)
    // Roll back the idempotency claim so Dodo's retry can reprocess this event
    // rather than it being silently swallowed as "already processed".
    await prisma.processedWebhook.delete({ where: { id: webhookId } }).catch(() => {})
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

/**
 * Write the latest subscription state from the payload. Order-independent:
 * every subscription.* lifecycle event (active/updated/renewed/plan_changed/
 * on_hold/cancelled/expired) flows through here and writes whatever Dodo says
 * is current at delivery time.
 */
async function applySubscriptionState(payload: DodoWebhookEnvelope) {
  const { data } = payload
  const subscriptionId = data.subscription_id
  if (!subscriptionId) {
    console.warn('Dodo webhook missing subscription_id:', payload.type)
    return
  }

  // Resolve the Hearth user: metadata.user_id (stuffed at checkout) → email → existing link.
  const userId = data.metadata?.user_id
  const email = data.customer?.email
  // Select the fields the dunning path needs (prior status to detect the
  // failure transition, email to notify, customer id for the portal link).
  const userSelect = { id: true, email: true, subscriptionStatus: true, dodoCustomerId: true } as const
  const user =
    (userId ? await prisma.user.findUnique({ where: { id: userId }, select: userSelect }) : null) ??
    (email ? await prisma.user.findUnique({ where: { email }, select: userSelect }) : null) ??
    (await prisma.user.findFirst({ where: { dodoSubscriptionId: subscriptionId }, select: userSelect }))

  if (!user) {
    console.warn(`No Hearth user found for Dodo subscription ${subscriptionId}`)
    return
  }

  const status = data.status ?? (payload.type === 'subscription.active' ? 'active' : undefined)
  const nextBilling = data.next_billing_date ? new Date(data.next_billing_date) : undefined

  await prisma.user.update({
    where: { id: user.id },
    data: {
      dodoSubscriptionId: subscriptionId,
      ...(data.customer?.customer_id && { dodoCustomerId: data.customer.customer_id }),
      ...(data.product_id && { dodoProductId: data.product_id }),
      ...(status && { subscriptionStatus: status }),
      // currentPeriodEnd = raw next_billing_date. Only overwrite when the payload
      // carries one (e.g. cancelled/expired payloads may omit it — keep the prior
      // value so "premium until X" can still render through the paid period).
      ...(nextBilling && { currentPeriodEnd: nextBilling }),
    },
  })

  console.log(`Dodo ${payload.type}: user ${user.id} → status=${status ?? '(unchanged)'}`)

  // Dunning: a renewal just FAILED — status flipped INTO on_hold from something
  // else. Send one "update your card" email per failure episode. Gating on the
  // stored prior status (not the event type) makes this idempotent on top of the
  // webhook ledger: once the row is on_hold, a duplicate on_hold/updated event
  // won't re-fire. Best-effort — never let a mail failure fail the webhook.
  if (status === 'on_hold' && user.subscriptionStatus !== 'on_hold') {
    await sendDunningEmail(
      user.email,
      data.customer?.customer_id ?? user.dodoCustomerId,
    ).catch((err) => console.error('Dunning email failed:', err))
  }
}

// GRACE window in lib/billing/is-paid-user.ts (4 days). Keep these in sync so
// the email promises the same access window the entitlement check honours.
const GRACE_DAYS = 4

/**
 * Send the failed-payment dunning email. Resolves a fresh Dodo customer-portal
 * link (direct "update card" screen) when we have a customer id; falls back to
 * the in-app pricing page otherwise.
 */
async function sendDunningEmail(to: string, customerId: string | null) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hearth.app'
  let manageUrl = `${appUrl}/pricing`
  if (customerId) {
    try {
      manageUrl = await createPortalSession(customerId)
    } catch (err) {
      console.warn('Portal link unavailable for dunning email, using app URL:', err)
    }
  }
  await sendPaymentFailedEmail({ to, manageUrl, graceDays: GRACE_DAYS })
}
