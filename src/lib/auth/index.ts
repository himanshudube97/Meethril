import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { isDevAuth, AUTH_COOKIE_NAME } from './config'
import { verifyDevToken } from './dev-auth'
import { createClient as createSupabaseClient } from './supabase/server'
import { isEmailVerified } from './email-verified'
import { prisma } from '@/lib/db'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  avatar: string | null
  provider: string
}

// React's cache() memoizes per-request, so multiple getCurrentUser() calls
// within the same handler/page render share one result instead of each
// hitting Supabase.
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  if (isDevAuth) {
    return getDevUser()
  }
  return getSupabaseUser()
})

async function getDevUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  const payload = await verifyDevToken(token)
  if (!payload) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  })

  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    provider: user.provider,
  }
}

async function getSupabaseUser(): Promise<AuthUser | null> {
  // Fast path: middleware already validated the JWT and forwarded the
  // verified email via x-hearth-user-email. Skip the Supabase round-trip
  // and just look up the local user record. Middleware scrubs any
  // client-supplied version of this header, so it's trustworthy here.
  const headerStore = await headers()
  const verifiedEmail = headerStore.get('x-hearth-user-email')
  if (verifiedEmail) {
    const existing = await prisma.user.findUnique({ where: { email: verifiedEmail } })
    if (existing) {
      return {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        avatar: existing.avatar,
        provider: existing.provider,
      }
    }
    // First-time sign-in for a verified user: fall through to the slow
    // path so we can read their full profile (name, avatar, provider) from
    // Supabase and create the local row.
  }

  const supabase = await createSupabaseClient()
  const { data: { user: supabaseUser } } = await supabase.auth.getUser()

  if (!supabaseUser?.email) {
    return null
  }

  // Block API access until the email is verified. Middleware redirects
  // page navigation to /verify; API callers see null user and respond 401.
  if (!isEmailVerified(supabaseUser)) {
    return null
  }

  // Find or create user in our database
  let user = await prisma.user.findUnique({
    where: { email: supabaseUser.email },
  })

  if (!user) {
    const provider = supabaseUser.app_metadata?.provider || 'email'
    user = await prisma.user.create({
      data: {
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.full_name || supabaseUser.email.split('@')[0],
        avatar: supabaseUser.user_metadata?.avatar_url || null,
        provider,
      },
    })
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    provider: user.provider,
  }
}

export { isDevAuth } from './config'

/**
 * Returns true if the user has completed mandatory E2EE setup.
 * A user is "onboarded" when they have both an encryptedMasterKey (passphrase wrap)
 * and a recoveryKeyHash (recovery key was generated and acknowledged saved).
 */
export function hasCompletedE2EEOnboarding(user: {
  e2eeEnabled: boolean
  encryptedMasterKey: string | null
  recoveryKeyHash: string | null
}): boolean {
  return (
    user.e2eeEnabled &&
    user.encryptedMasterKey !== null &&
    user.recoveryKeyHash !== null
  )
}
