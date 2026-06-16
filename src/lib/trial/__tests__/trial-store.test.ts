import { describe, it, expect, beforeEach } from 'vitest'
import { useTrialStore, TRIAL_LIMIT } from '@/store/trial'

beforeEach(() => {
  useTrialStore.getState().reset()
  useTrialStore.setState({ signupPrompt: null })
})

describe('trial store caps', () => {
  it('reset starts empty (no seed)', () => {
    const s = useTrialStore.getState()
    expect(s.entries).toEqual([])
    expect(s.letters).toEqual([])
    expect(s.scrapbooks).toEqual([])
    expect(s.journalCount).toBe(0)
    expect(s.letterCount).toBe(0)
    expect(s.scrapbookCount).toBe(0)
  })

  it('createEntry increments journalCount and prepends', () => {
    const id = useTrialStore.getState().createEntry({ text: 'hello', song: null })
    const s = useTrialStore.getState()
    expect(s.journalCount).toBe(1)
    expect(s.entries[0].id).toBe(id)
    expect(s.entries[0].text).toBe('hello')
  })

  it('atLimit("journal") is true only at the cap', () => {
    for (let i = 0; i < TRIAL_LIMIT; i++) {
      expect(useTrialStore.getState().atLimit('journal')).toBe(false)
      useTrialStore.getState().createEntry({ text: `e${i}`, song: null })
    }
    expect(useTrialStore.getState().atLimit('journal')).toBe(true)
  })

  it('createLetter stores ciphertext + instant unlockDate and caps at limit', () => {
    let id = ''
    for (let i = 0; i < TRIAL_LIMIT; i++) {
      id = useTrialStore.getState().createLetter({
        type: 'self', contentCiphertext: `ct${i}`, contentIVs: { content: `iv${i}` },
        recipientName: null, recipientEmail: null,
      })
    }
    const s = useTrialStore.getState()
    expect(s.letterCount).toBe(TRIAL_LIMIT)
    expect(s.atLimit('letter')).toBe(true)
    const l = s.letters.find(x => x.id === id)!
    expect(l.contentCiphertext).toBe(`ct${TRIAL_LIMIT - 1}`)
    // instant: unlockDate is not in the future
    expect(new Date(l.unlockDate!).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('createScrapbook returns id, stores ciphertext, caps at limit', () => {
    const id = useTrialStore.getState().createScrapbook({ items: 'CT', e2eeIVs: { items: 'IV' } })
    const s = useTrialStore.getState()
    expect(s.scrapbookCount).toBe(1)
    const sb = s.scrapbooks.find(x => x.id === id)!
    expect(sb.items).toBe('CT')
    expect(sb.e2eeIVs.items).toBe('IV')
  })

  it('updateScrapbook overwrites items/title/ivs without changing count', () => {
    const id = useTrialStore.getState().createScrapbook({ items: 'A', e2eeIVs: { items: 'IVa' } })
    useTrialStore.getState().updateScrapbook(id, { title: 'T', items: 'B', e2eeIVs: { items: 'IVb', title: 'IVt' } })
    const s = useTrialStore.getState()
    expect(s.scrapbookCount).toBe(1)
    const sb = s.scrapbooks.find(x => x.id === id)!
    expect(sb.items).toBe('B')
    expect(sb.title).toBe('T')
    expect(sb.e2eeIVs.title).toBe('IVt')
  })

  it('promptSignup sets the signupPrompt flag with the feature', () => {
    useTrialStore.getState().promptSignup('letter')
    expect(useTrialStore.getState().signupPrompt).toBe('letter')
  })

  it('updateEntry edits text in place', () => {
    const id = useTrialStore.getState().createEntry({ text: '<p>a</p>', song: null })
    useTrialStore.getState().updateEntry(id, { text: '<p>b</p>', song: null })
    expect(useTrialStore.getState().entries.find(e => e.id === id)!.text).toBe('<p>b</p>')
  })

  it('dates successive entries on distinct calendar days', () => {
    const ids = [0, 1, 2, 3].map(i => useTrialStore.getState().createEntry({ text: `<p>${i}</p>`, song: null }))
    const days = ids.map(id => useTrialStore.getState().entries.find(e => e.id === id)!.createdAt.slice(0, 10))
    expect(new Set(days).size).toBe(4)
  })

  it('preserves e2eeIVs + ciphertext and skips the plaintext preview for encrypted entries', () => {
    const id = useTrialStore.getState().createEntry({ text: 'CIPHERTEXT', song: null, e2eeIVs: { text: 'iv123' } })
    const e = useTrialStore.getState().entries.find(x => x.id === id)!
    expect(e.text).toBe('CIPHERTEXT')
    expect(e.e2eeIVs).toEqual({ text: 'iv123' })
    expect(e.textPreview).toBeUndefined()
  })
})
