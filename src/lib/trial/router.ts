// src/lib/trial/router.ts
//
// Pure mapping of an /api/* request to a JSON response, backed by a trial-store
// snapshot. Mutations (POST/PUT) return the shape callers expect; the caller
// (intercept.ts) applies the corresponding store action. Photo BYTES bypass
// this and go to IndexedDB directly. Anything unrecognised returns a benign
// empty 200 so a scene's inline fetch never throws.

import type { JournalEntry } from '@/store/journal'

export interface TrialSnapshot {
  entries: JournalEntry[]
  letters: { id: string; text: string; recipientName: string | null; createdAt: string; unlockDate: string | null; isViewed: boolean }[]
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function routeTrialRequest(method: string, url: string, body: any, snap: TrialSnapshot): TrialResponse {
  const p = path(url)
  const m = method.toUpperCase()

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

  if (p === '/api/letters/inbox') return { status: 200, body: { letters: [] } }
  if (p === '/api/letters/sent') return { status: 200, body: { stamps: [] } }
  if (p === '/api/letters/mine') return { status: 200, body: { letters: [] } }
  if (p === '/api/letters/arrived') return { status: 200, body: { letters: [], count: 0 } }
  if (p.startsWith('/api/letters/') && p.endsWith('/viewed')) return { status: 200, body: { ok: true } }

  if (p === '/api/me/profile-flags') return { status: 200, body: { reminderOptIn: false, hasSeenTour: true } }

  return { status: 200, body: {} }
}
