import { describe, it, expect } from 'vitest'
import { routeTrialRequest } from '@/lib/trial/router'
import type { JournalEntry } from '@/store/journal'

const snapshot = () => ({
  entries: [
    { id: 'seed-0', text: 'hi', createdAt: '2026-06-10T12:00:00Z', updatedAt: '2026-06-10T12:00:00Z', tags: [], doodles: [], photos: [], entryType: 'normal', e2eeIVs: null } as JournalEntry,
  ],
  letters: [],
})

describe('routeTrialRequest', () => {
  it('GET /api/entries returns the entries + pagination envelope', () => {
    const res = routeTrialRequest('GET', '/api/entries?month=2026-06&limit=50', null, snapshot())
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.pagination).toEqual({ hasMore: false, nextCursor: null, limit: 50 })
  })
  it('GET /api/entries/stats returns a derived total', () => {
    const res = routeTrialRequest('GET', '/api/entries/stats', null, snapshot())
    expect(res.status).toBe(200)
    expect(res.body.totalEntries).toBe(1)
  })
  it('POST /api/entries echoes a created entry with an id', () => {
    const res = routeTrialRequest('POST', '/api/entries', { text: '<p>x</p>', song: null }, snapshot())
    expect(res.status).toBe(201)
    expect(typeof res.body.id).toBe('string')
  })
  it('GET /api/me/profile-flags returns a benign default', () => {
    const res = routeTrialRequest('GET', '/api/me/profile-flags', null, snapshot())
    expect(res.status).toBe(200)
  })
  it('unknown /api path returns 200 empty so scenes never error', () => {
    const res = routeTrialRequest('GET', '/api/letters/inbox', null, snapshot())
    expect(res.status).toBe(200)
  })
})
