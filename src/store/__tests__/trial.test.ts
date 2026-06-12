import { describe, it, expect, beforeEach } from 'vitest'
import { useTrialStore } from '@/store/trial'

beforeEach(() => useTrialStore.getState().reset(new Date('2026-06-12T10:00:00Z')))

describe('trial store', () => {
  it('seeds demo entries on reset and counts zero user entries', () => {
    expect(useTrialStore.getState().entries.length).toBeGreaterThanOrEqual(3)
    expect(useTrialStore.getState().entryCount).toBe(0)
  })
  it('createEntry adds a user entry dated before the newest existing entry', () => {
    const before = useTrialStore.getState().newestDate()
    const id = useTrialStore.getState().createEntry({ text: '<p>hi</p>', song: null })
    const created = useTrialStore.getState().entries.find(e => e.id === id)!
    expect(new Date(created.createdAt).getTime()).toBeLessThan(new Date(before).getTime())
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
})
