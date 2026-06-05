import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decryptJson } from '@/lib/encryption'
import { verifyDesktopToken } from '@/lib/desktop-token'
import { localWallClockISO, localDateStr, startOfLocalDayUTC } from '@/lib/tz'
import { targetTimeHHMM, isAtOrAfterTarget } from '@/lib/reminder-target'
import { pickReminderLine, REMINDER_TITLE } from '@/lib/reminder-messages'
import { listLettersForRead } from '@/lib/letters/dual-read'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const verified = await verifyDesktopToken(token)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tz = request.headers.get('x-user-tz') || 'UTC'
  const now = new Date()
  const dateStr = localDateStr(now, tz)
  const startOfToday = startOfLocalDayUTC(now, tz)

  const dbUser = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { profile: true },
  })
  const profile = dbUser?.profile
    ? (decryptJson<Record<string, unknown>>(dbUser.profile as string) ?? {})
    : {}

  const enabled = profile.remindersEnabled === true
  const reminderTime = typeof profile.reminderTime === 'string' ? profile.reminderTime : null

  const latest = await prisma.journalEntry.findFirst({
    where: { userId: verified.userId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  const journaledToday = Boolean(latest && latest.createdAt >= startOfToday)

  let reminder: { due: boolean; title: string; body: string } | null = null
  if (enabled) {
    const targetHHMM = targetTimeHHMM({ userId: verified.userId, dateStr, reminderTime })
    const due = isAtOrAfterTarget(localWallClockISO(now, tz), targetHHMM) && !journaledToday
    reminder = { due, title: REMINDER_TITLE, body: pickReminderLine() }
  }

  // Arrived letters: same "should be alerted about" query as
  // /api/letters/arrived (self-letters, sealed, unlocked). We return only IDs
  // + static display strings — never ciphertext or decrypted content.
  const arrived = await listLettersForRead({
    userId: verified.userId,
    where: {
      entryType: 'letter',
      isSealed: true,
      recipientEmail: null,
      unlockDate: { lte: now },
    },
    orderBy: { unlockDate: 'asc' },
  })
  const letters = arrived.map((l) => ({
    id: l.id,
    title: 'a letter arrived ✨',
    body: 'from past you',
  }))

  return NextResponse.json({ reminder, letters })
}
