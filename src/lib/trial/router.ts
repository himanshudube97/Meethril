// src/lib/trial/router.ts
//
// Pure mapping of an /api/* request to a JSON response, backed by a trial-store
// snapshot. Mutations (POST/PUT) return the shape callers expect; the caller
// (intercept.ts) applies the corresponding store action. Photo BYTES bypass
// this and go to IndexedDB directly. Anything unrecognised returns a benign
// empty 200 so a scene's inline fetch never throws.

import type { JournalEntry } from '@/store/journal'
import type { TrialLetter, TrialScrapbook } from '@/store/trial'

export interface TrialSnapshot {
  entries: JournalEntry[]
  letters: TrialLetter[]
  scrapbooks: TrialScrapbook[]
}

export interface TrialResponse {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

function path(url: string): string {
  const q = url.indexOf('?')
  return q >= 0 ? url.slice(0, q) : url
}
function param(url: string, key: string): string | null {
  const q = url.indexOf('?')
  if (q < 0) return null
  return new URLSearchParams(url.slice(q + 1)).get(key)
}

const selfLetters = (snap: TrialSnapshot) => snap.letters.filter(l => l.type === 'self')
const friendLetters = (snap: TrialSnapshot) => snap.letters.filter(l => l.type === 'friend')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function routeTrialRequest(method: string, url: string, body: any, snap: TrialSnapshot): TrialResponse {
  const p = path(url)
  const m = method.toUpperCase()

  // ---- Entries ----
  if (p === '/api/entries' && m === 'GET') {
    const limit = Number(param(url, 'limit') ?? 50)
    const month = param(url, 'month')
    let entries = snap.entries
    if (month) entries = entries.filter(e => e.createdAt.slice(0, 7) === month)
    return { status: 200, body: { entries, pagination: { hasMore: false, nextCursor: null, limit } } }
  }
  if (p === '/api/entries' && m === 'POST') {
    return { status: 201, body: { id: '__PENDING__', ...(body ?? {}), createdAt: new Date(0).toISOString() } }
  }
  if (p === '/api/entries/stats') {
    return { status: 200, body: { totalEntries: snap.entries.length, years: [], firstEntryDate: null, lastEntryDate: null, currentStreak: 0, longestStreak: 0 } }
  }
  if (p.startsWith('/api/entries/') && (m === 'PUT' || m === 'GET')) {
    const id = p.slice('/api/entries/'.length)
    const entry = snap.entries.find(e => e.id === id)
    if (m === 'GET') return entry ? { status: 200, body: entry } : { status: 404, body: {} }
    return { status: 200, body: { id } }
  }

  // ---- Letters (instant reveal: unlockDate already = createdAt in the store) ----
  if (p === '/api/letters/inbox') {
    const letters = selfLetters(snap).map(l => ({
      id: l.id,
      recipientName: l.recipientName,
      sealedAt: l.createdAt,
      unlockDate: l.unlockDate,
      isViewed: l.isViewed,
      encryptionType: 'e2ee',
      // Reveal decrypts via decryptEntryFromServer, which looks up ivs['text']
      // (STRING_FIELDS). The real route synthesizes that key from contentIVs.content
      // (see lib/letters/dual-read.ts). Mirror it or the letter reveals blank.
      e2eeIVs: { ...l.contentIVs, text: l.contentIVs.content },
      text: l.contentCiphertext,
    }))
    return { status: 200, body: { letters } }
  }
  if (p === '/api/letters/sent') {
    const stamps = friendLetters(snap).map(l => ({
      id: l.id,
      recipientName: l.recipientName,
      sealedAt: l.createdAt,
      unlockDate: l.unlockDate,
      isDelivered: true,
      letterPeekedAt: null,
      firstReadAt: null,
      savedByRecipientAt: null,
      bouncedAt: null,
      bouncedReason: null,
      encryptionType: 'e2ee',
      e2eeIVs: l.contentIVs,
    }))
    return { status: 200, body: { stamps } }
  }
  if (p === '/api/letters/mine') {
    const letters = selfLetters(snap).map(l => ({
      id: l.id,
      createdAt: l.createdAt,
      unlockDate: l.unlockDate,
      isSealed: true,
      recipientName: l.recipientName,
      recipientEmail: l.recipientEmail,
      encryptionType: 'e2ee',
      e2eeIVs: l.contentIVs,
      // useMemories reads l.text + l.e2eeIVs.content; without text the self-letter
      // is dropped from the memory pool even though it counts toward the gate.
      text: l.contentCiphertext,
      hasArrived: true,
    }))
    return { status: 200, body: { letters } }
  }
  if (p === '/api/letters/arrived') {
    const letters = selfLetters(snap).filter(l => !l.isViewed).map(l => ({
      id: l.id,
      text: l.contentCiphertext,
      createdAt: l.createdAt,
      unlockDate: l.unlockDate,
      letterLocation: null,
      encryptionType: 'e2ee',
      e2eeIVs: { ...l.contentIVs, text: l.contentIVs.content },
    }))
    return { status: 200, body: { letters, count: letters.length } }
  }
  if (p === '/api/letters/self' && m === 'POST') return { status: 201, body: { id: '__PENDING__' } }
  if (p === '/api/letters/friend' && m === 'POST') return { status: 201, body: { id: '__PENDING__' } }
  // Draft lifecycle: the desktop ComposeView autosaves a draft and refuses to seal
  // without the draftLetterId it gets back from POST /drafts. The trial doesn't
  // persist drafts — it just hands back a stable id so the seal can proceed (the
  // self/friend POST handlers ignore draftLetterId). GET returns a benign wire so
  // the friend seal (reads draftDoodles) and resume-by-id don't 404.
  if (p === '/api/letters/drafts' && m === 'GET') return { status: 200, body: { letters: [] } }
  if (p === '/api/letters/drafts' && m === 'POST') return { status: 201, body: { id: `trial-draft-${crypto.randomUUID()}` } }
  if (p.startsWith('/api/letters/drafts/')) {
    const id = p.slice('/api/letters/drafts/'.length)
    if (m === 'PUT') return { status: 200, body: { id } }
    return { status: 200, body: { id, createdAt: new Date().toISOString(), draftDoodles: [] } }
  }
  if (p.startsWith('/api/letters/') && (p.endsWith('/viewed') || p.endsWith('/read'))) return { status: 200, body: { ok: true } }

  // ---- Scrapbooks ----
  if (p === '/api/scrapbooks' && m === 'GET') {
    // Mirror the real route's list shape: title is null (the card falls back to
    // the date label; the board page decrypts the real title), itemCount is null.
    return { status: 200, body: snap.scrapbooks.map(s => ({ id: s.id, title: null, e2eeIVs: s.e2eeIVs, itemCount: null, createdAt: s.createdAt, updatedAt: s.updatedAt })) }
  }
  if (p === '/api/scrapbooks' && m === 'POST') {
    return { status: 201, body: { id: '__PENDING__' } }
  }
  if (p.startsWith('/api/scrapbooks/')) {
    const id = p.slice('/api/scrapbooks/'.length)
    if (m === 'PUT') return { status: 200, body: { id } }
    const sb = snap.scrapbooks.find(s => s.id === id)
    return sb ? { status: 200, body: sb } : { status: 404, body: {} }
  }

  // ---- Profile ----
  if (p === '/api/profile' && m === 'GET') return { status: 200, body: { profile: {} } }
  if (p === '/api/profile' && m === 'PUT') return { status: 200, body: { ok: true } }
  if (p === '/api/me/profile-flags') return { status: 200, body: { reminderOptIn: false, hasSeenTour: true } }

  // ---- Stranger notes (lights) — empty but valid so the tab renders ----
  if (p.startsWith('/api/stranger-notes/inbox')) return { status: 200, body: { threads: [], nextCursor: null } }
  if (p.startsWith('/api/stranger-notes')) return { status: 200, body: { ok: true } }

  return { status: 200, body: {} }
}
