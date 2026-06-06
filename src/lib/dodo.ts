import DodoPayments from 'dodopayments'
import crypto from 'crypto'

// Initialize the Dodo client once and reuse it.
let _client: DodoPayments | null = null
export function getDodoClient(): DodoPayments {
  if (_client) return _client
  _client = new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: process.env.DODO_ENVIRONMENT === 'live_mode' ? 'live_mode' : 'test_mode',
  })
  return _client
}

// Product IDs for each plan (set in .env from the Dodo dashboard).
// `test` is a $1/month product used to smoke-test the live payment pipeline
// (checkout → webhook → DB). Only admins (ADMIN_EMAILS) can check it out — the
// gate lives in /api/checkout. Optional: unset in envs that don't need it.
export const DODO_PRODUCTS = {
  monthly: process.env.DODO_PRODUCT_MONTHLY!,
  yearly: process.env.DODO_PRODUCT_YEARLY!,
  test: process.env.DODO_PRODUCT_TEST ?? '',
}

export type DodoPlan = 'monthly' | 'yearly' | 'test'

// Reverse map: product ID → plan name. Used by /api/subscription/status.
export function planFromProductId(productId: string | null): DodoPlan | null {
  if (!productId) return null
  if (productId === DODO_PRODUCTS.monthly) return 'monthly'
  if (productId === DODO_PRODUCTS.yearly) return 'yearly'
  if (DODO_PRODUCTS.test && productId === DODO_PRODUCTS.test) return 'test'
  return null
}

/**
 * Create a hosted checkout session for a subscription. The user_id is stuffed
 * into metadata so the webhook can match the event back to our DB even before
 * the customer record is linked.
 */
export async function createCheckoutUrl(
  plan: DodoPlan,
  userId: string,
  userEmail: string,
  userName?: string,
): Promise<string> {
  const productId = DODO_PRODUCTS[plan]
  if (!productId) throw new Error(`No Dodo product configured for plan: ${plan}`)

  const client = getDodoClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3111'

  const session = await client.checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    customer: { email: userEmail, name: userName || userEmail.split('@')[0] },
    return_url: `${appUrl}/pricing?success=true`,
    metadata: { user_id: userId },
  })

  return session.checkout_url ?? ''
}

/**
 * Create a customer portal session so the user can manage their subscription
 * (update card, cancel, view invoices).
 */
export async function createPortalSession(customerId: string): Promise<string> {
  const client = getDodoClient()
  const session = await client.customers.customerPortal.create(customerId)
  return session.link
}

/**
 * Verify a Dodo webhook signature (Standard Webhooks spec).
 * Signed content = "${webhook-id}.${webhook-timestamp}.${body}".
 * Secret format: "whsec_<base64>" — base64-decode the portion after the prefix.
 * The signature header may carry multiple space-separated "v1,<base64sig>" pairs
 * (key rotation); any match passes.
 */
export function verifyDodoWebhookSignature(
  webhookId: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const secretKey = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const signedContent = `${webhookId}.${timestamp}.${body}`
    const expectedSig = crypto.createHmac('sha256', secretKey).update(signedContent).digest('base64')

    const expectedBuf = Buffer.from(expectedSig, 'base64')
    const sigs = signatureHeader.split(' ').map((s) => s.replace(/^v1,/, ''))

    return sigs.some((sig) => {
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length !== expectedBuf.length) return false
      return crypto.timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}
