# Dodo Payments Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lemon Squeezy with Dodo Payments as Hearth's payment provider, gaining native UPI support, Merchant-of-Record tax handling (VAT/GST/sales tax in 150+ jurisdictions), and Indian-customer compatibility without requiring a registered company.

**Architecture:** Direct provider swap — Dodo replaces Lemon Squeezy at every integration point (lib, webhook handler, checkout, billing portal, status endpoint). DB schema changes are **additive only** per CLAUDE.md (new `dodo*` fields alongside existing `lemonSqueezy*` fields; old fields dropped in a follow-up migration once Dodo is verified). No provider-agnostic abstraction layer — Hearth has no paying users yet and YAGNI says don't pre-build for hypothetical multi-provider support.

**Testing approach:** Per project convention (CLAUDE.md user feedback), no formal unit tests. Each task ends with a typecheck (`/typecheck`) and, where relevant, a manual smoke verification in dev mode against the Dodo sandbox.

**Tech Stack:**
- `dodopayments` Node SDK (replaces `@lemonsqueezy/lemonsqueezy.js`)
- Inline HMAC-SHA256 webhook verification (Standard Webhooks spec — matches the inline pattern already used for Lemon Squeezy)
- Prisma additive migration (`prisma migrate dev`)
- ngrok (or equivalent) to tunnel localhost for webhook delivery in dev

---

## Phase 0: Prerequisites (manual setup before any code)

These are dashboard and tooling steps — the executor does them once before touching code.

### Step P0.1: Create Dodo account and switch to test mode
- [ ] Sign up at https://dodopayments.com
- [ ] In the dashboard, switch the environment toggle to **Test mode** (top of dashboard)

### Step P0.2: Create the two subscription products in Dodo dashboard
- [ ] Create Product 1:
  - Name: `Hearth Premium — Monthly`
  - Type: Subscription
  - Recurring interval: Monthly
  - Price: match current Lemon Squeezy monthly price (check `/pricing` page or LS dashboard for current value)
- [ ] Create Product 2:
  - Name: `Hearth Premium — Yearly`
  - Type: Subscription
  - Recurring interval: Yearly
  - Price: match current Lemon Squeezy yearly price
- [ ] Copy each product's `product_id` (format `pdt_...`) — paste into a scratch note. We'll plug these into `.env` later.

### Step P0.3: Get API credentials
- [ ] In Dodo dashboard → Settings → API Keys → create a Test mode API key. Copy the bearer token.
- [ ] In Dodo dashboard → Settings → Webhooks → click "Add endpoint":
  - URL: **leave blank for now** — we'll fill it in after starting ngrok in P0.5
  - Subscribe to events: `subscription.active`, `subscription.updated`, `subscription.renewed`, `subscription.on_hold`, `subscription.plan_changed`, `subscription.cancelled`, `subscription.expired`, `subscription.failed`
- [ ] After saving, copy the **webhook signing secret** (starts with `whsec_`).

### Step P0.4: Start the dev stack
- [ ] Confirm Hearth is running: `docker compose ps` shows `app` healthy on port 3111
- [ ] If not running: `docker compose up -d`

### Step P0.5: Expose localhost via ngrok for webhook delivery
- [ ] Install ngrok if not already (`brew install ngrok` or download from ngrok.com)
- [ ] In a separate terminal: `ngrok http 3111`
- [ ] Copy the `https://*.ngrok-free.app` forwarding URL
- [ ] Back in Dodo dashboard → Webhooks → edit the endpoint → set URL to `https://<your-ngrok>.ngrok-free.app/api/webhooks/dodo` and save
- [ ] Keep the ngrok tunnel open in its own terminal for the duration of this plan

---

## Phase 1: Code implementation

### Task 1: Add Dodo fields to User model (additive migration)

**Files:**
- Modify: `prisma/schema.prisma:35-40`

- [ ] **Step 1.1: Add three new fields to the User model**

Edit `prisma/schema.prisma`, replacing the current Lemon Squeezy block (lines 35-40) with:

```prisma
  // Lemon Squeezy subscription fields (DEPRECATED — kept until follow-up cleanup migration)
  lemonSqueezyCustomerId String?   @unique
  subscriptionId         String?   @unique // legacy: stored LS sub IDs
  subscriptionStatus     String? // "active", "cancelled", "past_due", "on_trial", "paused", "expired" — provider-agnostic, reused for Dodo
  variantId              String? // legacy: stored LS variant IDs
  currentPeriodEnd       DateTime? // provider-agnostic, reused for Dodo

  // Dodo Payments subscription fields
  dodoCustomerId     String? @unique // Dodo customer ID (cus_...)
  dodoSubscriptionId String? @unique // Dodo subscription ID (sub_...)
  dodoProductId      String? // Dodo product ID (pdt_...) — identifies monthly vs yearly plan
```

`subscriptionStatus` and `currentPeriodEnd` are intentionally re-used because their meaning is provider-agnostic. The comment above each LS-specific field marks it deprecated.

- [ ] **Step 1.2: Create the migration**

Run inside the container:

```bash
docker compose exec app npx prisma migrate dev --name add_dodo_payment_fields
```

Expected: Prisma generates a new migration file under `prisma/migrations/<timestamp>_add_dodo_payment_fields/migration.sql` containing only `ALTER TABLE "users" ADD COLUMN ...` statements (three columns + their unique indexes). **Zero `DROP` or `ALTER COLUMN` statements** — pure additive.

- [ ] **Step 1.3: Verify migration is additive**

```bash
cat prisma/migrations/*_add_dodo_payment_fields/migration.sql
```

Expected output contains only:
- `ALTER TABLE "users" ADD COLUMN "dodoCustomerId" TEXT;`
- `ALTER TABLE "users" ADD COLUMN "dodoSubscriptionId" TEXT;`
- `ALTER TABLE "users" ADD COLUMN "dodoProductId" TEXT;`
- `CREATE UNIQUE INDEX ... ON "users"("dodoCustomerId");`
- `CREATE UNIQUE INDEX ... ON "users"("dodoSubscriptionId");`

If you see `DROP COLUMN` or `ALTER COLUMN ... NOT NULL` on existing data, **stop** — revert and investigate. CLAUDE.md forbids destructive migrations.

- [ ] **Step 1.4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(payments): add Dodo Payments fields to User model"
```

---

### Task 2: Install the Dodo Payments SDK

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 2.1: Install the SDK inside the container**

```bash
docker compose exec app npm install dodopayments
```

Per CLAUDE.md, npm is the source of truth. Do **not** use pnpm/yarn.

- [ ] **Step 2.2: Verify installation**

```bash
docker compose exec app node -e "console.log(require('dodopayments').default ? 'ok' : 'missing')"
```

Expected: prints `ok` (the SDK exposes a default export class).

- [ ] **Step 2.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(payments): install dodopayments SDK"
```

---

### Task 3: Create the Dodo library helper

**Files:**
- Create: `src/lib/dodo.ts`

- [ ] **Step 3.1: Write `src/lib/dodo.ts`**

Create the file with the following contents:

```typescript
import DodoPayments from 'dodopayments'
import crypto from 'crypto'

// Initialize Dodo client. Reuses the same env-key pattern as Lemon Squeezy.
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
export const DODO_PRODUCTS = {
  monthly: process.env.DODO_PRODUCT_MONTHLY!,
  yearly: process.env.DODO_PRODUCT_YEARLY!,
}

// Reverse map: product ID → plan name. Used by /api/subscription/status.
export function getPlanFromProductId(productId: string | null): 'monthly' | 'yearly' | null {
  if (!productId) return null
  if (productId === DODO_PRODUCTS.monthly) return 'monthly'
  if (productId === DODO_PRODUCTS.yearly) return 'yearly'
  return null
}

/**
 * Create a hosted checkout session for a subscription.
 * The user_id is stuffed into metadata so the webhook can match the event back to our DB.
 */
export async function createCheckoutUrl(
  plan: 'monthly' | 'yearly',
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

  return session.checkout_url
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
 * Same shape as the Lemon Squeezy `isPremium` helper — provider-agnostic
 * because it reads `subscriptionStatus` + `currentPeriodEnd`, which we keep
 * reusing across providers.
 */
export function isPremium(
  subscriptionStatus: string | null,
  currentPeriodEnd: Date | null,
): boolean {
  if (!subscriptionStatus || !currentPeriodEnd) return false
  const activeStatuses = ['active', 'on_trial']
  return (
    activeStatuses.includes(subscriptionStatus) &&
    new Date(currentPeriodEnd) > new Date()
  )
}

/**
 * Verify a Dodo webhook signature using the Standard Webhooks spec.
 * Signed content = "${webhook-id}.${webhook-timestamp}.${body}".
 * Secret format: "whsec_<base64>" — base64-decode the portion after the prefix.
 * Signature header may contain multiple space-separated "v1,<base64sig>" pairs (key rotation).
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
    const expectedSig = crypto
      .createHmac('sha256', secretKey)
      .update(signedContent)
      .digest('base64')

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
```

- [ ] **Step 3.2: Typecheck**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: zero errors. (If the SDK's exported types don't match `checkoutSessions.create` or `customers.customerPortal.create` exactly, fix the call signatures to match the SDK — check `node_modules/dodopayments/dist/index.d.ts` if needed.)

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/dodo.ts
git commit -m "feat(payments): add Dodo Payments library helper"
```

---

### Task 4: Update environment variables

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local, gitignored — also update with actual sandbox values)

- [ ] **Step 4.1: Append Dodo variables to `.env.example`**

Replace the existing `# Payments` block (lines 18-23) of `.env.example` with:

```bash
# Payments — Lemon Squeezy (DEPRECATED, scheduled for removal after Dodo verified)
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_VARIANT_MONTHLY=
LEMONSQUEEZY_VARIANT_YEARLY=
LEMONSQUEEZY_WEBHOOK_SECRET=

# Payments — Dodo Payments
DODO_API_KEY=                              # Bearer token from Dodo dashboard → API Keys
DODO_ENVIRONMENT=test_mode                 # 'test_mode' (dev) or 'live_mode' (prod)
DODO_PRODUCT_MONTHLY=                      # Product ID (pdt_...) for monthly plan
DODO_PRODUCT_YEARLY=                       # Product ID (pdt_...) for yearly plan
DODO_WEBHOOK_SECRET=                       # Webhook signing secret (whsec_...)
```

- [ ] **Step 4.2: Add the same variables to your local `.env`**

In your **local `.env`** (gitignored), paste the actual Dodo sandbox values you collected in Phase 0:

```bash
DODO_API_KEY=<your test-mode bearer token>
DODO_ENVIRONMENT=test_mode
DODO_PRODUCT_MONTHLY=<pdt_... from P0.2>
DODO_PRODUCT_YEARLY=<pdt_... from P0.2>
DODO_WEBHOOK_SECRET=<whsec_... from P0.3>
```

- [ ] **Step 4.3: Restart the app to pick up new env vars**

```bash
docker compose restart app
```

- [ ] **Step 4.4: Verify env vars are loaded**

```bash
docker compose exec app node -e "console.log({
  api: !!process.env.DODO_API_KEY,
  monthly: !!process.env.DODO_PRODUCT_MONTHLY,
  yearly: !!process.env.DODO_PRODUCT_YEARLY,
  secret: !!process.env.DODO_WEBHOOK_SECRET
})"
```

Expected: all four print `true`.

- [ ] **Step 4.5: Commit**

```bash
git add .env.example
git commit -m "feat(payments): add Dodo env vars to .env.example"
```

(Note: `.env` is gitignored — do not commit it.)

---

### Task 5: Create the Dodo webhook route

**Files:**
- Create: `src/app/api/webhooks/dodo/route.ts`

- [ ] **Step 5.1: Write the webhook handler**

Create `src/app/api/webhooks/dodo/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyDodoWebhookSignature } from '@/lib/dodo'

/**
 * Dodo Payments webhook payload shape (Standard Webhooks envelope).
 * The `data` block's exact fields vary by event type; we extract only what we need.
 */
interface DodoWebhookEnvelope {
  business_id: string
  type: string // e.g. 'subscription.active', 'subscription.renewed'
  timestamp: string
  data: {
    payload_type: 'Subscription' | 'Payment' | 'Refund' | 'Dispute' | 'LicenseKey'
    subscription_id?: string
    customer?: { customer_id?: string; email?: string; name?: string }
    product_id?: string
    status?: string
    next_billing_date?: string | null
    cancelled_at?: string | null
    metadata?: Record<string, string>
    // Other fields exist; we narrow on demand.
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

  console.log(`Received Dodo webhook: ${payload.type} (webhook-id: ${webhookId})`)

  try {
    switch (payload.type) {
      case 'subscription.active':
      case 'subscription.updated':
      case 'subscription.renewed':
      case 'subscription.plan_changed':
        await handleSubscriptionUpsert(payload)
        break

      case 'subscription.on_hold':
        await handleSubscriptionStatus(payload, 'past_due')
        break

      case 'subscription.cancelled':
        await handleSubscriptionStatus(payload, 'cancelled')
        break

      case 'subscription.expired':
        await handleSubscriptionStatus(payload, 'expired')
        break

      case 'subscription.failed':
        // Mandate setup failed before the subscription became active — log only.
        console.warn('Dodo subscription.failed:', payload.data.subscription_id)
        break

      default:
        console.log(`Unhandled Dodo event: ${payload.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Dodo webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

/**
 * Upsert path: active / updated / renewed / plan_changed all converge here.
 * Idempotent — we always write the latest fields from the payload.
 */
async function handleSubscriptionUpsert(payload: DodoWebhookEnvelope) {
  const { data } = payload
  const subscriptionId = data.subscription_id
  if (!subscriptionId) {
    console.warn('Dodo webhook missing subscription_id:', payload.type)
    return
  }

  const userId = data.metadata?.user_id
  const email = data.customer?.email
  const customerId = data.customer?.customer_id
  const productId = data.product_id
  const status = data.status || 'active'
  const periodEnd = data.next_billing_date ? new Date(data.next_billing_date) : null

  // Resolve user: prefer metadata.user_id (stuffed at checkout), fall back to email match.
  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!user && email) {
    user = await prisma.user.findUnique({ where: { email } })
  }
  if (!user) {
    user = await prisma.user.findFirst({ where: { dodoSubscriptionId: subscriptionId } })
  }
  if (!user) {
    console.warn(`No Hearth user found for Dodo subscription ${subscriptionId}`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      dodoCustomerId: customerId ?? user.dodoCustomerId,
      dodoSubscriptionId: subscriptionId,
      dodoProductId: productId ?? user.dodoProductId,
      subscriptionStatus: status,
      currentPeriodEnd: periodEnd,
    },
  })

  console.log(`Dodo ${payload.type}: user ${user.id} → status=${status}`)
}

/**
 * Lifecycle-end path: on_hold / cancelled / expired set a terminal-ish status.
 */
async function handleSubscriptionStatus(payload: DodoWebhookEnvelope, status: string) {
  const subscriptionId = payload.data.subscription_id
  if (!subscriptionId) {
    console.warn(`Dodo ${payload.type} missing subscription_id`)
    return
  }

  const user = await prisma.user.findFirst({ where: { dodoSubscriptionId: subscriptionId } })
  if (!user) {
    console.warn(`No Hearth user for Dodo subscription ${subscriptionId} (${payload.type})`)
    return
  }

  const cancelledAt = payload.data.cancelled_at
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: status,
      // For cancellations, keep currentPeriodEnd as-is so /api/subscription/status
      // can still report "premium until X" through the end of the paid period.
      // For expired, the period is over — null it out so isPremium() returns false.
      ...(status === 'expired' && { currentPeriodEnd: null }),
      ...(cancelledAt && status === 'cancelled' && { currentPeriodEnd: new Date(cancelledAt) }),
    },
  })

  console.log(`Dodo ${payload.type}: user ${user.id} → status=${status}`)
}
```

- [ ] **Step 5.2: Typecheck**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5.3: Smoke test the route exists (without valid signature, should 400)**

```bash
curl -i -X POST http://localhost:3111/api/webhooks/dodo \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: HTTP 400 with `{"error":"Missing webhook headers"}`. This confirms the route is reachable and middleware-allowed.

If you get a 307/302 redirect to `/login`, the middleware is gating the route — move to Task 6 immediately and come back.

- [ ] **Step 5.4: Commit**

```bash
git add src/app/api/webhooks/dodo/route.ts
git commit -m "feat(payments): add Dodo webhook handler"
```

---

### Task 6: Add Dodo webhook to public middleware allowlist

**Files:**
- Modify: `src/middleware.ts:7-17`

- [ ] **Step 6.1: Add the route to PUBLIC_PATHS**

The current `PUBLIC_PATHS` array (lines 7-17) already includes `/api/webhooks` as a prefix, which would cover the Dodo route. But the LS-specific entry on line 13 (`/api/webhooks/lemonsqueezy`) is explicit for clarity. Add a matching explicit entry for Dodo.

In `src/middleware.ts`, change:

```typescript
  '/api/webhooks',
  '/api/webhooks/lemonsqueezy',
  '/api/letter',
```

to:

```typescript
  '/api/webhooks',
  '/api/webhooks/lemonsqueezy',
  '/api/webhooks/dodo',
  '/api/letter',
```

- [ ] **Step 6.2: Re-run the smoke test from Step 5.3**

```bash
curl -i -X POST http://localhost:3111/api/webhooks/dodo \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: still HTTP 400 with `{"error":"Missing webhook headers"}` (not a 401/redirect).

- [ ] **Step 6.3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(payments): allow Dodo webhook route through middleware"
```

---

### Task 7: Swap the checkout route to use Dodo

**Files:**
- Modify: `src/app/api/checkout/route.ts` (full rewrite)

- [ ] **Step 7.1: Rewrite `src/app/api/checkout/route.ts`**

Replace the entire file contents with:

```typescript
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
      return NextResponse.json(
        { error: 'Failed to create checkout' },
        { status: 500 },
      )
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
```

The public contract of the endpoint (`POST` body `{ priceId: 'monthly' | 'yearly' }` → response `{ url }`) is unchanged, so the frontend `useSubscription` hook needs no edits.

- [ ] **Step 7.2: Typecheck**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7.3: Manual smoke test in browser**

1. Open http://localhost:3111/pricing in a logged-in browser session
2. Click the **Monthly** plan button
3. Expected: redirect to `https://test.checkout.dodopayments.com/session/...` (the hosted Dodo checkout page)
4. Open another tab and check Docker logs: `docker compose logs -f app | grep -i checkout`
5. You should see no error logs; the redirect should happen cleanly

Do not complete a test payment yet — that's Task 10 (full E2E).

- [ ] **Step 7.4: Commit**

```bash
git add src/app/api/checkout/route.ts
git commit -m "feat(payments): swap /api/checkout to Dodo Payments"
```

---

### Task 8: Swap the billing portal route to use Dodo

**Files:**
- Modify: `src/app/api/billing-portal/route.ts` (full rewrite)

- [ ] **Step 8.1: Rewrite `src/app/api/billing-portal/route.ts`**

Replace the entire file contents with:

```typescript
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
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 },
      )
    }

    const portalUrl = await createPortalSession(dbUser.dodoCustomerId)

    if (!portalUrl) {
      return NextResponse.json(
        { error: 'Customer portal not available' },
        { status: 400 },
      )
    }

    return NextResponse.json({ url: portalUrl })
  } catch (error) {
    console.error('Billing portal error:', error)
    return NextResponse.json(
      { error: 'Failed to get billing portal' },
      { status: 500 },
    )
  }
}
```

Cleaner than the LS version — no live subscription fetch needed; Dodo's portal endpoint just takes a customer ID directly.

- [ ] **Step 8.2: Typecheck**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8.3: Commit**

```bash
git add src/app/api/billing-portal/route.ts
git commit -m "feat(payments): swap /api/billing-portal to Dodo Payments"
```

(Smoke test deferred to Task 10 — requires an active subscription, which we'll create end-to-end then.)

---

### Task 9: Update the subscription status route to read Dodo fields

**Files:**
- Modify: `src/app/api/subscription/status/route.ts` (full rewrite)

- [ ] **Step 9.1: Rewrite `src/app/api/subscription/status/route.ts`**

Replace the entire file contents with:

```typescript
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isPremium, getPlanFromProductId } from '@/lib/dodo'

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
      },
    })

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const premium = isPremium(dbUser.subscriptionStatus, dbUser.currentPeriodEnd)
    const plan = getPlanFromProductId(dbUser.dodoProductId)

    return NextResponse.json({
      isPremium: premium,
      plan,
      status: dbUser.subscriptionStatus,
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
```

Response shape (`{ isPremium, plan, status, currentPeriodEnd }`) is byte-for-byte identical to the LS version, so the frontend `useSubscription` hook and `/pricing` page need no edits.

- [ ] **Step 9.2: Typecheck**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9.3: Smoke test the endpoint**

```bash
# Get a valid auth cookie from your browser dev tools (Application → Cookies → hearth-auth-token)
curl -i http://localhost:3111/api/subscription/status \
  -H "Cookie: hearth-auth-token=<your-cookie>"
```

Expected: HTTP 200 with `{"isPremium":false,"plan":null,"status":null,"currentPeriodEnd":null}` (assuming you don't have an active sub yet).

- [ ] **Step 9.4: Commit**

```bash
git add src/app/api/subscription/status/route.ts
git commit -m "feat(payments): swap /api/subscription/status to read Dodo fields"
```

---

## Phase 2: End-to-end verification

### Task 10: Full sandbox E2E smoke test

This is the gating verification. Everything below must pass before we consider the migration done.

**Files:** none (manual test in dev mode)

- [ ] **Step 10.1: Confirm prerequisites are still live**
  - ngrok tunnel is running (terminal from P0.5)
  - Dodo dashboard webhook endpoint points to `<ngrok-url>/api/webhooks/dodo` and is enabled
  - `docker compose ps` shows `app` healthy
  - You're logged into Hearth in your browser

- [ ] **Step 10.2: Tail logs in one terminal**

```bash
docker compose logs -f app
```

Keep this visible — every webhook delivery prints `Received Dodo webhook: ...`.

- [ ] **Step 10.3: Open the checkout flow**
  - Browser → http://localhost:3111/pricing
  - Click **Monthly**
  - Confirm redirect to `test.checkout.dodopayments.com/session/...`

- [ ] **Step 10.4: Complete a test payment**

Use Dodo's test card values (from their docs):
  - Card number: `4242 4242 4242 4242` (or whatever Dodo's test docs specify)
  - Expiry: any future date
  - CVC: any 3 digits
  - For UPI: their docs list a sandbox UPI ID like `success@dodo` — use it

Submit the payment.

- [ ] **Step 10.5: Verify webhook delivery and DB write**

In the logs terminal, you should see (in order):

```
Received Dodo webhook: subscription.active (webhook-id: ...)
Dodo subscription.active: user <your-user-id> → status=active
```

If you see "No Hearth user found for Dodo subscription ..." — the metadata.user_id resolution failed. Check the webhook payload to see what came through, and verify the checkout request included `metadata: { user_id }`.

- [ ] **Step 10.6: Verify DB state**

```bash
docker compose exec app npx prisma studio
```

In the browser at :5555, open the User table, find your row, confirm:
  - `dodoCustomerId` is populated (`cus_...`)
  - `dodoSubscriptionId` is populated (`sub_...`)
  - `dodoProductId` matches the monthly product ID from `.env`
  - `subscriptionStatus` = `active`
  - `currentPeriodEnd` is ~1 month from now

- [ ] **Step 10.7: Verify the post-checkout return**
  - You should be back on http://localhost:3111/pricing?success=true
  - The page should now render "You're on Premium (Monthly)" (driven by `useSubscription` → `/api/subscription/status` → DB)

- [ ] **Step 10.8: Test the billing portal**
  - From the pricing page (or wherever the "Manage subscription" UI lives), click the portal button
  - Expected: redirect to `customer.dodopayments.com/...`
  - You should see your active subscription listed

- [ ] **Step 10.9: Test cancellation from the portal**
  - In the Dodo portal, cancel the subscription
  - Back in Hearth logs, expect: `Received Dodo webhook: subscription.cancelled` followed by `Dodo subscription.cancelled: user ... → status=cancelled`
  - Check Prisma Studio: `subscriptionStatus` should now be `cancelled`
  - Reload `/pricing`: should show subscription as ending on `<currentPeriodEnd>` rather than active forever

- [ ] **Step 10.10: Verify isPremium gating still grants access during the paid period**
  - Despite `status=cancelled`, `currentPeriodEnd` is still in the future
  - `isPremium()` returns `true` → user still has premium until period end
  - This matches the Lemon Squeezy behavior

If any of 10.1–10.10 fails, **do not proceed**. Document the failure, debug, fix, and re-run from the point of failure.

- [ ] **Step 10.11: Final commit (if any fixes were applied during E2E)**

```bash
git status
# If clean: nothing to commit. If dirty: commit the fixes.
```

---

## Phase 3: Cleanup (separate follow-up plan, not in this scope)

Once Phase 2 has been green for at least a few days in dev (and after the first live production subscription is verified), a follow-up plan should:

1. Remove `src/lib/lemonsqueezy.ts`
2. Remove `src/app/api/webhooks/lemonsqueezy/route.ts`
3. Remove the `/api/webhooks/lemonsqueezy` line from `src/middleware.ts`
4. Remove `LEMONSQUEEZY_*` env vars from `.env.example` and Vercel
5. Uninstall the SDK: `docker compose exec app npm uninstall @lemonsqueezy/lemonsqueezy.js`
6. Create a separate Prisma migration dropping `lemonSqueezyCustomerId`, `subscriptionId`, `variantId` (subscriptionStatus + currentPeriodEnd stay — they're provider-agnostic)

That cleanup is **not** in this plan because (a) it touches Vercel prod env, (b) it's reversible only via redeploy of an older commit, and (c) we want a quiet observation window first.

---

## Rollback strategy

Because this plan only **adds** code paths and DB columns (the existing LS code is untouched in `src/lib/lemonsqueezy.ts`, `src/app/api/webhooks/lemonsqueezy/route.ts`), rollback is:

1. Revert the three routes (`/api/checkout`, `/api/billing-portal`, `/api/subscription/status`) to their LS versions — `git revert` the three commits.
2. The Dodo lib, webhook handler, and DB columns can stay (dormant, unused).

No DB rollback needed — additive columns are harmless when unused.
