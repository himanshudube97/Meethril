import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { prisma } from '@/lib/db'
import { isCurrentWindowTarget, targetMinutesPastSeven } from '@/lib/reminder-schedule'
import { pickReminderLine, REMINDER_TITLE } from '@/lib/reminder-messages'
import { decryptJson } from '@/lib/encryption'
import { checkCronAuth } from '@/lib/cron-auth'
import { localWallClockISO, localDateStr, startOfLocalDayUTC } from '@/lib/tz'

let configured = false
function configureVapid() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:himanshu@meethril.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export async function GET(request: NextRequest | Request) {
  const unauthorized = checkCronAuth(request as NextRequest)
  if (unauthorized) return unauthorized

  try {
    configureVapid()
  } catch {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 })
  }

  const now = new Date()

  // Step 1: auto-pause anyone at or past 7 ignored
  const pauseResult = await prisma.pushSubscription.updateMany({
    where: { pausedAt: null, consecutiveIgnored: { gte: 7 } },
    data: { pausedAt: now },
  })

  // Step 2: load active subscriptions
  const subs = await prisma.pushSubscription.findMany({
    where: { pausedAt: null },
  })

  // Step 2b: batch-fetch user profiles and most-recent entry per user.
  // The earlier version issued 3 sequential Prisma queries per subscriber,
  // which timed out at scale on Vercel's 10s budget. Now we do 2 calls total
  // and look up per-user in memory inside the loop.
  const userIds = Array.from(new Set(subs.map((s) => s.userId)))
  const [users, latestEntries] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, profile: true },
    }),
    prisma.journalEntry.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['userId'],
    }),
  ])
  const userById = new Map(users.map((u) => [u.id, u]))
  const latestEntryByUser = new Map(latestEntries.map((e) => [e.userId, e.createdAt]))

  let fired = 0
  let skippedAlreadyJournaled = 0
  let skippedNotInWindow = 0
  let skippedAlreadyFiredToday = 0

  for (const sub of subs) {
    const tz = sub.tz || 'UTC'
    const dateStr = localDateStr(now, tz)
    const startOfToday = startOfLocalDayUTC(now, tz)

    // Already fired today? Single-fire-per-day guarantee.
    if (sub.lastFiredAt && sub.lastFiredAt >= startOfToday) {
      skippedAlreadyFiredToday++
      continue
    }

    const userRow = userById.get(sub.userId)
    const profile = userRow?.profile
      ? (decryptJson<Record<string, unknown>>(userRow.profile as string) ?? {})
      : {}
    const reminderTime = typeof profile.reminderTime === 'string' ? profile.reminderTime : null

    const target = reminderTime
      ? targetMinutesPastSeven({ mode: 'override', time: reminderTime })
      : targetMinutesPastSeven({ mode: 'default', userId: sub.userId, dateStr })

    const nowLocalISO = localWallClockISO(now, tz)
    if (!isCurrentWindowTarget({ nowLocalISO, targetMinutesPastSeven: target })) {
      skippedNotInWindow++
      continue
    }

    const latestEntry = latestEntryByUser.get(sub.userId) ?? null

    // Skip if user already journaled today
    if (latestEntry && latestEntry >= startOfToday) {
      skippedAlreadyJournaled++
      // Reset ignored counter (they're engaged)
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { consecutiveIgnored: 0 },
      })
      continue
    }

    // Update ignored counter for the *previous* fire — did they write since?
    let nextIgnored = sub.consecutiveIgnored
    if (sub.lastFiredAt) {
      const wroteSinceLastFire = latestEntry !== null && latestEntry >= sub.lastFiredAt
      nextIgnored = wroteSinceLastFire ? 0 : sub.consecutiveIgnored + 1
    }

    // Send the push
    const payload = JSON.stringify({ title: REMINDER_TITLE, body: pickReminderLine() })
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastFiredAt: now, consecutiveIgnored: nextIgnored },
      })
      fired++
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode
      const message = err instanceof Error ? err.message : String(err)
      if (statusCode === 410 || statusCode === 404) {
        // Subscription expired — clean up
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      } else {
        console.error('push send failed', sub.id, message)
      }
    }
  }

  return NextResponse.json({
    fired,
    skippedAlreadyJournaled,
    skippedNotInWindow,
    skippedAlreadyFiredToday,
    paused: pauseResult.count,
  })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
