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
  it('entries GET returns the array with a pagination envelope', () => {
    const r = routeTrialRequest('GET', '/api/entries?limit=50', null, snap)
    expect(r.status).toBe(200)
    expect(r.body.entries).toHaveLength(1)
    expect(r.body.pagination).toEqual({ hasMore: false, nextCursor: null, limit: 50 })
  })

  it('entries GET filters by month', () => {
    const month = now.slice(0, 7)
    expect(routeTrialRequest('GET', `/api/entries?month=${month}`, null, snap).body.entries).toHaveLength(1)
    expect(routeTrialRequest('GET', '/api/entries?month=1999-01', null, snap).body.entries).toHaveLength(0)
  })

  it('entries stats derives totalEntries from the snapshot', () => {
    expect(routeTrialRequest('GET', '/api/entries/stats', null, snap).body.totalEntries).toBe(1)
  })

  it('entries POST echoes a pending row with 201', () => {
    const r = routeTrialRequest('POST', '/api/entries', { text: 'hi' }, snap)
    expect(r.status).toBe(201)
    expect(typeof r.body.id).toBe('string')
  })

  it('inbox returns self letters with the text-keyed IV the reveal decryptor needs', () => {
    const r = routeTrialRequest('GET', '/api/letters/inbox', null, snap)
    expect(r.status).toBe(200)
    expect(r.body.letters).toHaveLength(1)
    expect(r.body.letters[0].id).toBe('l1')
    expect(r.body.letters[0].text).toBe('CT')
    // decryptEntryFromServer looks up ivs['text']; the router must alias content→text.
    expect(r.body.letters[0].e2eeIVs).toEqual({ content: 'IV', text: 'IV' })
  })

  it('sent returns friend letters as delivered stamps', () => {
    const r = routeTrialRequest('GET', '/api/letters/sent', null, snap)
    expect(r.body.stamps).toHaveLength(1)
    expect(r.body.stamps[0].id).toBe('l2')
    expect(r.body.stamps[0].isDelivered).toBe(true)
  })

  it('mine returns self letters with text (so memory can decrypt them) + hasArrived', () => {
    const r = routeTrialRequest('GET', '/api/letters/mine', null, snap)
    expect(r.body.letters[0].hasArrived).toBe(true)
    expect(r.body.letters[0].recipientEmail).toBeNull()
    // useMemories needs both l.text and l.e2eeIVs.content or it drops the letter.
    expect(r.body.letters[0].text).toBe('CT')
    expect(r.body.letters[0].e2eeIVs.content).toBe('IV')
  })

  it('arrived returns unviewed self letters with ciphertext text + text-keyed IV', () => {
    const r = routeTrialRequest('GET', '/api/letters/arrived', null, snap)
    expect(r.body.letters[0].text).toBe('CT')
    expect(r.body.letters[0].e2eeIVs.text).toBe('IV')
    expect(r.body.count).toBe(1)
  })

  it('scrapbooks list mirrors the real shape (title/itemCount null, e2eeIVs present)', () => {
    const r = routeTrialRequest('GET', '/api/scrapbooks', null, snap)
    expect(Array.isArray(r.body)).toBe(true)
    expect(r.body[0].id).toBe('s1')
    expect(r.body[0].title).toBeNull()
    expect(r.body[0].itemCount).toBeNull()
    expect(r.body[0].e2eeIVs.items).toBe('SIV')
  })

  it('letter draft POST returns an id so desktop compose can seal', () => {
    const r = routeTrialRequest('POST', '/api/letters/drafts', null, snap)
    expect(r.status).toBe(201)
    expect(typeof r.body.id).toBe('string')
    expect(r.body.id.length).toBeGreaterThan(0)
  })

  it('letter draft GET by id returns a benign wire with draftDoodles', () => {
    const r = routeTrialRequest('GET', '/api/letters/drafts/abc', null, snap)
    expect(r.status).toBe(200)
    expect(r.body.draftDoodles).toEqual([])
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
