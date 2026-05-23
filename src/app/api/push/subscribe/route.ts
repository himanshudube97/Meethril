import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest | Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const auth = body?.keys?.auth
  const userAgent = body?.userAgent ?? null
  const tz = body?.tz ?? 'UTC'

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
  }

  // Wipe any stale rows for this user before upserting the current endpoint.
  // Without this, an old (now-dead) endpoint can stay in the DB and the cron /
  // test routes can encrypt with its keys, leading to silently-dropped pushes.
  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({
      where: { userId: user.id, NOT: { endpoint } },
    }),
    prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh, auth, userAgent, tz },
      update: {
        userId: user.id,
        p256dh,
        auth,
        userAgent,
        tz,
        pausedAt: null,
        consecutiveIgnored: 0,
      },
    }),
  ])

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest | Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const endpoint = body?.endpoint
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  // Scope by userId — previously this deleted by endpoint alone, which let
  // any authenticated user silence anyone else's push reminders if they
  // could guess or obtain the raw endpoint URL.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  })
  return NextResponse.json({ ok: true })
}
