import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import * as jose from 'jose'
import { isEmailVerified } from '@/lib/auth/email-verified'

const PUBLIC_PATHS = [
  '/login',
  '/onboarding',
  '/api/auth',
  '/api/cron',
  '/api/webhooks',
  '/api/webhooks/lemonsqueezy',
  '/api/letter',
  '/api/download',
  '/letter',
]
const PUBLIC_EXACT_PATHS = ['/', '/pricing', '/forgot', '/reset', '/verify', '/download']

// Must stay in sync with E2EE_ONBOARDED_COOKIE in src/lib/auth/e2ee-cookie.ts.
// Kept local here so middleware stays safe on the edge runtime.
const E2EE_ONBOARDED_COOKIE = 'hearth-e2ee-onboarded'
const STATIC_PATHS = ['/_next', '/favicon.ico', '/images', '/icons', '/manifest.json', '/sw.js', '/workbox']

const isDevAuth = process.env.USE_DEV_AUTH === 'true'
const DEV_JWT_SECRET = process.env.DEV_JWT_SECRET || 'dev-secret-key-for-local-development-only-min-32-chars'
const AUTH_COOKIE_NAME = 'hearth-auth-token'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (STATIC_PATHS.some(path => pathname.startsWith(path))) return passThrough(request)
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) return passThrough(request)
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return passThrough(request)

  if (isDevAuth) {
    const authenticated = await checkDevAuth(request)
    if (!authenticated) return unauthorized(request, pathname)
    return applyE2EEGate(request, pathname, passThrough(request))
  }

  return checkSupabaseAuth(request, pathname)
}

// Strip any client-supplied x-hearth-* auth headers before forwarding the
// request to a route handler. Without this, /api/auth/me (which bypasses
// auth checks) would be impersonable by setting these headers on the request.
function scrubAuthHeaders(request: NextRequest): Headers {
  const h = new Headers(request.headers)
  h.delete('x-hearth-user-id')
  h.delete('x-hearth-user-email')
  return h
}

function passThrough(request: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: scrubAuthHeaders(request) } })
}

async function checkDevAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!token) return false
  try {
    const secret = new TextEncoder().encode(DEV_JWT_SECRET)
    await jose.jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}

async function checkSupabaseAuth(request: NextRequest, pathname: string): Promise<NextResponse> {
  const forwardHeaders = scrubAuthHeaders(request)

  // Capture cookies that Supabase wants to set during getUser() (session
  // refresh) and apply them to the final response below, so we only build
  // one outgoing response.
  type CookieToSet = { name: string; value: string; options: Parameters<typeof NextResponse.prototype.cookies.set>[2] }
  let pendingCookies: CookieToSet[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          pendingCookies = cookiesToSet as CookieToSet[]
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return unauthorized(request, pathname)

  if (!isEmailVerified(user)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Email not verified' }, { status: 403 })
    }
    const verifyUrl = new URL('/verify', request.url)
    return NextResponse.redirect(verifyUrl)
  }

  // Forward the verified identity so route handlers can skip a redundant
  // supabase.auth.getUser() round-trip. scrubAuthHeaders() above already
  // stripped any client-supplied versions of these.
  forwardHeaders.set('x-hearth-user-id', user.id)
  if (user.email) forwardHeaders.set('x-hearth-user-email', user.email)

  const response = NextResponse.next({ request: { headers: forwardHeaders } })
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  )
  return applyE2EEGate(request, pathname, response)
}

/**
 * After a user is confirmed authenticated, redirect them to /onboarding if
 * they haven't completed E2EE setup (cookie missing), or away from /onboarding
 * if they already have (cookie present). This keeps Prisma out of middleware.
 */
function applyE2EEGate(request: NextRequest, pathname: string, passThroughResponse: NextResponse): NextResponse {
  const onboarded = request.cookies.get(E2EE_ONBOARDED_COOKIE)?.value === '1'

  // Already on /onboarding (or a sub-path) and onboarded → send to /me
  if (onboarded && pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/me', request.url))
  }

  // Not onboarded, not already heading to /onboarding, not an API call → gate
  if (!onboarded && !pathname.startsWith('/onboarding') && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  return passThroughResponse
}

function unauthorized(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|workbox-.*\\.js|icons/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
