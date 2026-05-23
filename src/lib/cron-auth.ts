import { NextRequest, NextResponse } from 'next/server'

// Fail-closed cron auth.
//
// The earlier pattern `if (process.env.CRON_SECRET && authHeader !== ...)`
// was vacuously true when the secret was unset, leaving the route fully
// open to anyone. This helper:
//   - rejects with 500 in production if the secret is not configured
//   - rejects with 401 in any environment when the header doesn't match
//   - allows requests through only when the header exactly matches
//
// Use at the top of every /api/cron/* route handler:
//   const unauthorized = checkCronAuth(req)
//   if (unauthorized) return unauthorized
export function checkCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'cron not configured' }, { status: 500 })
    }
    // Dev/test: refuse silently rather than fail-open. Routes can be invoked
    // by manually setting a temporary CRON_SECRET in .env.
    return NextResponse.json({ error: 'cron secret not set' }, { status: 401 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
