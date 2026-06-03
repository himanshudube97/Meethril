# Platform Usage Limits + Dodo Billing Hardening

> **Status:** implemented on branch `feat/dodo-payments-and-limits` (off `main`).
> Supersedes the stale `dodo-payments-migration` worktree (122 commits behind main).
> Tracks GitHub issue **#54 — Add limits on platform**.

This document is the single source of truth for (a) Hearth's free vs paid usage
limits and (b) how those limits anchor to a Dodo Payments subscription billing
cycle. It also captures the webhook-correctness hardening that the limits system
depends on. Read this before touching anything under `src/lib/billing/`,
`src/lib/dodo.ts`, or `src/app/api/webhooks/dodo/`.

---

## 1. The limits

| Feature | Free | Paid | Counting unit | Window |
|---|---|---|---|---|
| Journal entries | 15 / month | unlimited (still 1 / calendar-day) | `JournalEntry` rows, `entryType='normal'`, not archived, by `createdAt` | monthly |
| Scrapbooks | 10 / month | 30 / month | `Scrapbook` rows by `createdAt` | monthly |
| Self letters | 2 / month | 10 / month | `Letter` rows `letterType='self'`, `isSealed=true`, not archived, by `createdAt` | monthly |
| Friend letters | 10 / month | 20 / month | `Letter` rows `letterType='friend'`, `isSealed=true`, not archived, by `createdAt` | monthly |
| Stranger notes | 1 / day | 5 / day | new `StrangerThread` rows today (existing `countTodaysNewNotes`) | per local day |

Rules:
- **Self and friend letters are SEPARATE buckets** (paid = 20 friend AND 10 self, not combined).
- **Drafts do not count** — only sealed letters. A `Letter` with `isSealed=false` is a draft.
- **Received letters do not count** against the recipient (`letterType='received-friend'` / `isReceivedLetter` never match the `self`/`friend` filters).
- **Paid journals are effectively unlimited per month** (`Infinity`); the pre-existing one-entry-per-calendar-day rule in `POST /api/entries` is the only journal cap for paid users.
- **Stranger notes keep their existing per-day counter** (`src/lib/stranger-notes.ts`); we only make the daily ceiling tier-dependent (free lowers from the old constant `2` to `1`; paid `5`).

Source of truth for numbers: `src/lib/billing/limits.ts` (`FREE_LIMITS` / `PAID_LIMITS`).

---

## 2. The billing-anchored quota window

Dodo only reliably exposes a **forward** billing date (`next_billing_date`) on the
subscription object — there is **no** `current_period_start` / `previous_billing_date`.
So we never read a period-start; we **derive** the monthly window from a billing
**anchor day-of-month**.

```
anchorDay = isPaidUser ? dayOfMonth(currentPeriodEnd, userTz) : 1
{ start, end } = currentMonthlyWindow(anchorDay, userTz)
used = COUNT(rows WHERE createdAt >= start AND createdAt < end)
allowed = used < limit
```

- **Free users** → `anchorDay = 1` → calendar month (resets on the 1st in the user's tz).
- **Paid users** → `anchorDay = dayOfMonth(currentPeriodEnd)` where `currentPeriodEnd`
  is the stored `next_billing_date`. Monthly subscribers' windows coincide with their
  billing period; **yearly subscribers** still get 12 monthly buckets because we only
  use the day-of-month, never the year-distant period boundary.
- **Anchor-day clamping**: a 29/30/31 anchor clamps to the last day of short months
  (Jan-31 anchor → Feb-28/29 → Mar-31), matching Stripe/Dodo billing behaviour.
  Implemented in `currentMonthlyWindow` via `min(anchorDay, daysInMonth)`.
- **Timezone**: window boundaries are computed in the user's IANA tz (the `X-User-TZ`
  header), reusing `utcInstantForLocalDate` / `localDatePartsNow` from
  `src/lib/entry-lock.ts`. Counts use the real UTC `createdAt`, so all zones are correct
  and DST is handled by `Intl`.

### Why live COUNT, not a stored counter
We count rows live within the computed window rather than maintaining a per-user
counter that resets on a webhook. Dodo webhooks can arrive **out of order**, be
**duplicated** (retries up to 8×), or be **missed** — a counter that fails to reset
silently locks out a paying user. A live COUNT is self-correcting and has no reset
race. The only counter we keep is the pre-existing stranger-notes daily one (it was
already there and is daily, not billing-anchored).

---

## 3. Dodo subscription facts (verified against live docs, May 2026)

- **Status enum**: `active`, `on_hold`, `cancelled`, `expired`, `pending`.
- **Fields used**: `subscription_id`, `product_id`, `next_billing_date` (forward only),
  `cancelled_at`, `cancel_at_next_billing_date` (the cancel-at-period-end flag),
  `customer.customer_id`, `customer.email`, `metadata` (we stuff `user_id` at checkout),
  `payment_frequency_interval`. **No** `current_period_start`/`previous_billing_date`.
- **Webhook events** (8): `subscription.active` (lifecycle start — there is NO `.created`),
  `.renewed`, `.on_hold`, `.plan_changed`, `.updated`, `.cancelled`, `.failed`, `.expired`,
  plus `payment.*`.
- **Delivery**: Standard Webhooks spec — headers `webhook-id`, `webhook-signature`
  (HMAC-SHA256 over `id.timestamp.rawBody`, base64), `webhook-timestamp`. Events may
  arrive **out of order** and always carry the **latest state at delivery**. Retries up
  to 8×, so dedupe on `webhook-id`.

### Webhook handling (`src/app/api/webhooks/dodo/route.ts`)
1. Read raw body + the 3 Standard-Webhooks headers; verify HMAC signature.
2. **Idempotency**: `INSERT` the `webhook-id` into `ProcessedWebhook`; on unique-constraint
   violation, return `200 { duplicate: true }` without mutating state.
3. **Order-independence**: for every `subscription.*` event we write `subscriptionStatus =
   payload.data.status` and `currentPeriodEnd = next_billing_date` directly from the payload.
   Because Dodo guarantees the payload carries the latest state at delivery, last-write
   converges to truth regardless of event order — we do NOT branch behaviour on event type
   for the state write. (`subscription.failed` = mandate setup failed pre-activation → logged, no state change. `payment.*` → recorded as processed, no state change.)
4. Resolve the Hearth user by `metadata.user_id` → email → `dodoSubscriptionId`.

### Access determination + grace period (`src/lib/billing/is-paid-user.ts`)
`isPaidUser({ subscriptionStatus, currentPeriodEnd })`:
- `active` / `on_trial` → paid while `now <= currentPeriodEnd + ACCESS_LEEWAY` (2 days
  leeway absorbs webhook lag / clock skew). Cancel-at-period-end keeps `status='active'`
  until the period end, so the user keeps access until then automatically.
- `on_hold` (failed renewal) → **4-day grace**: paid while `now <= currentPeriodEnd +
  GRACE_DAYS (4)`. After that, free-tier limits apply.
- `cancelled` / `expired` / `pending` / null → not paid.

`currentPeriodEnd` always stores the **raw** `next_billing_date` (used for both display
and anchor-day derivation); leeway/grace are applied only inside `isPaidUser`, never
baked into the stored value.

---

## 4. Lifecycle edge cases → behaviour

| Scenario | Behaviour |
|---|---|
| Cancel at period end (`cancel_at_next_billing_date=true`) | status stays `active`, `currentPeriodEnd` = period end → paid until then, then `expired` → free. |
| Immediate cancel | `subscription.cancelled`, status `cancelled` → free immediately (display can still show `currentPeriodEnd`). |
| Upgrade monthly→yearly / plan change | `subscription.plan_changed` writes new `product_id` + new `next_billing_date`; anchor day recomputes from the new period. Fresh monthly window — acceptable. |
| Failed payment | `subscription.on_hold` → keep paid through 4-day grace, then free. |
| New sub mid-calendar-month | Paid window is billing-anchored; prior free usage this calendar month doesn't transfer. Fresh-allowance "abuse" bounded to one upgrade. |
| Yearly subscriber | Monthly buckets via anchor day-of-month (year-distant `next_billing_date` only contributes its day-of-month). |
| Duplicate / out-of-order webhook | Deduped on `webhook-id`; state writes are last-write-converges on payload `status`. |

---

## 5. Data model changes (additive only)

`User` (additive — Lemon Squeezy fields kept, marked deprecated):
- `dodoCustomerId String? @unique`
- `dodoSubscriptionId String? @unique`
- `dodoProductId String?`
- reuse `subscriptionStatus` (now holds Dodo status strings) and `currentPeriodEnd`
  (now holds `next_billing_date`).

New table:
- `ProcessedWebhook { id String @id /* webhook-id */, eventType String?, processedAt DateTime @default(now()) }`

Migration: pure `ADD COLUMN` / `CREATE TABLE` — no drops, no NOT NULL on existing data
(per CLAUDE.md additive-only rule). LS fields drop in a later cleanup migration once Dodo
is verified in production.

---

## 6. File map

**Billing foundation**
- `src/lib/dodo.ts` — SDK client, product↔plan map, `createCheckoutUrl`, `createPortalSession`, signature verify.
- `src/lib/billing/is-paid-user.ts` — canonical `isPaidUser` + grace/leeway; `planFromProductId`.
- `src/app/api/webhooks/dodo/route.ts` — verified, idempotent, order-independent handler.
- `src/app/api/checkout/route.ts`, `billing-portal/route.ts`, `subscription/status/route.ts` — swapped to Dodo.
- `prisma/schema.prisma` + migration — `dodo*` fields + `ProcessedWebhook`.
- `.env.example` — `DODO_API_KEY`, `DODO_ENVIRONMENT`, `DODO_PRODUCT_MONTHLY`, `DODO_PRODUCT_YEARLY`, `DODO_WEBHOOK_SECRET`.

**Limits**
- `src/lib/billing/limits.ts` — `FREE_LIMITS` / `PAID_LIMITS`, `QuotaFeature`.
- `src/lib/billing/quota.ts` — `currentMonthlyWindow`, `checkQuota`, `quotaExceededResponse`.
- Gated: `POST /api/entries`, `POST /api/scrapbooks`, `POST /api/letters/self`, `POST /api/letters/friend`.
- Retuned: `POST /api/stranger-notes` (tiered daily limit).
- `src/app/api/usage/route.ts` — read-only usage snapshot for the client.
- `src/hooks/useUsage.ts` + 429 handling for upgrade prompts.

---

## 7. Open / deferred
- Cleanup migration to drop Lemon Squeezy columns once Dodo is live-verified.
- The dashboard/product setup steps (create Dodo products, webhook endpoint, ngrok) are
  manual — see the original `dodo-payments-migration` plan, Phase 0.
- Letter quota counts by `Letter.createdAt`. A draft created in a prior window then sealed
  now counts against the prior window. Acceptable edge (compose+send is usually one session);
  if it matters later, add a `sealedAt` column and count by that.
