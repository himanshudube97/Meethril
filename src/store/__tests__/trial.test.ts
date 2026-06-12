import { describe, it, expect, beforeEach } from 'vitest'
import { useTrialStore } from '@/store/trial'

beforeEach(() => useTrialStore.getState().reset(new Date('2026-06-12T10:00:00Z')))

describe('trial store', () => {
  it('seeds demo entries on reset and counts zero user entries', () => {
    expect(useTrialStore.getState().entries.length).toBeGreaterThanOrEqual(3)
    expect(useTrialStore.getState().entryCount).toBe(0)
  })
  it('createEntry adds a user entry on a calendar day not already used by any existing entry', () => {
    const existingDays = new Set(useTrialStore.getState().entries.map(e => e.createdAt.slice(0, 10)))
    const id = useTrialStore.getState().createEntry({ text: '<p>hi</p>', song: null })
    const created = useTrialStore.getState().entries.find(e => e.id === id)!
    expect(existingDays.has(created.createdAt.slice(0, 10))).toBe(false)
    expect(useTrialStore.getState().entryCount).toBe(1)
  })
  it('updateEntry edits text in place', () => {
    const id = useTrialStore.getState().createEntry({ text: '<p>a</p>', song: null })
    useTrialStore.getState().updateEntry(id, { text: '<p>b</p>', song: null })
    expect(useTrialStore.getState().entries.find(e => e.id === id)!.text).toBe('<p>b</p>')
  })
  it('atWall is true once entryCount reaches 5', () => {
    for (let i = 0; i < 5; i++) useTrialStore.getState().createEntry({ text: `<p>${i}</p>`, song: null })
    expect(useTrialStore.getState().entryCount).toBe(5)
    expect(useTrialStore.getState().atWall()).toBe(true)
  })
  it('dates successive user entries on distinct calendar days', () => {
    const ids = [0, 1, 2, 3].map(i => useTrialStore.getState().createEntry({ text: `<p>${i}</p>`, song: null }))
    const days = ids.map(id => useTrialStore.getState().entries.find(e => e.id === id)!.createdAt.slice(0, 10))
    expect(new Set(days).size).toBe(4) // all distinct days
  })
  it('keeps ids unique', () => {
    const a = useTrialStore.getState().createEntry({ text: '<p>a</p>', song: null })
    const b = useTrialStore.getState().createEntry({ text: '<p>b</p>', song: null })
    expect(a).not.toBe(b)
  })
  it('preserves e2eeIVs and ciphertext text for encrypted entries', () => {
    const id = useTrialStore.getState().createEntry({ text: 'CIPHERTEXT', song: null, e2eeIVs: { text: 'iv123' } })
    const e = useTrialStore.getState().entries.find(x => x.id === id)!
    expect(e.text).toBe('CIPHERTEXT')
    expect(e.e2eeIVs).toEqual({ text: 'iv123' })
    expect(e.textPreview).toBeUndefined()
  })
})
