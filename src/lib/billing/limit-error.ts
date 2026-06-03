// src/lib/billing/limit-error.ts
//
// Client-side helper for the 429 "limit_reached" body that the gated POST
// routes return (see quota.ts → quotaExceededResponse). Lets any call site
// detect a quota block and surface an upgrade prompt instead of a generic error.

import type { QuotaFeature } from '@/lib/billing/limits'

export interface LimitReached {
  feature: QuotaFeature
  used: number
  limit: number
  isPaid: boolean
  resetAt: string
}

/**
 * If `res` is a 429 quota block, parse and return its details; otherwise null.
 * Usage:
 *   const res = await fetch(...)
 *   const limit = await parseLimitError(res)
 *   if (limit) { showUpgradePrompt(limit); return }
 */
export async function parseLimitError(res: Response): Promise<LimitReached | null> {
  if (res.status !== 429) return null
  try {
    const body = await res.clone().json()
    if (body?.error === 'limit_reached') {
      return {
        feature: body.feature,
        used: body.used,
        limit: body.limit,
        isPaid: Boolean(body.isPaid),
        resetAt: body.resetAt,
      }
    }
  } catch {
    // not our shape
  }
  return null
}

const FEATURE_LABEL: Record<QuotaFeature, string> = {
  journal: 'journal entries',
  scrapbook: 'scrapbooks',
  letterSelf: 'letters to yourself',
  letterFriend: 'letters to friends',
}

/** Human-readable message for a limit block. */
export function limitMessage(l: LimitReached): string {
  const label = FEATURE_LABEL[l.feature] ?? 'items'
  const reset = l.resetAt ? new Date(l.resetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null
  const base = `You've used all ${l.limit} ${label} for this month.`
  if (l.isPaid) {
    return reset ? `${base} Your limit resets on ${reset}.` : base
  }
  return `${base} Upgrade to Meethril premium for more${reset ? `, or wait until ${reset}` : ''}.`
}
