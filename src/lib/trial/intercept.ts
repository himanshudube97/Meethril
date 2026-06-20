// src/lib/trial/intercept.ts
//
// Under /try we replace window.fetch so the existing scenes' inline /api/* calls
// resolve against the local trial store instead of the server. External calls
// (iTunes, anything not /api/) pass straight through. install() returns an
// uninstall() that restores the original fetch — always call it on /try exit.

import { useTrialStore } from '@/store/trial'
import { routeTrialRequest } from './router'
import { putBlob, getBlob } from './blob-store'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function apiPath(input: RequestInfo | URL): string | null {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  try {
    const u = new URL(url, window.location.origin)
    if (u.origin !== window.location.origin) return null // external (iTunes) → passthrough
    return u.pathname.startsWith('/api/') ? u.pathname + u.search : null
  } catch {
    return null
  }
}

export function installTrialFetch(): () => void {
  const original = window.fetch.bind(window)

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = apiPath(input)
    if (!path) return original(input, init)

    const method = (init?.method ?? 'GET').toUpperCase()
    const store = useTrialStore.getState()
    const base = path.split('?')[0]

    // Photo bytes → IndexedDB
    if (base === '/api/photos' && method === 'POST') {
      const handle = `trial-photo-${Math.abs(hashString(path + store.journalCount + store.entries.length))}-${cheapNonce()}`
      const bytes = await new Response(init?.body as BodyInit).arrayBuffer()
      await putBlob(handle, bytes)
      return json(200, { handle })
    }
    if (base.startsWith('/api/photos/') && method === 'GET') {
      const handle = base.slice('/api/photos/'.length)
      const bytes = await getBlob(handle)
      if (!bytes) return new Response(null, { status: 404 })
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
    }

    // JSON endpoints via the pure router
    let parsedBody: unknown = null
    if (init?.body && typeof init.body === 'string') {
      try { parsedBody = JSON.parse(init.body) } catch { parsedBody = null }
    }
    const snap = { entries: store.entries, letters: store.letters, scrapbooks: store.scrapbooks, strangerThreads: store.strangerThreads }
    const res = routeTrialRequest(method, path, parsedBody, snap)

    // ---- Entry mutations ----
    if (base === '/api/entries' && method === 'POST') {
      if (store.atLimit('journal')) { store.promptSignup('journal'); return json(403, { error: 'trial_limit' }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { text: string; song: string | null; photos?: any; doodles?: any; e2eeIVs?: any; textPreview?: string }
      const id = store.createEntry({ text: d.text, song: d.song ?? null, photos: d.photos, doodles: d.doodles, e2eeIVs: d.e2eeIVs ?? null, textPreview: d.textPreview })
      const createdAt = useTrialStore.getState().entries.find(e => e.id === id)?.createdAt
      return json(201, { id, createdAt })
    }
    if (base.startsWith('/api/entries/') && method === 'PUT') {
      const id = base.slice('/api/entries/'.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { text: string; song: string | null; photos?: any; doodles?: any; e2eeIVs?: any; textPreview?: string }
      store.updateEntry(id, { text: d.text, song: d.song ?? null, photos: d.photos, doodles: d.doodles, e2eeIVs: d.e2eeIVs ?? null, textPreview: d.textPreview })
      return json(200, { id })
    }

    // ---- Letter mutations (instant reveal) ----
    if (base === '/api/letters/self' && method === 'POST') {
      if (store.atLimit('letter')) { store.promptSignup('letter'); return json(403, { error: 'trial_limit' }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { contentCiphertext: string; contentIVs: Record<string, string> }
      const id = store.createLetter({ type: 'self', contentCiphertext: d.contentCiphertext, contentIVs: d.contentIVs, recipientName: null, recipientEmail: null })
      return json(201, { id })
    }
    if (base === '/api/letters/friend' && method === 'POST') {
      if (store.atLimit('letter')) { store.promptSignup('letter'); return json(403, { error: 'trial_limit' }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { transientCiphertext: string; transientIV: string; recipientName: string; recipientEmail: string }
      const id = store.createLetter({ type: 'friend', contentCiphertext: d.transientCiphertext, contentIVs: { content: d.transientIV }, recipientName: d.recipientName ?? null, recipientEmail: d.recipientEmail ?? null })
      return json(201, { id })
    }
    if (base.startsWith('/api/letters/') && (base.endsWith('/viewed') || base.endsWith('/read')) && method === 'POST') {
      const id = base.split('/')[3]
      store.revealLetter(id)
      return json(200, { ok: true })
    }

    // ---- Scrapbook mutations ----
    if (base === '/api/scrapbooks' && method === 'POST') {
      if (store.atLimit('scrapbook')) { store.promptSignup('scrapbook'); return json(403, { error: 'trial_limit' }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { items: string; e2eeIVs: { items: string; title?: string }; title?: string | null }
      const id = store.createScrapbook({ items: d.items, e2eeIVs: d.e2eeIVs, title: d.title ?? null })
      return json(201, { id })
    }
    // ---- Stranger notes: store the released note so it shows in the sender's
    // own correspondence (right side). No cap — stranger notes are uncapped.
    if (base === '/api/stranger-notes' && method === 'POST') {
      const d = parsedBody as { content: string; country?: string | null; state?: string | null }
      const id = store.createStrangerNote({ body: d.content, countryCode: d.country ?? null, stateName: d.state ?? null })
      return json(201, { id, status: 'unmatched' })
    }

    if (base.startsWith('/api/scrapbooks/') && method === 'PUT') {
      const id = base.slice('/api/scrapbooks/'.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { title?: string | null; items: string; e2eeIVs: { items: string; title?: string } }
      store.updateScrapbook(id, { title: d.title ?? null, items: d.items, e2eeIVs: d.e2eeIVs })
      return json(200, { id })
    }

    return json(res.status, res.body)
  }) as typeof window.fetch

  return () => { window.fetch = original }
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return h
}

function cheapNonce(): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : String(Math.abs(Math.floor(Math.random() * 1e9)))
}
