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

### 4. Apply DB migrations on production (⚠️ migration history is drifted)
Two new additive migrations must be on the production DB before the billing +
comp-access code works:
- `20260530000000_add_dodo_fields_and_webhook_ledger` — `dodo*` User columns + `processed_webhooks` table.
- `20260603000000_add_complimentary_access` — `User.complimentaryAccess`.

**Heads-up:** the **local** DB was kept in sync with `prisma db push`, not
`migrate`, so its `_prisma_migrations` history is incomplete — `prisma migrate
status` lists ~12 migrations as "not applied" even though the columns/tables
exist. `migrate deploy` there would fail replaying already-existing objects.
Before touching production:
- [ ] Run `prisma migrate status` against **production** and confirm whether its
      history is clean (sequential) or also drifted.
- [ ] If clean → `prisma migrate deploy` applies just the two new migrations.
- [ ] If drifted → do NOT blindly `migrate deploy`. Either `prisma db push`
      (additive, safe — what we did locally) or `prisma migrate resolve
      --applied <name>` to baseline the already-present migrations first.
- [ ] After applying, verify: `users.complimentaryAccess` exists and
      `processed_webhooks` / `dodo*` columns exist.

---

## 🟡 Should do before launch

### 5. Legal pages reviewed
`src/lib/legal.ts` carries `TODO` placeholders (legal entity, jurisdiction). The
processor list now names **Dodo Payments** as Merchant of Record — confirm that
matches your signed Dodo agreement. Have a human review `/privacy` and `/terms`.

### 6. Drop legacy Lemon Squeezy DB columns
The LS code is gone, but the `User` table still has `lemonSqueezyCustomerId`,
`subscriptionId`, etc. (kept per the additive-only migration rule). Once Dodo is
verified in production, write a cleanup migration to drop them. Until then they
are harmless dead columns.

### 7. Confirm production cron secrets / schedules
`CRON_SECRET` set; letter-delivery and stranger-thread crons scheduled.

### 8. (Optional) Grant comp access to your friends & family
Once they've signed up on production:
`npx tsx scripts/grant-comp.ts <email>` (or toggle `complimentaryAccess` in
Prisma Studio). `--list` to audit, `--revoke` to remove.

---

## ✅ Already handled / verified
- Dodo webhook signature verify + idempotency (`ProcessedWebhook`) + order-independent state writes.
- Billing-anchored usage limits (free vs paid) enforced server-side on all create routes.
- Failed-payment 4-day grace + 2-day renewal leeway in `isPaidUser`.
- Privacy/terms/subprocessor list updated from Lemon Squeezy → Dodo Payments.
- Complimentary (friends & family) full-access flag — migration applied **locally**
  and grant/list/revoke script smoke-tested. Still needs applying on production (item 4).
