import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isDevAuth, AUTH_COOKIE_NAME } from '@/lib/auth/config'
import { createDevToken } from '@/lib/auth/dev-auth'
import { createClient } from '@/lib/auth/supabase/server'
import { hasCompletedE2EEOnboarding } from '@/lib/auth'
import { E2EE_ONBOARDED_COOKIE, E2EE_COOKIE_OPTS } from '@/lib/auth/e2ee-cookie'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, password, token, action, redirectTo } = body

  if (isDevAuth) {
    return handleDevLogin(email, redirectTo)
  }

  switch (action) {
    case 'email_login':
      return handleEmailLogin(email, password, redirectTo)
    case 'email_signup':
      return handleEmailSignup(email, password)
    case 'verify_otp':
      return handleVerifyOtp(email, token, redirectTo)
    default:
      return handleGoogleLogin(redirectTo)
  }
}

async function handleDevLogin(email: string, redirectTo?: string) {
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      provider: true,
      e2eeEnabled: true,
      encryptedMasterKey: true,
      recoveryKeyHash: true,
    },
  })

  if (!user) {
    user = await prisma.user.create({
      data: { email, name: email.split('@')[0], provider: 'dev' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        provider: true,
        e2eeEnabled: true,
        encryptedMasterKey: true,
        recoveryKeyHash: true,
      },
    })
  }

  const token = await createDevToken({
    id: user.id,
    email: user.email,
    name: user.name || email.split('@')[0],
  })

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
    redirectTo: redirectTo || '/write',
  })

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })

  // Sync E2EE onboarding status into a hint cookie so middleware can gate
  // /onboarding without a Prisma call.
  if (hasCompletedE2EEOnboarding(user)) {
    response.cookies.set(E2EE_ONBOARDED_COOKIE, '1', E2EE_COOKIE_OPTS)
  } else {
    response.cookies.delete(E2EE_ONBOARDED_COOKIE)
  }

  return response
}

async function handleEmailLogin(email: string, password: string, redirectTo?: string) {
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Sync user to our DB and fetch E2EE fields
  let dbUser: { e2eeEnabled: boolean; encryptedMasterKey: string | null; recoveryKeyHash: string | null } | null = null
  if (data.user?.email) {
    dbUser = await prisma.user.findUnique({
      where: { email: data.user.email },
      select: { e2eeEnabled: true, encryptedMasterKey: true, recoveryKeyHash: true },
    })
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
          avatar: data.user.user_metadata?.avatar_url || null,
          provider: 'email',
        },
        select: { e2eeEnabled: true, encryptedMasterKey: true, recoveryKeyHash: true },
      })
    }
  }

  const response = NextResponse.json({ success: true, redirectTo: redirectTo || '/write' })

  // Sync E2EE onboarding status into a hint cookie so middleware can gate
  // /onboarding without a Prisma call.
  if (dbUser && hasCompletedE2EEOnboarding(dbUser)) {
    response.cookies.set(E2EE_ONBOARDED_COOKIE, '1', E2EE_COOKIE_OPTS)
  } else {
    response.cookies.delete(E2EE_ONBOARDED_COOKIE)
  }

  return response
}

async function handleEmailSignup(email: string, password: string) {
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    success: true,
    requiresOtp: true,
    message: 'Check your email for a verification code.',
  })
}

async function handleVerifyOtp(email: string, token: string, redirectTo?: string) {
  if (!email || !token) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Create user in our DB on first verify and fetch E2EE fields
  let dbUser: { e2eeEnabled: boolean; encryptedMasterKey: string | null; recoveryKeyHash: string | null } | null = null
  if (data.user?.email) {
    dbUser = await prisma.user.findUnique({
      where: { email: data.user.email },
      select: { e2eeEnabled: true, encryptedMasterKey: true, recoveryKeyHash: true },
    })
    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
          avatar: data.user.user_metadata?.avatar_url || null,
          provider: 'email',
        },
        select: { e2eeEnabled: true, encryptedMasterKey: true, recoveryKeyHash: true },
      })
    }
  }

  const response = NextResponse.json({ success: true, redirectTo: redirectTo || '/write' })

  // Sync E2EE onboarding status into a hint cookie so middleware can gate
  // /onboarding without a Prisma call.
  if (dbUser && hasCompletedE2EEOnboarding(dbUser)) {
    response.cookies.set(E2EE_ONBOARDED_COOKIE, '1', E2EE_COOKIE_OPTS)
  } else {
    response.cookies.delete(E2EE_ONBOARDED_COOKIE)
  }

  return response
}

async function handleGoogleLogin(redirectTo?: string) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/callback?redirect=${redirectTo || '/'}`,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, url: data.url })
}
