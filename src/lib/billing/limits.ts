// src/lib/billing/limits.ts
//
// Free vs paid usage limits for the platform (GitHub issue #54).
// See docs/superpowers/plans/2026-05-30-platform-limits-and-dodo-billing.md.
//
// All "per month" limits are enforced against a billing-anchored monthly
// window (see quota.ts). Stranger notes are per local day and enforced in
// their own route via the pre-existing daily counter — only the ceiling is
// tier-dependent (strangerNotesPerDay).

export type QuotaFeature = 'journal' | 'scrapbook' | 'letterSelf' | 'letterFriend'

export interface PlanLimits {
  /** Journal entries per monthly window. Paid is effectively unlimited (the
   *  one-entry-per-calendar-day rule in POST /api/entries still applies). */
  journalPerMonth: number
  scrapbookPerMonth: number
  letterSelfPerMonth: number
  letterFriendPerMonth: number
  /** New stranger threads per local calendar day. */
  strangerNotesPerDay: number
}

export const FREE_LIMITS: PlanLimits = {
  journalPerMonth: 15,
  scrapbookPerMonth: 10,
  letterSelfPerMonth: 2,
  letterFriendPerMonth: 10,
  strangerNotesPerDay: 1,
}

export const PAID_LIMITS: PlanLimits = {
  journalPerMonth: Infinity, // only the 1/calendar-day rule caps paid journals
  scrapbookPerMonth: 30,
  letterSelfPerMonth: 10,
  letterFriendPerMonth: 20,
  strangerNotesPerDay: 5,
}

/** Map a per-month quota feature to its PlanLimits field. */
export const MONTHLY_LIMIT_KEY: Record<QuotaFeature, keyof PlanLimits> = {
  journal: 'journalPerMonth',
  scrapbook: 'scrapbookPerMonth',
  letterSelf: 'letterSelfPerMonth',
  letterFriend: 'letterFriendPerMonth',
}

export function limitsFor(isPaid: boolean): PlanLimits {
  return isPaid ? PAID_LIMITS : FREE_LIMITS
}
