import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: {
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    journalEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
}))

// Identity-passthrough: lets us pass plain objects as `profile` in test fixtures
// instead of having to mint encrypted strings.
vi.mock('@/lib/encryption', () => ({
  decryptJson: vi.fn((v: unknown) => v as Record<string, unknown> | null),
}))

import { prisma } from '@/lib/db'
import webpush from 'web-push'
import { GET } from '@/app/api/cron/send-reminders/route'

const ENV = process.env

beforeEach(() => {
  vi.clearAllMocks()
  process.env = {
    ...ENV,
    CRON_SECRET: 'test-secret',
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    VAPID_SUBJECT: 'mailto:x@y.z',
  }
  // Default: nothing to auto-pause unless a test overrides
  vi.mocked(prisma.pushSubscription.updateMany).mockResolvedValue({ count: 0 } as any)
  // The route batch-fetches users + latest entries; default to empty so tests
  // that don't care about them don't crash on `.map` of undefined.
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as any)
  vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as any)
})

function makeReq() {
  return new Request('http://localhost/api/cron/send-reminders', {
    headers: { authorization: 'Bearer test-secret' },
  })
}

describe('GET /api/cron/send-reminders', () => {
  it('rejects without bearer token', async () => {
    const res = await GET(new Request('http://localhost/api/cron/send-reminders'))
    expect(res.status).toBe(401)
  })

  it('returns 0 fired when no subscriptions match the current window', async () => {
    // Use a target time far from "now" by choosing a user whose hash slot is unlikely to match
    // We control the date via a fake timer
    vi.setSystemTime(new Date('2026-05-03T03:00:00Z'))  // 3am UTC — outside everyone's evening
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
      {
        id: 's1', userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a',
        userAgent: null, tz: 'UTC', createdAt: new Date(), lastFiredAt: null,
        consecutiveIgnored: 0, pausedAt: null,
      },
    ] as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', profile: {} }] as any)
    const res = await GET(makeReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.fired).toBe(0)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('skips when user already has an entry today', async () => {
    // Force the override path so we know exactly when it should fire
    vi.setSystemTime(new Date('2026-05-03T20:07:00Z'))  // 20:07 in UTC; tz UTC; override 20:00 → match
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
      {
        id: 's1', userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a',
        userAgent: null, tz: 'UTC', createdAt: new Date(), lastFiredAt: null,
        consecutiveIgnored: 0, pausedAt: null,
      },
    ] as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', profile: { reminderTime: '20:00' } }] as any)
    // Latest entry is earlier today (>= start of local day) → already journaled.
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([
      { userId: 'u1', createdAt: new Date('2026-05-03T08:00:00Z') },
    ] as any)
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.fired).toBe(0)
    expect(body.skippedAlreadyJournaled).toBe(1)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('fires when user has not journaled today and current window matches target', async () => {
    vi.setSystemTime(new Date('2026-05-03T20:07:00Z'))
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([
      {
        id: 's1', userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a',
        userAgent: null, tz: 'UTC', createdAt: new Date(), lastFiredAt: null,
        consecutiveIgnored: 0, pausedAt: null,
      },
    ] as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', profile: { reminderTime: '20:00' } }] as any)
    vi.mocked(prisma.journalEntry.findMany).mockResolvedValue([] as any)
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.fired).toBe(1)
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('auto-pauses subscriptions with consecutiveIgnored >= 7', async () => {
    vi.setSystemTime(new Date('2026-05-03T03:00:00Z'))
    vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue([])
    vi.mocked(prisma.pushSubscription.updateMany).mockResolvedValue({ count: 2 } as any)
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.paused).toBe(2)
    expect(prisma.pushSubscription.updateMany).toHaveBeenCalledWith({
      where: { pausedAt: null, consecutiveIgnored: { gte: 7 } },
      data: { pausedAt: expect.any(Date) },
    })
    vi.useRealTimers()
  })
})
