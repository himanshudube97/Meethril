// src/lib/billing/is-paid-user.ts
export function isPaidUser(user: {
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
}): boolean {
  if (!user.subscriptionStatus) return false
  if (!['active', 'on_trial'].includes(user.subscriptionStatus)) return false
  if (user.currentPeriodEnd && user.currentPeriodEnd.getTime() < Date.now()) return false
  return true
}
