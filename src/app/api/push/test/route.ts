import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

let configured = false
function configureVapid() {
  if (configured) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT || 'mailto:support@hearth.app'
  if (!pub || !priv) throw new Error('VAPID keys not configured')
  webpush.setVapidDetails(subj, pub, priv)
  configured = true
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    configureVapid()
  } catch {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const sub = await prisma.pushSubscription.findFirst({
    where: { userId: user.id, pausedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 })

  const payload = JSON.stringify({
    title: 'meethril',
    body: 'this is what a gentle nudge feels like.',
  })

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    // 410 Gone = subscription expired; clean it up
    if (statusCode === 410 || statusCode === 404) {
      await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => {})
      return NextResponse.json({ error: 'Subscription expired, removed' }, { status: 410 })
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Send failed', detail: message }, { status: 500 })
  }
}
