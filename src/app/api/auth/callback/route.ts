import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/auth/supabase/server'
import { prisma } from '@/lib/db'
import { hasCompletedE2EEOnboarding } from '@/lib/auth'
import { E2EE_ONBOARDED_COOKIE, E2EE_COOKIE_OPTS } from '@/lib/auth/e2ee-cookie'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user?.email) {
      // Sync user to our database
      let dbUser = await prisma.user.findUnique({
        where: { email: data.user.email },
        select: {
          e2eeEnabled: true,
          encryptedMasterKey: true,
          recoveryKeyHash: true,
        },
      })

      if (!dbUser) {
        const provider = data.user.app_metadata?.provider || 'email'
        dbUser = await prisma.user.create({
          data: {
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
            avatar: data.user.user_metadata?.avatar_url || null,
            provider,
          },
          select: {
            e2eeEnabled: true,
            encryptedMasterKey: true,
            recoveryKeyHash: true,
          },
        })
      }

      const response = NextResponse.redirect(`${origin}${redirect}`)

      // Sync E2EE onboarding status into a hint cookie so middleware can gate
      // /onboarding without a Prisma call.
      if (hasCompletedE2EEOnboarding(dbUser)) {
        response.cookies.set(E2EE_ONBOARDED_COOKIE, '1', E2EE_COOKIE_OPTS)
      } else {
        response.cookies.delete(E2EE_ONBOARDED_COOKIE)
      }

      return response
    }
  }

  // Auth failed, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
