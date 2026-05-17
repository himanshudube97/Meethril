import { NextResponse } from 'next/server'
import { isDevAuth, AUTH_COOKIE_NAME } from '@/lib/auth/config'
import { createClient } from '@/lib/auth/supabase/server'
import { E2EE_ONBOARDED_COOKIE } from '@/lib/auth/e2ee-cookie'

export async function POST() {
  const response = NextResponse.json({ success: true })

  if (isDevAuth) {
    // Clear dev auth cookie
    response.cookies.set(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
  } else {
    // Sign out of Supabase
    const supabase = await createClient()
    await supabase.auth.signOut()
  }

  // Clear E2EE hint cookie on logout (both dev and Supabase paths)
  response.cookies.set(E2EE_ONBOARDED_COOKIE, '', { maxAge: 0, path: '/' })

  return response
}
