// src/lib/billing/is-paid-user.ts
//
// Canonical "is this user currently entitled to paid features?" check.
// Single source of truth — the subscription-status endpoint, the quota
// system, and any pay-gated route (e.g. letters ask-for-copy) all call this.
//
// `currentPeriodEnd` holds Dodo's raw `next_billing_date`. We apply two kinds
// of slack here (never baked into the stored value):
//   - ACCESS_LEEWAY: absorbs webhook lag / clock skew right around renewal so
//     an active subscriber isn't briefly dropped if the `renewed` webhook is
//     slightly late.
//   - GRACE: when a renewal payment FAILS (status `on_hold`), the user keeps
//     paid access for a few days so they can update their card.

const DAY_MS = 24 * 60 * 60 * 1000
const ACCESS_LEEWAY_MS = 2 * DAY_MS
const GRACE_MS = 4 * DAY_MS // failed-payment grace window

export function isPaidUser(user: {
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
  // Friends & family / comps: full paid tier, no subscription, no expiry.
  complimentaryAccess?: boolean | null
  // Operator/admin (ADMIN_EMAILS): auto-entitled to the full paid tier so we
  // can dogfood paid features without a subscription. Computed by callers via
  // isAdminEmail(email) — kept out of this pure function so it stays testable.
  isAdmin?: boolean | null
}): boolean {
  // Admin trumps everything — operators always have the paid tier.
  if (user.isAdmin) return true

  // Complimentary access trumps everything — entitled regardless of any
  // subscription state. There is no expiry; revoke by clearing the flag.
  if (user.complimentaryAccess) return true

  const status = user.subscriptionStatus
  if (!status) return false

  const end = user.currentPeriodEnd ? new Date(user.currentPeriodEnd).getTime() : null
  const now = Date.now()

  // Active (or legacy LS trial): entitled through the period end + leeway.
  // Cancel-at-period-end keeps status "active" until the end, so this also
  // covers "cancelled but still within the paid period".
  if (status === 'active' || status === 'on_trial') {
    return end === null || now <= end + ACCESS_LEEWAY_MS
  }

  // Failed renewal: keep paid through the grace window after the period end.
  // ('past_due' kept as an alias in case any legacy row used it.)
  if (status === 'on_hold' || status === 'past_due') {
    return end !== null && now <= end + GRACE_MS
  }

  // cancelled / expired / pending / anything else → not paid.
  return false
}
