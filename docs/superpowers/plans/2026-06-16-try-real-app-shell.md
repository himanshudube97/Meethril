# `/try` Real App Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/try` into the real Meethril app shell — journal, letters, scrapbook, memory, shelf, themes — running on the existing sessionStorage trial layer with byte-identical UI, no backend, wiped on tab close.

**Architecture:** Approach A (mirror routes). Thin `/try/*` pages re-export the real scene components, wrapped by a `/try` layout that mounts `TryModeProvider`. `Navigation` and `LayoutContent` get a trial branch keyed on `pathname.startsWith('/try')`. The trial store + router are expanded to cover every feature's `/api/*` calls. Real authed routes are untouched.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand (sessionStorage persist), TipTap, Framer Motion, Vitest. Encryption is the existing client-side AES-256-GCM under a throwaway trial key.

**Reference spec:** `docs/superpowers/specs/2026-06-16-try-real-app-shell-design.md`

**Test convention (CLAUDE.md):** Pure data-rule logic (store caps, router mapping, memory gate calc) gets a Vitest test first. UI / interceptor / pages are verified manually. Tests run **in Docker**: `docker compose exec app npx vitest run`.

---

## File Structure

**Create:**
- `src/app/try/layout.tsx` — mounts `TryModeProvider` for all `/try/*`
- `src/app/try/write/page.tsx` — re-exports `DeskScene`
- `src/app/try/letters/page.tsx` — re-exports the real letters page body
- `src/app/try/scrapbook/page.tsx` — re-exports `ScrapbookListingView`
- `src/app/try/scrapbook/[id]/page.tsx` — re-exports the real scrapbook canvas page body
- `src/app/try/memory/page.tsx` — re-exports the real memory page body
- `src/app/try/shelf/page.tsx` — re-exports `ShelfScene`
- `src/components/try/TryLimitModal.tsx` — global "trial full → sign up" modal
- `src/lib/memory/gate.ts` — pure `computeMemoryStatus()` extracted from `useMemories`
- `src/lib/trial/__tests__/trial-store.test.ts`
- `src/lib/trial/__tests__/router.test.ts`
- `src/lib/memory/__tests__/gate.test.ts`

**Modify:**
- `src/store/trial.ts` — per-feature counts + caps, scrapbooks, richer letters, signup-prompt flag, drop seed
- `src/lib/trial/router.ts` — full read/write API coverage
- `src/lib/trial/intercept.ts` — letters/scrapbook/profile mutations + cap enforcement
- `src/hooks/useMemories.ts` — trial-aware gate (use `computeMemoryStatus`, drop threshold under `/try`)
- `src/components/Navigation.tsx` — trial variant (prefix links, "Sign up" pill, no profile)
- `src/components/LayoutContent.tsx` — `/try` gets full chrome, removed from immersive branch
- `src/app/try/page.tsx` — redirect to `/try/write`

**Delete:**
- `src/components/try/TryEntryScreen.tsx`
- `src/components/try/TryTour.tsx`
- `src/components/try/TryLetterDemo.tsx`
- `src/lib/trial/seed.ts`
- `src/app/try/write/page.tsx` (old free-play page — replaced by the new mirror page)
- `src/app/try/tour/page.tsx`

**Keep untouched (data layer):** `src/lib/trial/{blob-store,crypto}.ts`, `src/components/try/{TryModeProvider,TryInvite}.tsx`.

---

## Task 1: Rework the trial store (per-feature caps, scrapbooks, richer letters, no seed)

**Files:**
- Modify: `src/store/trial.ts`
- Test: `src/lib/trial/__tests__/trial-store.test.ts`

The current store has one `entryCount` and a single `TRIAL_ENTRY_LIMIT=5` wall, a plaintext `TrialLetter`, no scrapbooks, and seeds 16 entries on reset. Rework it to: per-feature counts (journals, letters, scrapbooks) each capped at 5; a richer letter shape that carries E2EE ciphertext; a scrapbooks collection; a `signupPrompt` flag for the cap modal; and an **empty** reset (no seed).

- [ ] **Step 1: Write the failing test**

Create `src/lib/trial/__tests__/trial-store.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app npx vitest run src/lib/trial/__tests__/trial-store.test.ts`
Expected: FAIL — `TRIAL_LIMIT` / `scrapbooks` / `atLimit` / `createScrapbook` not exported.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `src/store/trial.ts` with:

```ts
'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { JournalEntry } from '@/store/journal'

/** Per-feature cap: 5 journals, 5 letters, 5 scrapbook boards (each independent). */
export const TRIAL_LIMIT = 5

export type TrialFeature = 'journal' | 'letter' | 'scrapbook'

export interface TrialLetter {
  id: string
  type: 'self' | 'friend'
  /** E2EE ciphertext blob produced by the real compose flow (decrypts under the throwaway key). */
  contentCiphertext: string
  contentIVs: Record<string, string>
  recipientName: string | null
  recipientEmail: string | null
  createdAt: string
  /** Instant reveal in trial: always now (never a future week). */
  unlockDate: string | null
  isViewed: boolean
}

export interface TrialScrapbook {
  id: string
  title: string | null
  /** E2EE ciphertext of the items array. */
  items: string
  e2eeIVs: { items: string; title?: string }
  createdAt: string
  updatedAt: string
}

interface TrialState {
  version: number
  entries: JournalEntry[]
  letters: TrialLetter[]
  scrapbooks: TrialScrapbook[]
  journalCount: number
  letterCount: number
  scrapbookCount: number
  /** When a create is blocked by a cap, names the feature so the global modal can show. */
  signupPrompt: TrialFeature | null

  reset: () => void
  newestDate: () => string
  atLimit: (f: TrialFeature) => boolean
  promptSignup: (f: TrialFeature) => void
  dismissSignup: () => void

  createEntry: (draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles']; e2eeIVs?: Record<string, string> | null; textPreview?: string }) => string
  updateEntry: (id: string, draft: { text: string; song: string | null; photos?: JournalEntry['photos']; doodles?: JournalEntry['doodles']; e2eeIVs?: Record<string, string> | null; textPreview?: string }) => void

  createLetter: (l: { type: 'self' | 'friend'; contentCiphertext: string; contentIVs: Record<string, string>; recipientName: string | null; recipientEmail: string | null }) => string
  revealLetter: (id: string) => void

  createScrapbook: (s: { items: string; e2eeIVs: { items: string; title?: string }; title?: string | null }) => string
  updateScrapbook: (id: string, s: { title?: string | null; items: string; e2eeIVs: { items: string; title?: string } }) => void
}

const nextId = () => `trial-${crypto.randomUUID()}`

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      version: 2,
      entries: [],
      letters: [],
      scrapbooks: [],
      journalCount: 0,
      letterCount: 0,
      scrapbookCount: 0,
      signupPrompt: null,

      reset: () => {
        // No seed — the visitor's own writing fills the scenes. Empty = real empty states.
        set({ version: 2, entries: [], letters: [], scrapbooks: [], journalCount: 0, letterCount: 0, scrapbookCount: 0, signupPrompt: null })
      },

      newestDate: () => {
        const es = get().entries
        if (es.length === 0) return new Date().toISOString()
        return es.reduce((a, b) => (a.createdAt > b.createdAt ? a : b)).createdAt
      },

      atLimit: (f) => {
        const s = get()
        if (f === 'journal') return s.journalCount >= TRIAL_LIMIT
        if (f === 'letter') return s.letterCount >= TRIAL_LIMIT
        return s.scrapbookCount >= TRIAL_LIMIT
      },

      promptSignup: (f) => set({ signupPrompt: f }),
      dismissSignup: () => set({ signupPrompt: null }),

      createEntry: (draft) => {
        const id = nextId()
        const usedDays = new Set(get().entries.map(e => e.createdAt.slice(0, 10)))
        const candidate = new Date()
        candidate.setHours(12, 0, 0, 0)
        while (usedDays.has(candidate.toISOString().slice(0, 10))) {
          candidate.setDate(candidate.getDate() - 1)
        }
        const createdAt = candidate.toISOString()
        const textPreview = draft.e2eeIVs
          ? undefined
          : draft.textPreview ?? draft.text.replace(/<[^>]*>/g, '').slice(0, 80)
        const entry: JournalEntry = {
          id,
          text: draft.text,
          textPreview,
          createdAt,
          updatedAt: createdAt,
          song: draft.song ?? undefined,
          tags: [],
          doodles: draft.doodles ?? [],
          photos: draft.photos ?? [],
          entryType: 'normal',
          e2eeIVs: draft.e2eeIVs ?? null,
        }
        set(s => ({ entries: [entry, ...s.entries], journalCount: s.journalCount + 1 }))
        return id
      },

      updateEntry: (id, draft) => {
        set(s => ({
          entries: s.entries.map(e =>
            e.id === id
              ? {
                  ...e,
                  text: draft.text,
                  textPreview: draft.e2eeIVs
                    ? undefined
                    : draft.textPreview ?? draft.text.replace(/<[^>]*>/g, '').slice(0, 80),
                  song: draft.song ?? undefined,
                  photos: draft.photos ?? e.photos,
                  doodles: draft.doodles ?? e.doodles,
                  updatedAt: new Date().toISOString(),
                  e2eeIVs: draft.e2eeIVs ?? e.e2eeIVs,
                }
              : e
          ),
        }))
      },

      createLetter: (l) => {
        const id = nextId()
        const now = new Date().toISOString()
        set(s => ({
          letters: [
            {
              id,
              type: l.type,
              contentCiphertext: l.contentCiphertext,
              contentIVs: l.contentIVs,
              recipientName: l.recipientName,
              recipientEmail: l.recipientEmail,
              createdAt: now,
              unlockDate: now, // instant reveal — no 1-week wait in trial
              isViewed: false,
            },
            ...s.letters,
          ],
          letterCount: s.letterCount + 1,
        }))
        return id
      },

      revealLetter: (id) => {
        set(s => ({ letters: s.letters.map(l => (l.id === id ? { ...l, isViewed: true } : l)) }))
      },

      createScrapbook: (sb) => {
        const id = nextId()
        const now = new Date().toISOString()
        set(s => ({
          scrapbooks: [
            { id, title: sb.title ?? null, items: sb.items, e2eeIVs: sb.e2eeIVs, createdAt: now, updatedAt: now },
            ...s.scrapbooks,
          ],
          scrapbookCount: s.scrapbookCount + 1,
        }))
        return id
      },

      updateScrapbook: (id, sb) => {
        set(s => ({
          scrapbooks: s.scrapbooks.map(x =>
            x.id === id
              ? { ...x, title: sb.title ?? x.title, items: sb.items, e2eeIVs: sb.e2eeIVs, updatedAt: new Date().toISOString() }
              : x
          ),
        }))
      },
    }),
    {
      name: 'meethril-trial',
      storage: createJSONStorage(() =>
        typeof sessionStorage !== 'undefined' ? sessionStorage : (undefined as unknown as Storage)
      ),
      partialize: (s) => ({
        version: s.version,
        entries: s.entries,
        letters: s.letters,
        scrapbooks: s.scrapbooks,
        journalCount: s.journalCount,
        letterCount: s.letterCount,
        scrapbookCount: s.scrapbookCount,
      }),
    },
  ),
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec app npx vitest run src/lib/trial/__tests__/trial-store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/store/trial.ts src/lib/trial/__tests__/trial-store.test.ts
git commit -m "feat(try): per-feature trial caps + scrapbook/letter store, drop seed"
```

---

## Task 2: Delete the seed module

**Files:**
- Delete: `src/lib/trial/seed.ts`
- Verify: no remaining imports of `buildSeedEntries`

Task 1 already removed the `seed` import from the store. Confirm nothing else references it, then delete the file.

- [ ] **Step 1: Check for remaining references**

Run: `grep -rn "buildSeedEntries\|trial/seed" src/`
Expected: zero matches (Task 1 removed the store's import).

- [ ] **Step 2: Delete the file**

```bash
git rm src/lib/trial/seed.ts
```

- [ ] **Step 3: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no errors referencing `seed`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(try): remove demo seed module (trial starts empty)"
```

---

## Task 3: Extract + test the memory gate, then make it trial-aware

**Files:**
- Create: `src/lib/memory/gate.ts`
- Test: `src/lib/memory/__tests__/gate.test.ts`
- Modify: `src/hooks/useMemories.ts`

`useMemories` hardcodes `REQUIRED_JOURNALS=14` / `REQUIRED_TOTAL=20` and computes locked/ready inline. Extract the decision into a pure function so it's testable, then let `useMemories` read trial-lowered thresholds (1/1) when running under `/try` via the `useTryMode()` context.

- [ ] **Step 1: Write the failing test**

Create `src/lib/memory/__tests__/gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMemoryStatus, REQUIRED_JOURNALS, REQUIRED_TOTAL } from '@/lib/memory/gate'

describe('computeMemoryStatus', () => {
  it('locked below both thresholds (real values)', () => {
    expect(computeMemoryStatus(3, 5, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('locked')
  })
  it('ready when journals meet the journal threshold', () => {
    expect(computeMemoryStatus(14, 14, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('ready')
  })
  it('ready when total meets the total threshold even if journals short', () => {
    expect(computeMemoryStatus(5, 20, REQUIRED_JOURNALS, REQUIRED_TOTAL)).toBe('ready')
  })
  it('trial thresholds (1/1) unlock with a single journal', () => {
    expect(computeMemoryStatus(1, 1, 1, 1)).toBe('ready')
    expect(computeMemoryStatus(0, 0, 1, 1)).toBe('locked')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app npx vitest run src/lib/memory/__tests__/gate.test.ts`
Expected: FAIL — `@/lib/memory/gate` does not exist.

- [ ] **Step 3: Create the gate module**

Create `src/lib/memory/gate.ts`:

```ts
// Pure memory-unlock decision, extracted from useMemories so it can be unit-tested
// and so /try can lower the thresholds without duplicating the logic.

export const REQUIRED_JOURNALS = 14
export const REQUIRED_TOTAL = 20

export type MemoryGateStatus = 'locked' | 'ready'

/** Unlocked if journals reach the journal threshold OR total reaches the total threshold. */
export function computeMemoryStatus(
  journalCount: number,
  total: number,
  requiredJournals: number,
  requiredTotal: number,
): MemoryGateStatus {
  return journalCount >= requiredJournals || total >= requiredTotal ? 'ready' : 'locked'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec app npx vitest run src/lib/memory/__tests__/gate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire `useMemories` to the gate + trial thresholds**

In `src/hooks/useMemories.ts`:

1. Replace the local `REQUIRED_JOURNALS` / `REQUIRED_TOTAL` constants (line ~14) with a re-export from the gate module, and import the helper + the trial context:

```ts
import { computeMemoryStatus, REQUIRED_JOURNALS, REQUIRED_TOTAL } from '@/lib/memory/gate'
import { useTryMode } from '@/components/try/TryModeProvider'
export { REQUIRED_JOURNALS, REQUIRED_TOTAL }
```

2. Inside the hook body, derive the effective thresholds:

```ts
const trial = useTryMode()
const requiredJournals = trial ? 1 : REQUIRED_JOURNALS
const requiredTotal = trial ? 1 : REQUIRED_TOTAL
```

3. Replace the inline locked/ready computation (the `journalCount >= REQUIRED_JOURNALS || total >= REQUIRED_TOTAL` check, ~lines 100-105) with:

```ts
const gate = computeMemoryStatus(journalCount, total, requiredJournals, requiredTotal)
// ...where the code previously set status to 'locked'/'ready', use `gate`.
```

4. Populate the returned `progress` with the effective thresholds so `MemoryLocked` shows correct targets:

```ts
progress: { journals: journalCount, total, requiredJournals, requiredTotal }
```

> Note: `useTryMode()` reads a React context whose default is `false` (defined in `TryModeProvider.tsx`), so on real authed routes `trial` is `false` and behavior is identical to today. The context provider only wraps `/try/*`.

- [ ] **Step 6: Typecheck + full test run**

Run: `docker compose exec app npx tsc --noEmit && docker compose exec app npx vitest run`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/memory/gate.ts src/lib/memory/__tests__/gate.test.ts src/hooks/useMemories.ts
git commit -m "feat(try): trial-aware memory gate (ungate under /try, extract pure decision)"
```

---

## Task 4: Expand the trial router (read coverage for every scene)

**Files:**
- Modify: `src/lib/trial/router.ts`
- Test: `src/lib/trial/__tests__/router.test.ts`

The router currently returns empty letters and handles only entries. Expand its `TrialSnapshot` and routing to cover letters (inbox/sent/mine/arrived), scrapbooks (list/get), profile, profile-flags, and stranger-notes — all reading the snapshot. Writes are still applied in the interceptor (Task 5); the router returns the response shape only.

- [ ] **Step 1: Write the failing test**

Create `src/lib/trial/__tests__/router.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app npx vitest run src/lib/trial/__tests__/router.test.ts`
Expected: FAIL — `TrialSnapshot.scrapbooks` missing, letter shapes empty.

- [ ] **Step 3: Rewrite the router**

Replace the contents of `src/lib/trial/router.ts` with:

```ts
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
      e2eeIVs: l.contentIVs,
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
      e2eeIVs: l.contentIVs,
    }))
    return { status: 200, body: { letters, count: letters.length } }
  }
  if (p === '/api/letters/self' && m === 'POST') return { status: 201, body: { id: '__PENDING__' } }
  if (p === '/api/letters/friend' && m === 'POST') return { status: 201, body: { id: '__PENDING__' } }
  if (p === '/api/letters/drafts') return { status: 200, body: { letters: [] } }
  if (p.startsWith('/api/letters/') && (p.endsWith('/viewed') || p.endsWith('/read'))) return { status: 200, body: { ok: true } }

  // ---- Scrapbooks ----
  if (p === '/api/scrapbooks' && m === 'GET') {
    return { status: 200, body: snap.scrapbooks.map(s => ({ id: s.id, title: s.title, itemCount: 0, createdAt: s.createdAt, updatedAt: s.updatedAt })) }
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec app npx vitest run src/lib/trial/__tests__/router.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trial/router.ts src/lib/trial/__tests__/router.test.ts
git commit -m "feat(try): full read coverage in trial router (letters/scrapbook/profile/lights)"
```

---

## Task 5: Expand the interceptor (write mutations + cap enforcement)

**Files:**
- Modify: `src/lib/trial/intercept.ts`

Wire POST/PUT mutations for letters and scrapbooks into the store, and enforce the per-feature cap: when a create would exceed the cap, set the signup-prompt flag and return `403` so the create no-ops. Verified manually (interceptor patches `window.fetch`; not unit-tested per convention).

- [ ] **Step 1: Replace the JSON-mutation section of `intercept.ts`**

In `src/lib/trial/intercept.ts`, the block after the photo handling (the part that builds `parsedBody`, calls `routeTrialRequest`, and applies entry mutations) becomes:

```ts
    // JSON endpoints via the pure router
    let parsedBody: unknown = null
    if (init?.body && typeof init.body === 'string') {
      try { parsedBody = JSON.parse(init.body) } catch { parsedBody = null }
    }
    const snap = { entries: store.entries, letters: store.letters, scrapbooks: store.scrapbooks }
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
    if (base.startsWith('/api/scrapbooks/') && method === 'PUT') {
      const id = base.slice('/api/scrapbooks/'.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = parsedBody as { title?: string | null; items: string; e2eeIVs: { items: string; title?: string } }
      store.updateScrapbook(id, { title: d.title ?? null, items: d.items, e2eeIVs: d.e2eeIVs })
      return json(200, { id })
    }

    return json(res.status, res.body)
```

> Note: `store` here is the captured `useTrialStore.getState()` from the top of the interceptor; its action functions (`createLetter`, `atLimit`, etc.) operate on live state via `set`/`get`, so the captured reference is safe for mutations. Only re-read via `useTrialStore.getState()` when you need post-mutation values (as the entry POST does for `createdAt`).

- [ ] **Step 2: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no errors. (`snap.scrapbooks` now satisfies the updated `TrialSnapshot`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/trial/intercept.ts
git commit -m "feat(try): interceptor handles letter/scrapbook writes + per-feature cap (403 + signup prompt)"
```

---

## Task 6: Trial-aware Navigation (prefixed links, "Sign up" pill, no profile)

**Files:**
- Modify: `src/components/Navigation.tsx`

When `pathname.startsWith('/try')`, prefix every tab `href` with `/try`, compare active state against the prefixed path, drop the profile/avatar pill, and render a "Sign up" link to `/login` in its place. Real-route behavior is unchanged. Verified manually.

- [ ] **Step 1: Add the trial flag + prefixed tabs near the top of the component**

After `const pathname = usePathname()` (line ~22), add:

```tsx
  const isTrial = pathname.startsWith('/try')
  const navTabs = isTrial
    ? tabs.map(t => ({ ...t, href: `/try${t.href}` }))
    : tabs
```

Then change both `tabs.map(...)` loops (mobile line ~66 and desktop line ~134) to `navTabs.map(...)`. Active comparison (`pathname === tab.href`) already works because the prefixed hrefs match the prefixed pathname.

- [ ] **Step 2: Replace the mobile account pill (lines ~91-111)**

Replace the `{user && ( <Link href="/me"> ... </Link> )}` block with a trial-aware branch:

```tsx
        {isTrial ? (
          <Link href="/login" aria-label="Sign up">
            <motion.div
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="px-3 h-9 rounded-full flex items-center justify-center text-xs font-medium"
              style={{ background: `${theme.accent.primary}30`, color: theme.text.primary }}
            >
              Sign up
            </motion.div>
          </Link>
        ) : user && (
          <Link href="/me" aria-label={nickname || user.email || 'Profile'}>
            {/* ...existing avatar motion.div unchanged... */}
          </Link>
        )}
```

- [ ] **Step 3: Replace the desktop account pill (lines ~162-191)**

Replace the `{user && ( <> <divider/> <Link href="/me"> ... </Link> </> )}` block with:

```tsx
        {isTrial ? (
          <>
            <div className="w-px h-6 mx-1" style={{ background: theme.glass.border }} />
            <Link href="/login">
              <motion.div
                className="relative px-4 py-2 rounded-full text-sm font-medium"
                style={{ background: `${theme.accent.primary}30`, color: theme.text.primary }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Sign up
              </motion.div>
            </Link>
          </>
        ) : user && (
          <>
            <div className="w-px h-6 mx-1" style={{ background: theme.glass.border }} />
            <Link href="/me">
              {/* ...existing avatar motion.div unchanged... */}
            </Link>
          </>
        )}
```

> The `← MEETHRIL` backlink (desktop) and the existing `isMemoryPage` nav-bg logic stay as-is; on `/try/memory` the pathname check should also treat the prefixed path as the memory page. Update line ~48 to: `const isMemoryPage = pathname === '/memory' || pathname === '/try/memory'`.

- [ ] **Step 4: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "feat(try): trial-aware Navigation (/try-prefixed links, Sign up pill, no profile)"
```

---

## Task 7: LayoutContent — give `/try` the full real chrome

**Files:**
- Modify: `src/components/LayoutContent.tsx`

Today `/try` is in the immersive `isOnboardingPage` branch (no nav/gear/padding). Remove `/try` from that branch and route it through the **full authed chrome** (Background, AmbientSoundLayer, TopChromeBackdrop, Navigation, FullscreenButton, DeskSettingsPanel, padded `<main>`) — identical to the fallback authed layout, plus the `TryLimitModal` (Task 8) and the existing `TryInvite` floating button. Verified manually.

- [ ] **Step 1: Narrow the onboarding branch to onboarding only**

Change line ~74 from:

```tsx
  const isOnboardingPage = pathname.startsWith('/onboarding') || pathname.startsWith('/try')
```

to:

```tsx
  const isOnboardingPage = pathname.startsWith('/onboarding')
  const isTryPage = pathname.startsWith('/try')
```

- [ ] **Step 2: Add the import for the trial chrome**

Near the top imports, add:

```tsx
import TryInvite from '@/components/try/TryInvite'
import TryLimitModal from '@/components/try/TryLimitModal'
```

- [ ] **Step 3: Add a `/try` branch before the final fallback `return`**

Immediately before the final `return (` (line ~168), insert:

```tsx
  if (isTryPage) {
    // /try mirrors the real authed shell: full themed chrome + nav, plus the
    // trial-only conversion surfaces (floating invite + cap modal). The trial
    // memory diary uses the same fade-on-open behavior as the real /memory.
    return (
      <>
        <Background />
        <AmbientSoundLayer />
        <main className="relative z-10 min-h-screen pt-20 pb-8 px-4">
          <PageTransition>
            {children}
          </PageTransition>
        </main>
        <motion.div
          animate={{ opacity: diaryOpen ? 0 : 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ pointerEvents: diaryOpen ? 'none' : undefined }}
        >
          <TopChromeBackdrop />
          <FullscreenButton />
          <DeskSettingsPanel />
          <Navigation />
        </motion.div>
        <TryInvite />
        <TryLimitModal />
      </>
    )
  }
```

> `LockDiaryButton` is intentionally omitted (it's a logged-in journal-lock affordance). `InstallPrompt` and `LimitReachedModal` (the billing modal) are omitted — billing has no surface in `/try`.

- [ ] **Step 4: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: fails only on the missing `TryLimitModal` import — created in Task 8. If you do Task 8 first, this passes. Proceed to Task 8 then re-run.

- [ ] **Step 5: Commit (after Task 8 so the import resolves)**

```bash
git add src/components/LayoutContent.tsx
git commit -m "feat(try): full real chrome + nav for /try (out of the immersive branch)"
```

---

## Task 8: TryLimitModal (cap → signup) and route mirror + cleanup

**Files:**
- Create: `src/components/try/TryLimitModal.tsx`
- Create: `src/app/try/layout.tsx`
- Modify: `src/app/try/page.tsx`
- Create: `src/app/try/write/page.tsx` (replaces the deleted free-play page)
- Create: `src/app/try/letters/page.tsx`
- Create: `src/app/try/scrapbook/page.tsx`
- Create: `src/app/try/scrapbook/[id]/page.tsx`
- Create: `src/app/try/memory/page.tsx`
- Create: `src/app/try/shelf/page.tsx`
- Delete: `src/components/try/{TryEntryScreen,TryTour,TryLetterDemo}.tsx`, `src/app/try/tour/page.tsx`

The `/try` layout owns `TryModeProvider` so every mirror page shares one trial session. Each mirror page re-exports the real scene component. `TryLimitModal` watches `signupPrompt` and offers signup.

- [ ] **Step 1: Create `TryLimitModal`**

Create `src/components/try/TryLimitModal.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useTrialStore, TRIAL_LIMIT } from '@/store/trial'
import { useThemeStore } from '@/store/theme'

const LABELS: Record<string, string> = {
  journal: 'journal entries',
  letter: 'letters',
  scrapbook: 'scrapbooks',
}

export default function TryLimitModal() {
  const prompt = useTrialStore(s => s.signupPrompt)
  const dismiss = useTrialStore(s => s.dismissSignup)
  const { theme } = useThemeStore()

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={dismiss}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="max-w-sm w-full rounded-2xl p-6 text-center"
            style={{ background: theme.bg.primary, border: `1px solid ${theme.glass.border}`, color: theme.text.primary }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-lg mb-2" style={{ color: theme.text.primary }}>
              You&apos;ve filled your {LABELS[prompt] ?? 'trial'}.
            </p>
            <p className="text-sm mb-5" style={{ color: theme.text.muted }}>
              The trial holds {TRIAL_LIMIT} of each. Make it permanent to keep going — your real space starts fresh and private.
            </p>
            <Link href="/login">
              <span
                className="inline-block px-5 py-2.5 rounded-full text-sm font-medium"
                style={{ background: theme.accent.primary, color: theme.bg.primary }}
              >
                Make it permanent
              </span>
            </Link>
            <button onClick={dismiss} className="block w-full mt-3 text-xs" style={{ color: theme.text.muted }}>
              keep looking around
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Create the `/try` layout**

Create `src/app/try/layout.tsx`:

```tsx
import TryModeProvider from '@/components/try/TryModeProvider'

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return <TryModeProvider>{children}</TryModeProvider>
}
```

- [ ] **Step 3: Make `/try` redirect to `/try/write`**

Replace `src/app/try/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

export default function TryPage() {
  redirect('/try/write')
}
```

- [ ] **Step 4: Create the mirror pages**

`src/app/try/write/page.tsx`:

```tsx
'use client'

import DeskScene from '@/components/desk/DeskScene'

export default function TryWritePage() {
  return <DeskScene />
}
```

`src/app/try/letters/page.tsx` — re-export the real letters page component (it's the default export of `src/app/letters/page.tsx`):

```tsx
export { default } from '@/app/letters/page'
```

`src/app/try/scrapbook/page.tsx`:

```tsx
'use client'

import ScrapbookListingView from '@/components/scrapbook/listing/ScrapbookListingView'

export default function TryScrapbookPage() {
  return <ScrapbookListingView />
}
```

`src/app/try/scrapbook/[id]/page.tsx` — re-export the real per-scrapbook page:

```tsx
export { default } from '@/app/scrapbook/[id]/page'
```

`src/app/try/memory/page.tsx`:

```tsx
export { default } from '@/app/memory/page'
```

`src/app/try/shelf/page.tsx`:

```tsx
export { default } from '@/app/shelf/page'
```

> Re-exporting `@/app/.../page` reuses the exact real scene with zero duplication. Verify each target's default export is a client component or a server component that itself renders client children — both work under the `/try` layout. If a target page reads route params (e.g. `/scrapbook/[id]`), the `[id]` segment under `/try` supplies them identically.

- [ ] **Step 5: Delete the obsolete custom-UI files**

```bash
git rm src/components/try/TryEntryScreen.tsx src/components/try/TryTour.tsx src/components/try/TryLetterDemo.tsx src/app/try/tour/page.tsx
```

> If `src/app/try/write/page.tsx` already existed (old free-play page), Step 4 overwrote it — that's intended.

- [ ] **Step 6: Confirm no dangling imports**

Run: `grep -rn "TryEntryScreen\|TryTour\|TryLetterDemo" src/`
Expected: zero matches.

- [ ] **Step 7: Typecheck + full test run**

Run: `docker compose exec app npx tsc --noEmit && docker compose exec app npx vitest run`
Expected: no type errors; all Vitest suites pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/try src/components/try/TryLimitModal.tsx
git commit -m "feat(try): route mirror (/try/{write,letters,scrapbook,memory,shelf}) + cap modal, drop tour/demo UI"
```

---

## Task 9: Restart, then manual verification

**Files:** none (verification only)

Per CLAUDE.md, UI is verified manually on the running app on the active theme + one contrasting theme, logged-in test account NOT used (this is the anonymous flow — open `/try` in a tab without logging in; if logged in, `/try` bounces to `/me`, which itself is a thing to verify).

- [ ] **Step 1: Restart the app**

Run: `docker compose restart app` then `docker compose logs -f app` until ready. App at http://localhost:3112.

- [ ] **Step 2: Walk the flow on a dark theme (e.g. rivendell) and a light theme (e.g. rose)**

For each theme, confirm:
- [ ] `/try` redirects to `/try/write`; the journal desk renders with the real chrome (themed Background, nav pill, gear). No console errors.
- [ ] Nav shows Write / Scrapbook / Letters / Shelf / Memory + a **Sign up** pill (no avatar, no profile). Theme gear opens `DeskSettingsPanel`; switching theme repaints the whole shell (no hardcoded cream panels).
- [ ] Write an entry → it autosaves (no error). Navigate to `/try/memory` → the entry appears immediately (gate ungated; not the locked screen).
- [ ] Compose a self-letter → seal → it reveals instantly (no week wait, no email). It shows in the letters inbox/arrived.
- [ ] Create a scrapbook board, add a photo (photo round-trips through IndexedDB), reopen it — content persists within the session.
- [ ] Reload the tab → writes persist (sessionStorage). Open a fresh tab to `/try` → starts empty.
- [ ] Hit a cap: create letters/scrapbooks until the 6th attempt → `TryLimitModal` appears with "Make it permanent" → `/login`.
- [ ] Floating `TryInvite` button still present and links to `/login`.
- [ ] Mobile viewport (resize): nav pill is the mobile variant with the Sign up pill; scenes use their mobile layouts (MobileLettersView, ButterflyMemoryView).

- [ ] **Step 3: Seatbelt check**

- [ ] Log in with the test account (`.dev-creds.local`), then visit `/try` → redirected to `/me` (throwaway key never touches real data). Log out to return to anonymous.

- [ ] **Step 4: Dispatch the hearth-reviewer agent on the diff**

Review the full branch diff against Hearth invariants (dual-editor parity, E2EE tiers, entry-lock append-only, theme-awareness, photo adapter, additive migrations — note: this change adds no Prisma migration). Resolve every 🔴/🟠 finding.

- [ ] **Step 5: Final commit / branch wrap-up**

Use `superpowers:finishing-a-development-branch` to decide merge/PR.

---

## Self-Review

**Spec coverage:**
- Route mirror under `/try/*` → Task 8 ✓
- Trial-aware Navigation (no profile, Sign up) → Task 6 ✓
- LayoutContent trial branch, full chrome → Task 7 ✓
- Trial router expansion (letters/scrapbook/profile/profile-flags/stranger-notes) → Tasks 4 (reads) + 5 (writes) ✓
- Instant/faked letters → store `unlockDate=now` (Task 1) + router arrived/inbox (Task 4) ✓
- Memory ungated in `/try` → Task 3 ✓
- No seed → Tasks 1 + 2 ✓
- 5-per-feature caps + conversion (cap wall + nav link + floating button) → Task 1 (caps) + 5 (enforce) + 6 (nav link) + 8 (modal, keep TryInvite) ✓
- Deletions (TryEntryScreen/TryTour/TryLetterDemo/seed.ts + old routes) → Tasks 2 + 8 ✓
- Fresh-start on signup (discard trial data) → inherent: trial store is sessionStorage, login navigates away; no migration code needed ✓

**Placeholder scan:** none — all steps carry concrete code/commands.

**Type consistency:** `TRIAL_LIMIT`, `TrialFeature`, `TrialLetter`, `TrialScrapbook`, `atLimit`, `createLetter`, `createScrapbook`, `updateScrapbook`, `promptSignup`, `dismissSignup`, `signupPrompt` are defined in Task 1 and used identically in Tasks 4/5/8. `computeMemoryStatus`/`REQUIRED_JOURNALS`/`REQUIRED_TOTAL` defined in Task 3 gate module and consumed in `useMemories`. `TrialSnapshot` gains `scrapbooks` in Task 4 and is satisfied by the interceptor's `snap` in Task 5.

**Known cosmetic limitation:** scrapbook listing `itemCount` is returned as `0` (the canvas sends only ciphertext on PUT, so item count can't be derived server-side in the trial). Acceptable for the sandbox; noted so it isn't mistaken for a bug.
