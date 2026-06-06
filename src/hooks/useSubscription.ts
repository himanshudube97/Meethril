'use client'

import { useState, useEffect, useCallback } from 'react'

interface SubscriptionData {
  isPremium: boolean
  plan: 'monthly' | 'yearly' | 'test' | null
  status: string | null
  currentPeriodEnd: string | null
  // Operator/admin (ADMIN_EMAILS). Display-only — gates re-check server-side.
  isAdmin: boolean
}

interface UseSubscriptionReturn extends SubscriptionData {
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useSubscription(): UseSubscriptionReturn {
  const [data, setData] = useState<SubscriptionData>({
    isPremium: false,
    plan: null,
    status: null,
    currentPeriodEnd: null,
    isAdmin: false,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSubscription = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch('/api/subscription/status')

      if (!response.ok) {
        if (response.status === 401) {
          // Not logged in, that's okay
          setData({
            isPremium: false,
            plan: null,
            status: null,
            currentPeriodEnd: null,
            isAdmin: false,
          })
          return
        }
        throw new Error('Failed to fetch subscription status')
      }

      const result = await response.json()
      setData({
        isPremium: result.isPremium,
        plan: result.plan,
        status: result.status,
        currentPeriodEnd: result.currentPeriodEnd,
        isAdmin: Boolean(result.isAdmin),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Fetch-on-mount; setState fires inside the async callback, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSubscription()
  }, [fetchSubscription])

  return {
    ...data,
    isLoading,
    error,
    refresh: fetchSubscription,
  }
}

export async function createCheckoutSession(
  priceId: 'monthly' | 'yearly' | 'test'
): Promise<string> {
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priceId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create checkout session')
  }

  const { url } = await response.json()
  return url
}

export async function openBillingPortal(): Promise<string> {
  const response = await fetch('/api/billing-portal', {
    method: 'POST',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to open billing portal')
  }

  const { url } = await response.json()
  return url
}
