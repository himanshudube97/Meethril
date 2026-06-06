// src/lib/auth/admin.ts
//
// Single source of truth for "is this email an operator/admin?".
//
// Admins are defined by the server-only ADMIN_EMAILS env var (comma-separated,
// case-insensitive). It is intentionally NOT prefixed NEXT_PUBLIC_ so it never
// ships to the browser — every real gate calls isAdminEmail() on the SERVER
// (checkout, letter routes, entitlement). The frontend only mirrors the result
// (via /api/subscription/status) to show/hide UI; tampering with that mirror in
// the dev console unlocks nothing because the backend re-checks.
//
// Admin is a capability flag (test affordances + auto-Premium), NOT the same as
// the per-user complimentaryAccess DB flag (friends & family comps). See
// lib/billing/is-paid-user.ts for how both feed entitlement.

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  const set = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return set.includes(email.trim().toLowerCase())
}
