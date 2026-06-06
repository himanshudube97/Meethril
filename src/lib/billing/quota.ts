// src/lib/billing/quota.ts
//
// Billing-anchored monthly usage quotas. See the design doc:
// docs/superpowers/plans/2026-05-30-platform-limits-and-dodo-billing.md
//
// Window model: a monthly window anchored to a day-of-month.
//   - Free users  → anchor day 1 (calendar month, resets on the 1st).
//   - Paid users  → anchor day = day-of-month of currentPeriodEnd
//                   (Dodo's next_billing_date). Monthly subs align with their
//                   billing period; yearly subs still get monthly buckets
//                   because only the day-of-month is used.
// Boundaries are computed in the user's IANA tz; counts use the real UTC
// createdAt. We COUNT live within the window (no stored counter) so duplicate /
// out-of-order / missed webhooks can never corrupt a quota.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isPaidUser } from '@/lib/billing/is-paid-user'
import { isAdminEmail } from '@/lib/auth/admin'
import { limitsFor, MONTHLY_LIMIT_KEY, type QuotaFeature } from '@/lib/billing/limits'
import { utcInstantForLocalDate, localDatePartsNow } from '@/lib/entry-lock'

function daysInMonth(year: number, month0: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/** day-of-month (1-31) of a date, evaluated in the given IANA tz. */
export function dayOfMonthInTz(date: Date, tz: string): number {
  try {
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' }).format(date)
    return parseInt(s, 10)
  } catch {
    return date.getUTCDate()
  }
}

export interface MonthlyWindow {
  start: Date // inclusive (UTC instant)
  end: Date // exclusive (UTC instant) — also the reset time
}

/**
 * The current [start, end) window for a monthly quota anchored to `anchorDay`,
 * evaluated in the user's tz. Clamps the anchor to the last day of short months
 * (so a 31 anchor lands on Feb-28/29, Apr-30, …), matching Stripe/Dodo billing.
 */
export function currentMonthlyWindow(anchorDay: number, tz: string = 'UTC'): MonthlyWindow {
  const { year, month0, day } = localDatePartsNow(tz)
  const clamp = (y: number, m0: number) => Math.min(anchorDay, daysInMonth(y, m0))

  // Decide which month the current window STARTED in.
  let startY = year
  let startM0 = month0
  if (day < clamp(year, month0)) {
    // We're before this month's anchor → window began last month.
    startM0 = month0 - 1
    if (startM0 < 0) {
      startM0 = 11
      startY = year - 1
    }
  }

  // End = the following month's (clamped) anchor.
  let endY = startY
  let endM0 = startM0 + 1
  if (endM0 > 11) {
    endM0 = 0
    endY = startY + 1
  }

  const start = utcInstantForLocalDate(startY, startM0, clamp(startY, startM0), tz)
  const end = utcInstantForLocalDate(endY, endM0, clamp(endY, endM0), tz)
  return { start, end }
}

export interface QuotaResult {
  feature: QuotaFeature
  allowed: boolean
  used: number
  limit: number // may be Infinity (unlimited)
  isPaid: boolean
  window: MonthlyWindow
}

/** Count existing rows for a feature within [start, end). */
async function countUsage(
  userId: string,
  feature: QuotaFeature,
  start: Date,
  end: Date,
): Promise<number> {
  const createdAt = { gte: start, lt: end }
  switch (feature) {
    case 'journal':
      return prisma.journalEntry.count({
        where: { userId, entryType: 'normal', isArchived: false, createdAt },
      })
    case 'scrapbook':
      return prisma.scrapbook.count({ where: { userId, createdAt } })
    case 'letterSelf':
      return prisma.letter.count({
        where: { userId, letterType: 'self', isSealed: true, isArchived: false, createdAt },
      })
    case 'letterFriend':
      return prisma.letter.count({
        where: { userId, letterType: 'friend', isSealed: true, isArchived: false, createdAt },
      })
  }
}

/**
 * Resolve a user's tier + window and count their current usage of `feature`.
 * `allowed` is true when they can create ONE more (used < limit).
 */
export async function checkQuota(
  userId: string,
  feature: QuotaFeature,
  tz: string = 'UTC',
): Promise<QuotaResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, subscriptionStatus: true, currentPeriodEnd: true, complimentaryAccess: true },
  })

  const isPaid = user ? isPaidUser({ ...user, isAdmin: isAdminEmail(user.email) }) : false
  const limit = limitsFor(isPaid)[MONTHLY_LIMIT_KEY[feature]] as number

  const anchorDay = isPaid && user?.currentPeriodEnd ? dayOfMonthInTz(user.currentPeriodEnd, tz) : 1
  const window = currentMonthlyWindow(anchorDay, tz)

  if (!Number.isFinite(limit)) {
    // Unlimited (e.g. paid journals) — skip the COUNT entirely.
    return { feature, allowed: true, used: 0, limit, isPaid, window }
  }

  const used = await countUsage(userId, feature, window.start, window.end)
  return { feature, allowed: used < limit, used, limit, isPaid, window }
}

/** Standard 429 body for an exhausted monthly quota. */
export function quotaExceededResponse(q: QuotaResult): NextResponse {
  return NextResponse.json(
    {
      error: 'limit_reached',
      feature: q.feature,
      used: q.used,
      limit: q.limit,
      isPaid: q.isPaid,
      resetAt: q.window.end.toISOString(),
    },
    { status: 429 },
  )
}
