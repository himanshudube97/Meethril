# Dodo Payments — Setup & Testing Checklist

Status: **code complete, not yet tested against a live Dodo account.**

This is the list of everything that still needs to be done/verified to take the
Dodo billing + usage-limits flow from "implemented" to "trusted in production."
Nothing below has been exercised end-to-end yet.

Design reference: [`docs/superpowers/plans/2026-05-30-platform-limits-and-dodo-billing.md`](./superpowers/plans/2026-05-30-platform-limits-and-dodo-billing.md)

---

## Phase 0 — Dashboard & env setup (manual, do once)

- [ ] **Dodo account** — sign up at https://dodopayments.com, switch dashboard to **Test mode**.
- [ ] **Create two subscription products:**
  - [ ] `Meethril Premium — Monthly` (subscription, monthly, $5/mo to match `/pricing`).
  - [ ] `Meethril Premium — Yearly` (subscription, yearly, $40/yr to match `/pricing`).
  - [ ] Copy each `product_id` (`pdt_...`).
- [ ] **API key** — Settings → API Keys → create a Test-mode key (bearer token).
- [ ] **Webhook endpoint** — Settings → Webhooks → Add endpoint. Subscribe to:
  `subscription.active`, `subscription.updated`, `subscription.renewed`,
  `subscription.on_hold`, `subscription.plan_changed`, `subscription.cancelled`,
  `subscription.expired`, `subscription.failed` (+ `payment.*` if desired).
  Copy the signing secret (`whsec_...`).
- [ ] **Local env** (`.env`):
  ```
  DODO_API_KEY=<test bearer token>
  DODO_ENVIRONMENT=test_mode
  DODO_PRODUCT_MONTHLY=pdt_...
  DODO_PRODUCT_YEARLY=pdt_...
  DODO_WEBHOOK_SECRET=whsec_...
  ```
- [ ] **ngrok** (for webhook delivery in dev): `ngrok http 3111`, then set the
  Dodo webhook URL to `https://<ngrok>.ngrok-free.app/api/webhooks/dodo`. Keep
  the tunnel running.

---

## Phase 1 — Checkout & activation

- [ ] `/pricing` → click **monthly** → redirected to Dodo hosted checkout.
- [ ] `/pricing` → click **yearly** → same.
- [ ] Complete a test-card purchase → returns to `/pricing?success=true`.
- [ ] `subscription.active` webhook arrives, signature verifies (no 400 in logs).
- [ ] DB row updated: `dodoSubscriptionId`, `dodoCustomerId`, `dodoProductId`,
  `subscriptionStatus='active'`, `currentPeriodEnd` = next billing date.
- [ ] `GET /api/subscription/status` returns `isPremium:true`, correct `plan`.
- [ ] Paid-only action (letters "ask for copy", 402 when free) now succeeds.

## Phase 2 — Webhook correctness

- [ ] **Idempotency:** redeliver the same event from the Dodo dashboard →
  second delivery returns `{ duplicate: true }`, no double state write.
- [ ] **Bad signature:** tamper with the body/secret → 400 `Invalid signature`.
- [ ] **Out-of-order:** confirm a later-state event doesn't get clobbered by a
  stale one (state = last *payload's* status, not last *received*).
- [ ] **Handler error rollback:** if processing throws, the `ProcessedWebhook`
  row is removed so Dodo's retry can reprocess.

## Phase 3 — Subscription lifecycle

- [ ] **Cancel at period end** (`cancel_at_next_billing_date=true`): stays
  `active`, paid access continues until `currentPeriodEnd`, then `expired`→free.
- [ ] **Immediate cancel:** `subscription.cancelled` → free right away.
- [ ] **Failed renewal** (`subscription.on_hold`): paid through the **4-day
  grace**, then free.
- [ ] **Plan change** monthly→yearly (`subscription.plan_changed`): new
  `product_id` + new `currentPeriodEnd`, anchor day recomputes.
- [ ] **Renewal** (`subscription.renewed`): `currentPeriodEnd` advances.
- [ ] **Billing portal:** `/api/billing-portal` opens the Dodo customer portal
  (update card / cancel / invoices).

## Phase 4 — Usage limits (free vs paid)

Free limits: journals 15/mo, scrapbooks 10/mo, self-letters 2/mo, friend-letters
10/mo, stranger-notes 1/day. Paid: journals unlimited (still 1/calendar-day),
scrapbooks 30/mo, self 10/mo, friend 20/mo, stranger 5/day.

- [ ] As a **free** user, hit each cap → POST returns **429 `limit_reached`** and
  the `LimitReachedModal` shows with an **Upgrade** CTA.
- [ ] Upgrade → same actions now allowed up to the paid cap.
- [ ] As **paid**, hit a paid cap → 429 modal shows the **reset date** (no upgrade CTA).
- [ ] **Window reset:** the monthly window is billing-anchored for paid
  (`dayOfMonth(next_billing_date)`) and calendar-month (anchor day 1) for free.
  Verify a count resets at the window boundary (`resetAt`).
- [ ] **Timezone:** counts respect the `X-User-TZ` header (entry created at local
  midnight lands in the right window).
- [ ] **Drafts don't count** — only sealed letters (`isSealed=true`).
- [ ] **Anchor-day clamp:** a 29/30/31 anchor lands on the last day of short months.

## Phase 5 — Production cutover

- [ ] `DODO_ENVIRONMENT=live_mode` + live API key + live product IDs + live
  webhook secret + production webhook endpoint registered.
- [ ] Revert the letter 7-day minimum (see [`pre-launch-checklist.md`](./pre-launch-checklist.md), `TEST-PILL`).
- [ ] One real (or live-test) end-to-end purchase on production.

---

## Known/accepted edge cases (no action needed, just aware)

- Checkout does **not** reuse a stored `dodoCustomerId` — a returning subscriber
  creates a fresh Dodo customer each checkout. The portal still uses the stored
  id. Revisit only if duplicate customers become a billing/reporting problem.
- A draft created in a prior window then sealed counts against the **prior**
  window (letters count by `createdAt`). Acceptable; add a `sealedAt` column if
  it ever matters.
- New subscription mid-calendar-month: prior free usage this month doesn't
  transfer; the paid window is billing-anchored. Fresh-allowance "abuse" is
  bounded to one upgrade.
