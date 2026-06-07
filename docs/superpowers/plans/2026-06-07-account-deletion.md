# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service account-deletion flow — soft delete with a 14-day grace period, then an irreversible daily-cron purge that erases DB rows, Supabase Storage photos, and the Supabase auth identity, cancelling the Dodo subscription (at period end) on request.

**Architecture:** Requesting deletion cancels Dodo (cancel-at-period-end), sets `User.deletedAt`, emails the user, and signs them out. A flagged account that logs back in during the 14-day window is routed to a restore screen. A daily cron purges accounts past `deletedAt + 14d`, doing external cleanup (storage, auth) before `prisma.user.delete()` (which cascades the whole DB graph). All steps are idempotent so a partial failure retries on the next run.

**Tech Stack:** Next.js 16 App Router, Prisma/Postgres, Dodo Payments SDK (`dodopayments`), Supabase (`@supabase/supabase-js` service-role), Resend, Zustand.

**Testing note:** Per Hearth convention (`feedback_skip_tests`) this plan uses **manual dev-mode verification**, not unit tests. Dev mode runs `USE_DEV_AUTH=true` + `PHOTO_STORAGE=local`, so the Supabase auth/storage purge branches are no-ops locally; verify those by code review + (optionally) a staging run.

**Spec:** `docs/superpowers/specs/2026-06-07-account-deletion-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | Add `User.deletedAt DateTime?` |
| `src/lib/dodo.ts` | `cancelSubscription(subscriptionId)` — cancel at period end |
| `src/lib/auth/supabase/admin.ts` (new) | Service-role admin client + `deleteAuthUserByEmail(email)` |
| `src/lib/storage/purge-user-storage.ts` (new) | `purgeUserStorage(userId)` — remove all Supabase Storage objects under `{userId}/` (no-op in local mode) |
| `src/lib/email.ts` | `sendAccountDeletionScheduledEmail({to, userName, purgeDate, restoreUrl})` |
| `src/app/api/account/delete/route.ts` (new) | `POST` — request deletion |
| `src/app/api/account/restore/route.ts` (new) | `POST` — restore during grace |
| `src/app/api/cron/purge-accounts/route.ts` (new) | `GET` — daily purge cron |
| `src/app/api/webhooks/dodo/route.ts` | Suppress dunning email when `deletedAt` set |
| `src/app/api/auth/me/route.ts` | Expose `deletedAt` so the client can gate |
| `src/store/auth.ts` | Track `accountDeletedAt` |
| `src/components/LayoutContent.tsx` | Redirect flagged accounts to the pending screen |
| `src/app/account/deletion-pending/page.tsx` (new) | Grace-window screen + Restore button |
| `src/components/account/DeleteAccountModal.tsx` (new) | Type-your-email confirm modal |
| `src/app/me/page.tsx` | "Danger zone" section with Delete button |
| `CLAUDE.md` / `.env.example` | Document the new cron + confirm `SUPABASE_SERVICE_ROLE_KEY` |

Constants: grace period = 14 days. Define `const GRACE_DAYS = 14` where used; do not hardcode the number inline twice.

---

## Task 1: Schema — add `User.deletedAt`

**Files:**
- Modify: `prisma/schema.prisma` (User model)

- [ ] **Step 1: Add the field**

In the `User` model, add alongside the other top-level scalar fields (near `createdAt`/`updatedAt`):

```prisma
  // Account deletion: null = active. Set when the user requests deletion.
  // A daily cron permanently purges accounts where deletedAt <= now - 14d.
  deletedAt DateTime?
```

- [ ] **Step 2: Create the migration (additive, no data loss)**

Per Hearth's additive-only rule this is a safe nullable column. Run:

```bash
docker compose exec app npx prisma migrate dev --name add_user_deleted_at
```

Expected: a new migration under `prisma/migrations/*_add_user_deleted_at/` containing only `ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);`. Prisma must NOT warn about data loss. If it does, stop — something is wrong.

- [ ] **Step 3: Verify the column exists**

```bash
docker compose exec app npx prisma studio
```
Confirm `User.deletedAt` shows as a nullable column. (Or skip Studio and just confirm the generated SQL in the migration file.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(account): add User.deletedAt for soft-delete grace period"
```

---

## Task 2: Dodo — `cancelSubscription()`

**Files:**
- Modify: `src/lib/dodo.ts`

- [ ] **Step 1: Confirm the SDK parameter name for cancel-at-period-end**

The installed SDK is `dodopayments` (see package.json). Find the exact param:

```bash
docker compose exec app grep -rn "cancel_at_next_billing_date\|cancel_at_period_end\|cancel_reason\|status" node_modules/dodopayments/resources/subscriptions.d.ts | head -30
```
Expected: a `SubscriptionUpdateParams` (or similar) type exposing a cancel-at-period-end boolean. **Use whatever the SDK actually names it.** The code below assumes `cancel_at_next_billing_date`; adjust if the grep shows a different name.

- [ ] **Step 2: Add the function**

Append to `src/lib/dodo.ts`:

```ts
/**
 * Cancel a subscription at the end of the current billing period. Billing
 * stops (no renewal) but the user keeps the paid days they already bought —
 * isPaidUser() treats a cancel-at-period-end sub as active through
 * currentPeriodEnd. Used by the account-deletion flow.
 *
 * Idempotent for our purposes: calling it on an already-cancelled sub is safe
 * (Dodo returns the current state). Throws on network/API errors — callers
 * decide whether to swallow.
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const client = getDodoClient()
  await client.subscriptions.update(subscriptionId, {
    cancel_at_next_billing_date: true,
    cancellation_reason: 'account_deleted',
  })
}
```

If Step 1 showed the cancel field is `cancel_at_period_end` (or the reason field differs / is unsupported), edit the call accordingly and drop unsupported keys.

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no new errors in `src/lib/dodo.ts`. If the SDK rejects a key, that's the signal from Step 1 — fix the key.

- [ ] **Step 4: Commit**

```bash
git add src/lib/dodo.ts
git commit -m "feat(billing): add cancelSubscription (cancel at period end)"
```

---

## Task 3: Supabase admin client — delete auth user by email

**Files:**
- Create: `src/lib/auth/supabase/admin.ts`

Users link to Supabase by email (no stored Supabase id), so we resolve the auth user by paging `admin.listUsers()`.

- [ ] **Step 1: Write the module**

```ts
// src/lib/auth/supabase/admin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Server-only — bypasses RLS. Used for
 * privileged operations (deleting auth users during account purge).
 * Returns null when not configured (e.g. dev-auth environments) so callers
 * can no-op cleanly.
 */
function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Delete the Supabase auth identity for the given email. Idempotent:
 * returns { deleted: false } if no admin client is configured or no auth
 * user matches (already gone). Never throws on "not found".
 */
export async function deleteAuthUserByEmail(
  email: string,
): Promise<{ deleted: boolean }> {
  const client = getAdminClient()
  if (!client) return { deleted: false } // dev-auth or unconfigured

  const target = email.toLowerCase()
  // Page through users to find the one matching the email.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === target)
    if (match) {
      const { error: delErr } = await client.auth.admin.deleteUser(match.id)
      if (delErr) throw delErr
      return { deleted: true }
    }
    if (data.users.length < 200) break // last page
  }
  return { deleted: false }
}
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no errors. If `listUsers` signature differs in `@supabase/supabase-js@2.95.x`, confirm with:
```bash
docker compose exec app grep -rn "listUsers" node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts
```
and adjust the call/return access (`data.users`) to match.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/supabase/admin.ts
git commit -m "feat(auth): service-role admin client + deleteAuthUserByEmail"
```

---

## Task 4: Storage — purge a user's Supabase Storage objects

**Files:**
- Create: `src/lib/storage/purge-user-storage.ts`

Local mode stores photos as `EncryptedBlob` rows (cascade-deleted with the User), so this is a no-op there. Supabase mode needs an explicit sweep of `{userId}/*`.

- [ ] **Step 1: Write the helper**

```ts
// src/lib/storage/purge-user-storage.ts
import { createClient } from '@supabase/supabase-js'

/**
 * Permanently remove every Supabase Storage object under the user's folder
 * ({userId}/...). No-op when PHOTO_STORAGE !== 'supabase' (local mode keeps
 * ciphertext in EncryptedBlob rows, which cascade-delete with the User).
 * Idempotent: removing already-gone objects is a no-op.
 */
export async function purgeUserStorage(userId: string): Promise<{ removed: number }> {
  if (process.env.PHOTO_STORAGE !== 'supabase') return { removed: 0 }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET
  if (!url || !serviceKey || !bucket) {
    throw new Error('purgeUserStorage requires SUPABASE_* env vars in supabase mode')
  }

  const client = createClient(url, serviceKey)
  let removed = 0

  // List + remove in pages until the folder is empty.
  for (let guard = 0; guard < 1000; guard++) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(userId, { limit: 100 })
    if (error) throw error
    if (!data || data.length === 0) break

    const paths = data.map((f) => `${userId}/${f.name}`)
    const { error: rmErr } = await client.storage.from(bucket).remove(paths)
    if (rmErr) throw rmErr
    removed += paths.length
    if (data.length < 100) break
  }

  return { removed }
}
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage/purge-user-storage.ts
git commit -m "feat(storage): purgeUserStorage sweep for account deletion"
```

---

## Task 5: Email — deletion-scheduled notice

**Files:**
- Modify: `src/lib/email.ts`

Follow the existing `sendPaymentFailedEmail` shape (RESEND_FROM_SYSTEM, `escapeHtml`, dark warm template, `{ success, error }` return).

- [ ] **Step 1: Add the function**

Append to `src/lib/email.ts` (reuse the existing `escapeHtml` and `getResend` helpers already in the file):

```ts
export async function sendAccountDeletionScheduledEmail(args: {
  to: string
  userName?: string | null
  purgeDate: Date
  restoreUrl: string
}): Promise<{ success: boolean; error?: string }> {
  const from = process.env.RESEND_FROM_SYSTEM
  if (!from) return { success: false, error: 'RESEND_FROM_SYSTEM not set' }

  const safeName = args.userName ? escapeHtml(args.userName) : null
  const greeting = safeName ? `Dear ${safeName},` : 'Hello,'
  const safeUrl = escapeHtml(args.restoreUrl)
  const dateStr = args.purgeDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your account is scheduled for deletion</title></head>
<body style="margin:0;padding:0;background-color:#1a1215;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1215;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="font-size:40px;margin-bottom:16px;">🕯️</div>
          <h1 style="color:#f5e6d3;font-size:23px;font-weight:300;margin:0;">Your account is scheduled for deletion</h1>
        </td></tr>
        <tr><td style="color:#d8c4ae;font-size:15px;line-height:1.7;padding:0 8px;">
          <p style="margin:0 0 16px 0;">${greeting}</p>
          <p style="margin:0 0 16px 0;">We've received your request to delete your account. Your journal, letters, scrapbook, and everything else will be <strong style="color:#f5e6d3;">permanently erased on ${dateStr}</strong>.</p>
          <p style="margin:0 0 8px 0;">Changed your mind? You have until then to bring it all back — just log in and choose <em>Restore</em>. After that date, nothing can be recovered.</p>
        </td></tr>
        <tr><td align="center" style="padding:28px 0 8px 0;">
          <a href="${safeUrl}" style="display:inline-block;background-color:#e8945a;color:#1a1215;padding:14px 40px;border-radius:24px;text-decoration:none;font-size:15px;font-weight:500;">Restore my account</a>
        </td></tr>
        <tr><td align="center" style="padding:32px 0 0 0;border-top:1px solid rgba(154,123,91,0.2);">
          <p style="color:#6b5a4a;font-size:12px;margin:16px 0 0 0;">If you meant to delete your account, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  try {
    const { error } = await getResend().emails.send({
      from, to: [args.to], subject: 'Your account is scheduled for deletion', html,
    })
    if (error) {
      console.error('Failed to send deletion-scheduled email:', error)
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('Error sending deletion-scheduled email:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Type-check & commit**

```bash
docker compose exec app npx tsc --noEmit
git add src/lib/email.ts
git commit -m "feat(email): account-deletion-scheduled notice"
```

---

## Task 6: API — request deletion (`POST /api/account/delete`)

**Files:**
- Create: `src/app/api/account/delete/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/account/delete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { cancelSubscription } from '@/lib/dodo'
import { isPaidUser } from '@/lib/billing/is-paid-user'
import { sendAccountDeletionScheduledEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const GRACE_DAYS = 14

export async function POST(request: NextRequest) {
  try {
    const authUser = await getCurrentUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const typedEmail = typeof body.email === 'string' ? body.email.trim() : ''
    if (typedEmail.toLowerCase() !== authUser.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email confirmation does not match your account email.' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true, email: true, name: true, deletedAt: true,
        dodoSubscriptionId: true, subscriptionStatus: true, currentPeriodEnd: true,
        complimentaryAccess: true,
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Idempotent: already flagged → nothing more to do.
    if (user.deletedAt) {
      return NextResponse.json({ success: true, deletedAt: user.deletedAt })
    }

    // Cancel the Dodo subscription at period end (billing stops, paid days kept).
    // Best-effort: a Dodo outage must NOT trap the user in undeletable+billed
    // limbo. The purge cron retries cancel daily for still-flagged accounts.
    if (
      user.dodoSubscriptionId &&
      isPaidUser({
        subscriptionStatus: user.subscriptionStatus,
        currentPeriodEnd: user.currentPeriodEnd,
        complimentaryAccess: user.complimentaryAccess,
      })
    ) {
      try {
        await cancelSubscription(user.dodoSubscriptionId)
      } catch (e) {
        console.error('Dodo cancel failed during account deletion (will retry in purge cron):', e)
      }
    }

    const deletedAt = new Date()
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt } })

    // Email (best-effort).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3111'
    const purgeDate = new Date(deletedAt.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    await sendAccountDeletionScheduledEmail({
      to: user.email,
      userName: user.name,
      purgeDate,
      restoreUrl: `${appUrl}/account/deletion-pending`,
    }).catch((e) => console.error('deletion email failed:', e))

    return NextResponse.json({ success: true, deletedAt, purgeDate })
  } catch (error) {
    console.error('Account deletion request failed:', error)
    return NextResponse.json({ error: 'Failed to process deletion' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no errors. (Confirm `isPaidUser` accepts the object shape above — see `src/lib/billing/is-paid-user.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/account/delete/route.ts
git commit -m "feat(account): POST /api/account/delete request flow"
```

---

## Task 7: API — restore (`POST /api/account/restore`)

**Files:**
- Create: `src/app/api/account/restore/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/account/restore/route.ts
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const authUser = await getCurrentUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Clear the flag. Subscription stays as-is (cancel-at-period-end): the user
    // keeps premium until their original period end, then re-checkouts to continue.
    await prisma.user.update({
      where: { id: authUser.id },
      data: { deletedAt: null },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account restore failed:', error)
    return NextResponse.json({ error: 'Failed to restore account' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check & commit**

```bash
docker compose exec app npx tsc --noEmit
git add src/app/api/account/restore/route.ts
git commit -m "feat(account): POST /api/account/restore"
```

---

## Task 8: Cron — purge expired accounts (`GET /api/cron/purge-accounts`)

**Files:**
- Create: `src/app/api/cron/purge-accounts/route.ts`

- [ ] **Step 1: Write the cron route**

```ts
// src/app/api/cron/purge-accounts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkCronAuth } from '@/lib/cron-auth'
import { cancelSubscription } from '@/lib/dodo'
import { purgeUserStorage } from '@/lib/storage/purge-user-storage'
import { deleteAuthUserByEmail } from '@/lib/auth/supabase/admin'

export const dynamic = 'force-dynamic'

const GRACE_DAYS = 14

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)
  const due = await prisma.user.findMany({
    where: { deletedAt: { lte: cutoff } },
    select: { id: true, email: true, dodoSubscriptionId: true },
    take: 50,
  })

  const errors: string[] = []
  let purged = 0

  for (const u of due) {
    try {
      // 1. Defensive Dodo cancel (catches a request-time cancel that failed).
      if (u.dodoSubscriptionId) {
        try {
          await cancelSubscription(u.dodoSubscriptionId)
        } catch (e) {
          console.error(`purge: dodo cancel failed for ${u.id}:`, e)
          // Non-fatal: continue purging. Billing already at period-end if the
          // original request-time cancel succeeded; otherwise this is logged.
        }
      }

      // 2. External cleanup BEFORE the DB delete, so a failure here leaves a
      //    still-flagged row to retry next run rather than orphaned objects.
      await purgeUserStorage(u.id)            // Supabase Storage objects (no-op in local mode)
      await deleteAuthUserByEmail(u.email)    // Supabase auth identity (no-op in dev-auth)

      // 3. DB delete — cascades the entire user graph.
      await prisma.user.delete({ where: { id: u.id } })
      purged++
    } catch (e) {
      errors.push(`${u.id}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ purged, attempted: due.length, errors })
}
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test (local, dev-auth + local storage)**

Set a temporary `CRON_SECRET` in `.env` if not set, then restart. Flag a throwaway user as expired via Studio (set `deletedAt` to a date >14 days ago — use a SECONDARY seeded user, NOT the canonical `.dev-creds.local` test account), then:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3112/api/cron/purge-accounts
```
Expected JSON: `{"purged":1,"attempted":1,"errors":[]}`. Confirm in Studio the user row and its entries are gone. (Storage/auth branches no-op locally.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/purge-accounts/route.ts
git commit -m "feat(cron): purge-accounts daily purge with idempotent cleanup"
```

---

## Task 9: Webhook — suppress dunning for deleting accounts

**Files:**
- Modify: `src/app/api/webhooks/dodo/route.ts`

The dunning email gate is `if (status === 'on_hold' && user.subscriptionStatus !== 'on_hold')`. Don't nag someone who's leaving.

- [ ] **Step 1: Add `deletedAt` to the user select**

Find `userSelect` in `applySubscriptionState`:

```ts
  const userSelect = { id: true, email: true, subscriptionStatus: true, dodoCustomerId: true } as const
```
Change to:

```ts
  const userSelect = { id: true, email: true, subscriptionStatus: true, dodoCustomerId: true, deletedAt: true } as const
```

- [ ] **Step 2: Gate the dunning send on `deletedAt`**

Find the dunning condition:

```ts
  if (status === 'on_hold' && user.subscriptionStatus !== 'on_hold') {
```
Change to:

```ts
  if (status === 'on_hold' && user.subscriptionStatus !== 'on_hold' && !user.deletedAt) {
```

- [ ] **Step 3: Type-check & commit**

```bash
docker compose exec app npx tsc --noEmit
git add src/app/api/webhooks/dodo/route.ts
git commit -m "fix(billing): skip dunning email for accounts pending deletion"
```

---

## Task 10: Expose `deletedAt` to the client

**Files:**
- Modify: `src/app/api/auth/me/route.ts`
- Modify: `src/store/auth.ts`

- [ ] **Step 1: Return `deletedAt` from /api/auth/me**

In `src/app/api/auth/me/route.ts`, add `deletedAt: true` to the `full` select and return it. The `select` becomes:

```ts
    select: {
      strangerPublicKey: true,
      strangerWrappedPrivateKey: true,
      deletedAt: true,
    },
```
And the response:

```ts
  return NextResponse.json({
    user,
    deletedAt: full?.deletedAt ?? null,
    strangerPublicKey: full?.strangerPublicKey ?? null,
    strangerWrappedPrivateKey: full?.strangerWrappedPrivateKey ?? null,
  })
```

- [ ] **Step 2: Track it in the auth store**

In `src/store/auth.ts`, add to `AuthState`:

```ts
  accountDeletedAt: string | null
```
Initialize it in the store object:

```ts
  accountDeletedAt: null,
```
And in `fetchUser`, set it on success:

```ts
      if (response.ok) {
        const data = await response.json()
        set({ user: data.user, accountDeletedAt: data.deletedAt ?? null, loading: false })
      } else {
        set({ user: null, accountDeletedAt: null, loading: false })
      }
```

- [ ] **Step 3: Type-check & commit**

```bash
docker compose exec app npx tsc --noEmit
git add src/app/api/auth/me/route.ts src/store/auth.ts
git commit -m "feat(account): expose deletedAt to client via /api/auth/me"
```

---

## Task 11: Login-time gate + deletion-pending screen

**Files:**
- Create: `src/app/account/deletion-pending/page.tsx`
- Modify: `src/components/LayoutContent.tsx`

- [ ] **Step 1: Build the pending screen**

```tsx
// src/app/account/deletion-pending/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useAuthStore } from '@/store/auth'

const GRACE_DAYS = 14

export default function DeletionPendingPage() {
  const router = useRouter()
  const { theme } = useThemeStore()
  const { accountDeletedAt, logout, fetchUser } = useAuthStore()
  const [restoring, setRestoring] = useState(false)

  const purgeDate = accountDeletedAt
    ? new Date(new Date(accountDeletedAt).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    : null
  const dateStr = purgeDate
    ? purgeDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const res = await fetch('/api/account/restore', { method: 'POST' })
      if (res.ok) {
        await fetchUser()
        router.replace('/')
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ color: theme.text.primary }}
    >
      <div className="max-w-md text-center">
        <div className="text-5xl mb-6">🕯️</div>
        <h1 className="text-2xl font-light mb-4">Your account is scheduled for deletion</h1>
        <p className="text-sm leading-relaxed mb-2" style={{ color: theme.text.secondary }}>
          Everything — your journal, letters, scrapbook, and photos — will be permanently erased
          {dateStr ? ` on ${dateStr}` : ' soon'}.
        </p>
        <p className="text-sm leading-relaxed mb-8" style={{ color: theme.text.secondary }}>
          Restore now to bring it all back. If you had premium, it stays active through your
          original billing period.
        </p>
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="w-full py-3 rounded-full font-medium mb-3 disabled:opacity-60"
          style={{ backgroundColor: theme.accent, color: theme.bg.primary }}
        >
          {restoring ? 'Restoring…' : 'Restore my account'}
        </button>
        <button
          onClick={logout}
          className="w-full py-3 rounded-full text-sm"
          style={{ color: theme.text.secondary }}
        >
          Log out
        </button>
      </div>
    </div>
  )
}
```
Note: if `theme.accent` / `theme.text.secondary` names differ in `src/store/theme`, use the actual property names (check the theme type before writing).

- [ ] **Step 2: Add the gate to LayoutContent**

In `src/components/LayoutContent.tsx`, import the auth store and router at the top (with the other imports):

```ts
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
```
Inside the component (near the other hooks, after `pathname` is defined), add:

```ts
  const router = useRouter()
  const accountDeletedAt = useAuthStore((s) => s.accountDeletedAt)
  const isDeletionPendingPage = pathname === '/account/deletion-pending'

  // A flagged (pending-deletion) account is routed to the restore screen for
  // every authed route until it restores or is purged. Public/auth routes are
  // exempt so login/restore stay reachable.
  useEffect(() => {
    const exempt =
      isDeletionPendingPage ||
      pathname === '/login' ||
      pathname === '/' ||
      pathname === '/pricing' ||
      pathname.startsWith('/letter/')
    if (accountDeletedAt && !exempt) {
      router.replace('/account/deletion-pending')
    }
  }, [accountDeletedAt, pathname, isDeletionPendingPage, router])
```

The pending page is full-bleed; route it like onboarding so it gets the themed Background but no nav. Add to the chrome branches (near the `isOnboardingPage` block):

```tsx
  if (isDeletionPendingPage) {
    return (
      <>
        <Background />
        {children}
      </>
    )
  }
```
Place this return alongside the other early full-bleed returns (after `mounted` guard, before the default `return`). Also declare `const isDeletionPendingPage = pathname === '/account/deletion-pending'` with the other `is...Page` consts if not already added above.

- [ ] **Step 3: Type-check & build**

```bash
docker compose exec app npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/account/deletion-pending/page.tsx src/components/LayoutContent.tsx
git commit -m "feat(account): deletion-pending screen + login-time gate"
```

---

## Task 12: Delete button — modal + /me danger zone

**Files:**
- Create: `src/components/account/DeleteAccountModal.tsx`
- Modify: `src/app/me/page.tsx`

- [ ] **Step 1: Build the confirm modal**

```tsx
// src/components/account/DeleteAccountModal.tsx
'use client'

import { useState } from 'react'

export default function DeleteAccountModal({
  userEmail,
  onClose,
}: {
  userEmail: string
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim().toLowerCase() === userEmail.toLowerCase()

  const handleDelete = async () => {
    if (!matches) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: typed.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      // Signed out server-side intent; clear client session and leave.
      const { useAuthStore } = await import('@/store/auth')
      await useAuthStore.getState().logout()
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={onClose}>
      <div
        className="max-w-md w-full rounded-2xl bg-[#1a1215] text-[#f5e6d3] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-light mb-3">Delete your account</h2>
        <p className="text-sm text-[#d8c4ae] leading-relaxed mb-2">
          This schedules your account for permanent deletion in <strong>14 days</strong>. Your
          journal, letters, scrapbook, and photos will all be erased.
        </p>
        <p className="text-sm text-[#d8c4ae] leading-relaxed mb-2">
          If you have premium, billing stops now — you keep access through your current period.
          You can restore everything by logging in before the 14 days are up.
        </p>
        <p className="text-sm text-[#d8c4ae] leading-relaxed mb-4">
          Type your email <strong className="text-[#f5e6d3]">{userEmail}</strong> to confirm.
        </p>
        <input
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-3 py-2 rounded-lg bg-[#0f0a0c] text-[#f5e6d3] border border-[#3a2a30] mb-3 outline-none"
        />
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-full text-sm text-[#d8c4ae] border border-[#3a2a30]"
          >
            Keep my account
          </button>
          <button
            onClick={handleDelete}
            disabled={!matches || submitting}
            className="flex-1 py-2.5 rounded-full text-sm font-medium bg-red-600 text-white disabled:opacity-40"
          >
            {submitting ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the danger zone to /me**

In `src/app/me/page.tsx`: import the modal and add state at the top of `MePage`:

```tsx
import DeleteAccountModal from '@/components/account/DeleteAccountModal'
```
Inside `MePage`, near the other hooks:

```tsx
  const [showDeleteModal, setShowDeleteModal] = useState(false)
```
Just after the existing Sign out button (`onClick={logout}`, around line 652), add a danger-zone block:

```tsx
        <div className="mt-10 pt-6 border-t border-red-900/30">
          <button
            onClick={() => setShowDeleteModal(true)}
            className="text-sm text-red-400/80 hover:text-red-400 transition-colors"
          >
            Delete my account
          </button>
        </div>
        {showDeleteModal && user && (
          <DeleteAccountModal userEmail={user.email} onClose={() => setShowDeleteModal(false)} />
        )}
```
(Ensure `useState` is imported in `me/page.tsx` — it almost certainly already is.)

- [ ] **Step 3: Type-check & build**

```bash
docker compose exec app npx tsc --noEmit
docker compose restart app
```

- [ ] **Step 4: Manual verification (full happy path, dev mode)**

Use a SECONDARY throwaway account (NOT the canonical `.dev-creds.local` account, which you want to keep). Steps:
1. Log in as the throwaway account → go to `/me` → "Delete my account".
2. Type the wrong email → "Delete forever" stays disabled. Type the right email → enabled.
3. Confirm → you're logged out and sent to `/login`.
4. Check Studio: the user row has `deletedAt` set; entries still present.
5. Log back in → you land on `/account/deletion-pending` showing the purge date.
6. Click "Restore my account" → back to `/` → `/me` works normally; Studio shows `deletedAt = null`.
7. (Optional) Re-delete, set `deletedAt` back >14d in Studio, run the purge cron from Task 8 Step 3, confirm the row + entries are gone.

- [ ] **Step 5: Commit**

```bash
git add src/components/account/DeleteAccountModal.tsx src/app/me/page.tsx
git commit -m "feat(account): delete-account modal + /me danger zone"
```

---

## Task 13: Cron registration + env/docs

**Files:**
- Modify: `CLAUDE.md` (cron list / Letters or cron section)
- Modify: `.env.example` (confirm `SUPABASE_SERVICE_ROLE_KEY` documented)

Hearth has no `vercel.json`; existing crons (`send-reminders`, `letter-cleanup`, etc.) are triggered by an external scheduler. Register `purge-accounts` the same way the other crons are scheduled.

- [ ] **Step 1: Find how existing crons are scheduled and add this one**

```bash
grep -rn "cron\|send-reminders\|letter-cleanup" README.md docs/ 2>/dev/null | head
```
Add a **daily** schedule for `GET /api/cron/purge-accounts` with the `Authorization: Bearer $CRON_SECRET` header, alongside the other cron jobs in whatever scheduler config the project uses (external dashboard or docs). If a docs file lists crons, add a row for `purge-accounts` (daily).

- [ ] **Step 2: Confirm env documentation**

Ensure `.env.example` documents `SUPABASE_SERVICE_ROLE_KEY` (already used by the storage adapter) and that it's set in the production/staging cron runtime — the purge cron's Supabase auth + storage cleanup needs it. Add a one-line comment noting purge-accounts depends on it if not present.

- [ ] **Step 3: Note the new cron in CLAUDE.md**

In the cron-related notes, add: `purge-accounts` (daily) — permanently deletes accounts past their 14-day deletion grace window.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .env.example docs 2>/dev/null
git commit -m "docs(account): register purge-accounts cron + env notes"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** schema (T1), Dodo cancel-at-period-end (T2), Supabase auth purge (T3), storage purge (T4), email (T5), delete request incl. email-match + idempotency + best-effort cancel (T6), restore (T7), purge cron with external-before-DB ordering + defensive re-cancel (T8), dunning suppression (T9), client `deletedAt` exposure (T10), login gate + pending screen (T11), confirm modal + /me danger zone (T12), cron registration + env (T13). All spec sections mapped.
- **Cancel mode:** every reference uses cancel-at-period-end (`cancel_at_next_billing_date`), consistent with `isPaidUser` keeping `status==='active'` entitled through `currentPeriodEnd`.
- **Naming consistency:** `cancelSubscription`, `deleteAuthUserByEmail`, `purgeUserStorage`, `sendAccountDeletionScheduledEmail`, `accountDeletedAt`, `GRACE_DAYS = 14` used identically across tasks.
- **Open verifications flagged inline:** exact Dodo cancel param (T2 S1), `listUsers` signature (T3 S2), theme property names (T11 S1), scheduler mechanism (T13 S1).
```
