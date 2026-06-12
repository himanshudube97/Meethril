import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { POST, DELETE } from '@/app/api/push/subscribe/route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/push/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no user is logged in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    const res = await POST(makeReq({
      endpoint: 'https://fcm.example/abc',
      keys: { p256dh: 'k1', auth: 'k2' },
      tz: 'Asia/Kolkata',
    }))
    expect(res.status).toBe(401)
  })

  it('upserts the subscription and returns 200', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: null, avatar: null, provider: 'dev',
    })
    vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({} as any)
    const res = await POST(makeReq({
      endpoint: 'https://fcm.example/abc',
      keys: { p256dh: 'k1', auth: 'k2' },
      userAgent: 'Chrome',
      tz: 'Asia/Kolkata',
    }))
    expect(res.status).toBe(200)
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.example/abc' },
      create: {
        userId: 'u1',
        endpoint: 'https://fcm.example/abc',
        p256dh: 'k1',
        auth: 'k2',
        userAgent: 'Chrome',
        tz: 'Asia/Kolkata',
      },
      update: {
        userId: 'u1',
        p256dh: 'k1',
        auth: 'k2',
        userAgent: 'Chrome',
        tz: 'Asia/Kolkata',
        pausedAt: null,
        consecutiveIgnored: 0,
      },
    })
  })

  it('returns 400 on missing endpoint', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: null, avatar: null, provider: 'dev',
    })
    const res = await POST(makeReq({ keys: { p256dh: 'k1', auth: 'k2' } }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/push/subscribe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when no user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    const req = new Request('http://localhost/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: 'https://fcm.example/abc' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it('deletes by endpoint scoped to the user and returns 200', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: null, avatar: null, provider: 'dev',
    })
    vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 } as any)
    const req = new Request('http://localhost/api/push/subscribe', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: 'https://fcm.example/abc' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    // Deletion is scoped by userId so one user can't unsubscribe another.
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://fcm.example/abc', userId: 'u1' },
    })
  })
})
