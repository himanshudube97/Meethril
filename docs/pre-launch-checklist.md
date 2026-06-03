# Pre-Production Launch Checklist

Things that are intentionally relaxed/stubbed for staging and **must** be
reverted or completed before a real public launch. Grep tokens are noted so you
can find every spot mechanically.

> Keep this list honest. If you relax something for testing, add it here in the
> same change so it can't silently ship.

---

## 🔴 Blockers — must fix before public launch

### 1. Letter minimum lead time is relaxed to 1 hour (should be 7 days)
For staging we lowered the minimum "deliver in the future" gap from **7 days**
to **~1 hour** so the SealModal test pill works end-to-end. Revert to 7 days.

- **Grep token:** `TEST-PILL`
- **Spots:**
  - `src/app/api/letters/self/route.ts` — `oneHourMs` check; restore the
    commented `sevenDaysMs` guard.
  - `src/app/api/letters/friend/route.ts` — same.
  - `src/components/letters/compose/SealModal.tsx` — remove the 1-hour test pill
    from the schedule options.
- **Action:** change minimum lead time back to 7 days and remove the 1h pill.

### 2. Dodo Payments end-to-end flow is untested
See [`docs/payments-launch-testing.md`](./payments-launch-testing.md) for the
full checklist (dashboard setup, checkout, webhooks, lifecycle, limits). None of
it has been exercised on a live Dodo account yet.

### 3. Switch Dodo to live mode
- `DODO_ENVIRONMENT=live_mode` in production env.
- Live-mode API key, live-mode product IDs (`DODO_PRODUCT_MONTHLY` / `_YEARLY`),
  and the **live** webhook signing secret (`DODO_WEBHOOK_SECRET`).
- Register the production webhook endpoint (`/api/webhooks/dodo`) in the Dodo
  dashboard against the production domain.

---

## 🟡 Should do before launch

### 4. Legal pages reviewed
`src/lib/legal.ts` carries `TODO` placeholders (legal entity, jurisdiction). The
processor list now names **Dodo Payments** as Merchant of Record — confirm that
matches your signed Dodo agreement. Have a human review `/privacy` and `/terms`.

### 5. Drop legacy Lemon Squeezy DB columns
The LS code is gone, but the `User` table still has `lemonSqueezyCustomerId`,
`subscriptionId`, etc. (kept per the additive-only migration rule). Once Dodo is
verified in production, write a cleanup migration to drop them. Until then they
are harmless dead columns.

### 6. Confirm production cron secrets / schedules
`CRON_SECRET` set; letter-delivery and stranger-thread crons scheduled.

---

## ✅ Already handled
- Dodo webhook signature verify + idempotency (`ProcessedWebhook`) + order-independent state writes.
- Billing-anchored usage limits (free vs paid) enforced server-side on all create routes.
- Failed-payment 4-day grace + 2-day renewal leeway in `isPaidUser`.
- Privacy/terms/subprocessor list updated from Lemon Squeezy → Dodo Payments.
