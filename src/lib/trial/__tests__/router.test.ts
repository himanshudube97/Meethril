import { describe, it, expect } from 'vitest'
import { routeTrialRequest, type TrialSnapshot } from '@/lib/trial/router'

const now = new Date().toISOString()
const snap: TrialSnapshot = {
  entries: [{ id: 'e1', text: 'x', createdAt: now, updatedAt: now, tags: [], doodles: [], photos: [], entryType: 'normal', e2eeIVs: null } as any],
  letters: [
    { id: 'l1', type: 'self', contentCiphertext: 'CT', contentIVs: { content: 'IV' }, recipientName: null, recipientEmail: null, createdAt: now, unlockDate: now, isViewed: false },
    { id: 'l2', type: 'friend', contentCiphertext: 'CT2', contentIVs: { content: 'IV2' }, recipientName: 'Sam', recipientEmail: 's@x.com', createdAt: now, unlockDate: now, isViewed: false },
  ],
  scrapbooks: [{ id: 's1', title: null, items: 'SCT', e2eeIVs: { items: 'SIV' }, createdAt: now, updatedAt: now }],
}

describe('trial router reads', () => {
  it('inbox returns self letters as arrived (unlockDate=now, e2ee passthrough)', () => {
    const r = routeTrialRequest('GET', '/api/letters/inbox', null, snap)
    expect(r.status).toBe(200)
    expect(r.body.letters).toHaveLength(1)
    expect(r.body.letters[0].id).toBe('l1')
    expect(r.body.letters[0].text).toBe('CT')
    expect(r.body.letters[0].e2eeIVs).toEqual({ content: 'IV' })
  })

  it('sent returns friend letters as delivered stamps', () => {
    const r = routeTrialRequest('GET', '/api/letters/sent', null, snap)
    expect(r.body.stamps).toHaveLength(1)
    expect(r.body.stamps[0].id).toBe('l2')
    expect(r.body.stamps[0].isDelivered).toBe(true)
  })

  it('mine returns self letters flagged hasArrived', () => {
    const r = routeTrialRequest('GET', '/api/letters/mine', null, snap)
    expect(r.body.letters[0].hasArrived).toBe(true)
    expect(r.body.letters[0].recipientEmail).toBeNull()
  })

  it('arrived returns unviewed self letters with ciphertext text', () => {
    const r = routeTrialRequest('GET', '/api/letters/arrived', null, snap)
    expect(r.body.letters[0].text).toBe('CT')
    expect(r.body.count).toBe(1)
  })

  it('scrapbooks list returns summaries', () => {
    const r = routeTrialRequest('GET', '/api/scrapbooks', null, snap)
    expect(Array.isArray(r.body)).toBe(true)
    expect(r.body[0].id).toBe('s1')
  })

  it('scrapbook by id returns the full encrypted board', () => {
    const r = routeTrialRequest('GET', '/api/scrapbooks/s1', null, snap)
    expect(r.body.items).toBe('SCT')
    expect(r.body.e2eeIVs.items).toBe('SIV')
  })

  it('profile returns empty profile object', () => {
    const r = routeTrialRequest('GET', '/api/profile', null, snap)
    expect(r.body).toEqual({ profile: {} })
  })

  it('stranger-notes inbox returns empty threads', () => {
    const r = routeTrialRequest('GET', '/api/stranger-notes/inbox?filter=all', null, snap)
    expect(r.body).toEqual({ threads: [], nextCursor: null })
  })

  it('unknown path returns benign 200', () => {
    const r = routeTrialRequest('GET', '/api/whatever', null, snap)
    expect(r.status).toBe(200)
  })
})
