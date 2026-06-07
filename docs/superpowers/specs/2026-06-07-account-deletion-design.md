# Account Deletion — Design Spec

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Summary

Add a self-service "delete account" flow to Hearth (Meethril). The model is a
**soft delete with a 14-day grace period, then an irreversible cron purge**.
Requesting deletion cancels the user's Dodo subscription (at period end),
flags the account, emails them, and signs them out. During the grace window
they can log back in to restore everything. After 14 days a daily cron
permanently erases the account — database rows (via Prisma cascade), Supabase
Storage photo objects, and the Supabase auth identity.

Because all user content is E2EE ciphertext, a hard purge is genuinely clean:
once the master-key material on the `User` row is gone, any stray ciphertext is
permanently unreadable.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Deletion model | Soft delete + 14-day grace, then cron purge |
| Grace period | 14 days |
| Subscription on delete | Cancel at Dodo **at period end** (`cancel_at_next_billing_date`) — billing stops, paid days retained |
| Restore terms | All journal data returns; premium continues until the original period end, then re-checkout to continue |
| Confirmation UX | Modal requiring the user to type their exact email |
| Confirmation email | Yes — "scheduled for deletion, restore by {date}" |
| Sign-out on request | Immediate |

## Why cancel-at-period-end (not immediate)

`src/lib/billing/is-paid-user.ts` treats `status === 'active'` as paid through
`currentPeriodEnd`, and its comment explicitly notes that cancel-at-period-end
keeps `status === 'active'` until the end — so "cancelled-but-still-within-paid-
period" is already handled. `status === 'cancelled'` drops entitlement
immediately and ignores `currentPeriodEnd`.

Cancel-at-period-end therefore: stops the next charge (billing truly stops),
keeps the user paid for what they already bought, and on restore needs **no**
special re-entitlement code — the existing `isPaidUser` logic just works. A
yearly subscriber who deletes on day 3 and restores on day 5 keeps the rest of
their year; to continue past the original period end they re-checkout normally.

## Architecture

### Schema change (additive — safe per Hearth's migration rule)

```prisma
model User {
  // ...existing fields...
  deletedAt DateTime? // null = active. Set = scheduled for deletion. Purge at deletedAt + 14d.
}
```

A single nullable column. Purge date is computed (`deletedAt + 14 days`), not
stored. New migration adds the column with no data loss.

### New / changed files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` (+ migration) | Add `User.deletedAt` |
| `src/lib/dodo.ts` | New `cancelSubscription(subscriptionId)` — calls `subscriptions.update(id, { cancel_at_next_billing_date: true, cancellation_feedback?, cancel_reason? })`. **Verify exact Dodo SDK param name at implementation time.** |
| `src/lib/auth/supabase/admin.ts` (new) | Service-role admin client wrapper exposing `deleteAuthUser(supabaseId)`. Uses `SUPABASE_SERVICE_ROLE_KEY`. |
| `src/app/api/account/delete/route.ts` (new) | `POST` — request deletion |
| `src/app/api/account/restore/route.ts` (new) | `POST` — restore during grace |
| `src/app/api/cron/purge-accounts/route.ts` (new) | `GET` — daily purge cron (CRON_SECRET-gated) |
| `src/lib/email.ts` | New `sendAccountDeletionScheduledEmail(to, purgeDate)` |
| `src/app/account/deletion-pending/page.tsx` (new) | Grace-window screen with Restore action |
| login-time gate | Redirect flagged accounts to the pending screen (see below) |
| `src/components/.../DeleteAccountModal.tsx` (new) | Type-your-email confirm modal |
| `src/app/me/page.tsx` | "Danger zone" section with the Delete button |
| `vercel.json` | Register the `purge-accounts` cron (daily) |
| webhook handler | Skip dunning email when `deletedAt` is set |

### Login-time gate

A flagged account (`deletedAt != null`) that authenticates must be intercepted
and routed to `/account/deletion-pending` instead of the normal app. Implement
as a server-side check at the authenticated entry point (e.g. a shared check in
the root authenticated layout / home route via `getCurrentUser()` + the user's
`deletedAt`), mirroring how `LayoutContent` special-cases full-bleed routes.
The pending screen and `/api/account/restore` must remain reachable while
flagged; everything else redirects there.

## Flows

### Flow 1 — Request deletion (`POST /api/account/delete`)

1. `getCurrentUser()` → 401 if null.
2. Read `{ email }` from body; require exact match to `user.email` (server-side
   re-validation, not just client). Mismatch → 400.
3. Idempotency: if `deletedAt` already set, skip steps 4–5, return success.
4. If `dodoSubscriptionId` present and `subscriptionStatus` entitles billing,
   call `cancelSubscription(dodoSubscriptionId)` (cancel-at-period-end).
   Wrapped in try/catch — log failure (Sentry) but **do not** block the flag.
   (Comp/admin users have no sub → nothing to cancel.)
5. Set `user.deletedAt = now`.
6. Send `sendAccountDeletionScheduledEmail(user.email, purgeDate)`
   (best-effort; mail failure does not fail the request).
7. Sign the user out (clear session/cookie).
8. Return success → client shows "Account will be permanently deleted on
   {date}. Log in before then to restore it."

Nothing is destroyed here. Fully reversible.

### Flow 2 — Login during grace

Flagged account logs in → intercepted → `/account/deletion-pending`:
- Shows purge date and what gets erased.
- **Restore** → `POST /api/account/restore` → clears `deletedAt`. All journal
  data intact. Copy notes premium continues until {original period end}
  (sub was set to cancel at period end); re-checkout to continue after that.
- Doing nothing → erased at purge.

### Flow 3 — Purge cron (`GET /api/cron/purge-accounts`, daily)

CRON_SECRET-gated (same pattern as `deliver-letters`). Batched. For each
account where `deletedAt <= now - 14d`:

1. **Defensive Dodo cancel**: if `dodoSubscriptionId` still set, attempt cancel
   again (idempotent) — catches a request-time cancel that failed.
2. **Supabase Storage sweep** (only if `PHOTO_STORAGE=supabase`): list and
   `remove()` all objects under `{userId}/`. Local mode skips (EncryptedBlob
   rows cascade with the User).
3. **Supabase auth user** (only if not dev-auth): `deleteAuthUser(supabaseId)`.
   Dev mode skips.
4. `prisma.user.delete()` → cascades the entire DB graph (entries, letters,
   doodles, photos, scrapbooks, stranger notes/threads/messages, push subs,
   feedback, blobs).

**Order matters:** external cleanup (1–3) before the DB delete (4), so a
mid-purge failure leaves a still-flagged row to retry next run rather than an
orphaned bucket or auth identity. Every step is idempotent (remove-missing-file
and delete-missing-auth-user both no-op; re-cancel of an already-cancelled sub
is safe).

The daily run also serves as the retry path for Flow 1 step-4 failures: any
flagged account still carrying a live `dodoSubscriptionId` gets re-cancelled on
the next daily tick — well within the 14-day window, before most renewal dates.

## Case matrix (verification checklist)

1. **Free user** delete/restore/purge — no sub; flag → restore back as free, or purge. Clean.
2. **Paid, never restores** — sub cancelled at request; purged day 14; defensive re-cancel at purge.
3. **Paid, restores in grace** — data back; premium continues to original period end (cancel-at-period-end); re-checkout to continue after.
4. **Comp / admin** — `complimentaryAccess`/admin flags untouched → premium on restore with no checkout (intentional exception).
5. **Dodo cancel fails at request** — flag set anyway; daily cron retries cancel within ~24h, preventing surprise renewal during grace.
6. **Re-checkout after restore** — normal flow updates the same User row; no `@unique` collision.
7. **Double-request / re-delete** — idempotent: skip re-cancel if already flagged; re-delete resets the clock.
8. **Webhook during grace** — last-write-wins is harmless; suppress dunning email when `deletedAt` set.
9. **Purge partial failure** — external-before-DB ordering + idempotent steps → safe retry next day.
10. **Purged while on pending screen** — next request → user gone → forced logout.
11. **Same email re-signup after purge** — email freed → fresh empty account.

## Error handling

- Auth/ownership: 401 (no user), 400 (email mismatch), follow existing route conventions.
- Dodo cancel and email send are best-effort and never block flagging the account.
- Purge steps are idempotent and ordered so failures are retried, not silently lost.
- Cron route returns a processed/failed count; failures logged to Sentry.

## Out of scope (YAGNI)

- Data export before delete (no export feature exists — separate project).
- Admin-initiated deletion.
- Email-link confirmation (typed-email + 14-day grace is enough friction).
- "Resume/un-cancel subscription" on restore (restore keeps premium to period
  end; re-checkout to continue — no reactivation UI in v1).

## Testing

Per project convention (`feedback_skip_tests`): no formal unit tests by default.
Verify manually in dev mode:
- Free user: delete → pending screen → restore → data intact.
- Email-mismatch rejection in the modal.
- (Where feasible) simulate a flagged row and run the purge cron locally;
  confirm DB cascade. Supabase storage/auth steps no-op in dev (local adapter +
  dev-auth).

## Open implementation-time verifications

1. Exact Dodo SDK parameter for cancel-at-period-end
   (`cancel_at_next_billing_date` vs alternative) — confirm against the
   installed `dodopayments` version before wiring `cancelSubscription`.
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` is available in the Vercel cron runtime.
