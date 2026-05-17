# Letter Compose Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the redesigned letter compose flow described in [2026-05-15-letter-compose-redesign-design.md](../specs/2026-05-15-letter-compose-redesign-design.md): ceremonial recipient picker → two-page postcard (front lines, back-left lines + back-right media) → recipient-aware seal modal → drafts surfaced in the Sent tab.

**Architecture:** UI-only changes against Phase 2 reality. Compose writes to `JournalEntry` with master-key E2EE encryption; photos/song/doodle reuse existing journal components and `/api/photos` adapter verbatim. Front and back-left are two independent TipTap editor instances (`bodyFront`, `bodyBack`) concatenated at autosave time. Two backend additions: a `GET /api/letters/drafts` route (dual-read against the new `Letter` table per Phase 2 helper) and a 30-day cap validator on `/api/entries/[id]/seal` for friend letters.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 5 (Postgres), TipTap (`@tiptap/extension-character-count` for caps), Framer Motion v12, Zustand, existing E2EE master-key + photo storage adapter. Docker for dev (`docker compose exec app …`) on `localhost:3112`. npm only.

**Verification approach:** Per project convention (`feedback_skip_tests.md`), this plan does NOT add unit tests. Every task ends in a manual Docker verification (browser interaction or `psql` row inspection) followed by a commit. Final smoke test is Task 10.

---

## Plan-wide architectural decisions

These choices are referenced across tasks. If a task seems inconsistent, return here.

1. **Two independent TipTap editor instances on the same letter.** `bodyFront` and `bodyBack` are separate strings owned by `ComposeView` state. The TipTap CharacterCount extension's `limit` option enforces the hard cap on each editor — typing past the limit becomes a no-op, including Enter. On autosave, `text` on the row is computed as `bodyFront + "\n\n" + bodyBack` (or `bodyFront` alone when the back is empty). This matches the "real letter" model from the spec; no rebalancing between pages.

2. **Picker emits two values; compose translates to `entryType`.** `RecipientPicker` emits `{recipient: 'self' | 'friend', name?: string}`. `ComposeView` maps `'self'` → `entryType: 'letter'` and `'friend'` → `entryType: 'unsent_letter'` for the `POST /api/entries` autosave. This mirrors the existing `mapRecipientToSchema()` helper in `letterTypes.ts` — reuse it, don't reinvent.

3. **Resumed drafts skip the picker.** When `/letters/write?id={draftId}` is opened with an `id` query param, `ComposeView` fetches the draft row, reads `entryType` to determine recipient, and jumps straight to the front page with `bodyFront`/`bodyBack` hydrated from the saved `text` (split on the `\n\n` separator if present; else everything goes into `bodyFront` up to its cap with overflow into `bodyBack`).

4. **The folded animation lives inside `SealModal`'s success state.** Don't keep `PostcardFolded` as a separate phase — fold-the-letter is a brief visual beat after the modal confirms. Reuse the existing folded-card visuals as a sub-component if helpful; otherwise inline the fold animation in the modal.

5. **Date stamp source.** The date label on the front (`"Friday, May 15 · night"`) reads from `entry.createdAt` for an existing draft, and from `new Date()` for a brand-new draft (pre-autosave). Use the existing time-of-day formatter from `PostcardFront.tsx`. The spec flagged this as a knob — we pick `createdAt` for now; document the decision and revisit if it feels wrong in smoke test.

6. **The friend-letter 30-day cap is enforced both client and server.** Client = `SealModal` validates before submit. Server = `/api/entries/[id]/seal` returns 400 when `entryType: 'unsent_letter'` and `unlockDate > now + 30 days`. Self-letter unlock-date validation stays as it is today.

7. **Drafts route is a new sibling of `/sent`.** `GET /api/letters/drafts` returns `isSealed: false` rows authored by the user, using the Phase 2 `findLetterForRead` / `listLettersForRead` pattern. Response shape mirrors `/api/letters/sent` so frontend formatting reuses existing helpers.

---

## File structure

### Files to CREATE

| Path | Responsibility |
|------|----------------|
| `src/components/letters/compose/RecipientPicker.tsx` | Ceremonial interstitial. Two cards (Future me / A friend); friend selection morphs to a name input. Emits `{recipient, name?}` on submit. |
| `src/components/letters/compose/SealModal.tsx` | Recipient-aware seal modal. Date pills + email field (friend only) + 30-day cap. Owns the brief fold animation on confirm. |
| `src/components/letters/sent/DraftsSection.tsx` | Pinned drafts list at top of Sent tab. Fetches `/api/letters/drafts`, renders cards with name/edit-time/preview, `⋯` discard menu. |
| `src/app/api/letters/drafts/route.ts` | New `GET` route that returns unsealed letters owned by the user. Uses Phase 2 dual-read helper. |

### Files to MODIFY

| Path | Change |
|------|--------|
| `src/app/api/entries/[id]/seal/route.ts` | Add 30-day cap validation for `entryType: 'unsent_letter'`. Reject `recipientEmail` when self; require well-formed `recipientEmail` when friend. |
| `src/components/letters/compose/ComposeView.tsx` | New phase order: `picker → front → back → sealing`. Hold body as `{bodyFront, bodyBack}`. Wire `RecipientPicker` as phase 0, `SealModal` for the seal moment. Handle draft-resume by reading `?id=` and skipping picker. Drop the old unlock-pills/email rendering paths. |
| `src/components/letters/compose/PostcardFront.tsx` | Remove recipient toggle. Add a top header band (date left, stamp right). Pre-print non-editable salutation above the lines. Mount the TipTap editor with CharacterCount limit. Glow animation on "turn over" when at cap. Remove "turn it over to write your letter" hint. |
| `src/components/letters/compose/PostcardBack.tsx` | Split 60/40 left/right. Left = continuation TipTap editor (independent instance bound to `bodyBack`) with same CharacterCount limit. Right = song slot (top), 2 photos (middle, polaroid), doodle (bottom). Drop unlock-pills + email. Footer with "← turn back" and "fold and seal →". |
| `src/components/letters/compose/PostcardFolded.tsx` | Either remove (if redundant) or trim to a small fold-animation sub-component used by `SealModal`. Implementation will decide; this plan defaults to a trim. |
| `src/components/letters/sent/SentView.tsx` | Render `<DraftsSection />` above the existing sent list. |
| `src/components/letters/letterTypes.ts` | Add a helper type `RecipientChoice = { recipient: 'self' \| 'friend', name?: string }` for the picker contract if not already present. |

### Files NOT touched

- `src/app/api/letters/{inbox,sent,arrived,mine,received,[id]}/...` — already dual-read in Phase 2; unchanged here.
- `src/app/api/entries/route.ts` and `src/app/api/entries/[id]/route.ts` — autosave POST/PUT already accept all the fields we use.
- `src/app/api/cron/deliver-letters/route.ts` — cron unchanged.
- `src/hooks/useAutosaveEntry.ts` — reused unchanged.
- `src/lib/letters/dual-read.ts` — reused unchanged.
- Photos / song / doodle component files in `src/components/` (journal versions) — reused verbatim.

---

## Task 1: Add 30-day cap and recipient validation to `/api/entries/[id]/seal`

Backend foundation that can ship before any UI lands. Adds defense-in-depth so even if the UI is bypassed, friend letters can't be sealed > 30 days out.

**Files:**
- Modify: `src/app/api/entries/[id]/seal/route.ts`

- [ ] **Step 1: Read the existing seal route**

Run:
```bash
docker compose exec app cat src/app/api/entries/[id]/seal/route.ts
```

Confirm it validates: entry exists, user owns it, `entryType` is `letter`/`unsent_letter`, `unlockDate` is set. Note where the validation block lives.

- [ ] **Step 2: Add the cap + recipient validation**

Inside the route's POST handler, after the existing entry-ownership and entryType checks, before the `prisma.journalEntry.update` call, add:

```typescript
const body = await req.json()
const unlockDate = new Date(body.unlockDate)
const recipientEmail = body.recipientEmail ?? null

// Friend letters: must have a well-formed email AND be within 30 days.
if (entry.entryType === 'unsent_letter') {
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json(
      { error: 'A valid recipient email is required for friend letters.' },
      { status: 400 }
    )
  }
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  if (unlockDate > maxDate) {
    return NextResponse.json(
      { error: 'Friend letters must arrive within 30 days.' },
      { status: 400 }
    )
  }
}

// Self letters: no recipient email permitted.
if (entry.entryType === 'letter' && recipientEmail) {
  return NextResponse.json(
    { error: 'Self letters cannot have a recipient email.' },
    { status: 400 }
  )
}
```

Then in the existing `prisma.journalEntry.update` call, include `recipientEmail` in the `data:` block for friend letters (it may already be there from autosave — confirm and skip if so). Set `unlockDate` from validated value.

- [ ] **Step 3: Type-check**

Run:
```bash
docker compose exec app npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Manual verify with curl (or browser DevTools fetch)**

Set up: seed a friend-letter draft via the existing UI (or use Prisma Studio at `:5556` if the override file maps it). Get its id.

```bash
# Reject > 30 days
curl -X POST http://localhost:3112/api/entries/<id>/seal \
  -H 'content-type: application/json' \
  --cookie 'hearth-auth-token=<token>' \
  -d '{"unlockDate":"2026-07-01T00:00:00Z","recipientEmail":"x@example.com"}'
# Expected: 400 "Friend letters must arrive within 30 days."

# Reject missing/bad email
curl -X POST http://localhost:3112/api/entries/<id>/seal \
  -H 'content-type: application/json' \
  --cookie 'hearth-auth-token=<token>' \
  -d '{"unlockDate":"2026-05-22T00:00:00Z","recipientEmail":"not-an-email"}'
# Expected: 400 "A valid recipient email is required..."

# Accept valid friend seal
curl -X POST http://localhost:3112/api/entries/<id>/seal \
  -H 'content-type: application/json' \
  --cookie 'hearth-auth-token=<token>' \
  -d '{"unlockDate":"2026-05-22T00:00:00Z","recipientEmail":"x@example.com"}'
# Expected: 200
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/entries/[id]/seal/route.ts
git commit -m "feat(letters): 30-day cap and email validation on seal"
```

---

## Task 2: Add `GET /api/letters/drafts` route

New sibling of `/api/letters/sent`. Returns unsealed letters owned by the user. Uses the existing Phase 2 dual-read helper.

**Files:**
- Create: `src/app/api/letters/drafts/route.ts`

- [ ] **Step 1: Read the existing sent route and dual-read helper**

Run:
```bash
docker compose exec app cat src/app/api/letters/sent/route.ts src/lib/letters/dual-read.ts
```

Note the exact export names (`listLettersForRead` or similar) and the response shape `/sent` returns.

- [ ] **Step 2: Create the drafts route**

Create `src/app/api/letters/drafts/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listLettersForRead } from '@/lib/letters/dual-read'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Drafts = letter/unsent_letter rows the user authored, not yet sealed.
  const drafts = await listLettersForRead({
    userId: user.id,
    where: {
      entryType: { in: ['letter', 'unsent_letter'] },
      isSealed: false,
      isArchived: false,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ drafts })
}
```

Adjust the import names and `listLettersForRead` signature to match what the Phase 2 helper actually exposes — read `src/lib/letters/dual-read.ts` first and align field names (it may take `where` differently; mirror what `/sent` does).

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 4: Manual verify**

In the browser DevTools or curl:

```bash
curl http://localhost:3112/api/letters/drafts --cookie 'hearth-auth-token=<token>'
# Expected: 200, JSON with a "drafts" array. Spot-check that any unsealed letter rows show up.
```

If no drafts exist yet, create one quickly by starting a compose flow and not sealing, then re-call.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/letters/drafts/route.ts
git commit -m "feat(letters): GET /api/letters/drafts for unsealed letters"
```

---

## Task 3: Build the `RecipientPicker` component

Ceremonial interstitial. Two cards. Friend selection morphs into a name input. Emits the choice up to the parent.

**Files:**
- Create: `src/components/letters/compose/RecipientPicker.tsx`
- Modify (if needed): `src/components/letters/letterTypes.ts` — add `RecipientChoice` type if missing.

- [ ] **Step 1: Add the `RecipientChoice` type if not present**

Read `src/components/letters/letterTypes.ts`. If a type like `RecipientChoice` or `RecipientSelection` doesn't already exist, append:

```typescript
export type RecipientChoice =
  | { recipient: 'self' }
  | { recipient: 'friend'; name: string }
```

- [ ] **Step 2: Create the picker component**

Create `src/components/letters/compose/RecipientPicker.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { RecipientChoice } from '../letterTypes'

export function RecipientPicker({
  onSubmit,
  onCancel,
}: {
  onSubmit: (choice: RecipientChoice) => void
  onCancel: () => void
}) {
  const theme = useThemeStore((s) => s.theme)
  const [mode, setMode] = useState<'idle' | 'friend-name'>('idle')
  const [name, setName] = useState('')

  function handleFriendSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ recipient: 'friend', name: trimmed })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{ color: theme.text.primary }}
    >
      <div className="w-full max-w-xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-serif text-2xl mb-10 italic"
          style={{ color: theme.text.primary }}
        >
          Who&apos;s this letter for?
        </motion.h2>

        <AnimatePresence mode="wait">
          {mode === 'idle' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 gap-5"
            >
              <button
                type="button"
                onClick={() => onSubmit({ recipient: 'self' })}
                className="rounded-2xl p-7 transition-colors hover:bg-white/30 text-left"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: `${theme.bg.primary}80`,
                }}
              >
                <div className="text-lg font-serif mb-1">Future me</div>
                <div className="text-sm opacity-70">
                  a note to yourself, later
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('friend-name')}
                className="rounded-2xl p-7 transition-colors hover:bg-white/30 text-left"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: `${theme.bg.primary}80`,
                }}
              >
                <div className="text-lg font-serif mb-1">A friend</div>
                <div className="text-sm opacity-70">
                  delivered to their email, within 30 days
                </div>
              </button>
            </motion.div>
          )}

          {mode === 'friend-name' && (
            <motion.form
              key="name"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleFriendSubmit}
              className="mx-auto max-w-sm"
            >
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="who is this for?"
                className="w-full text-center text-lg italic px-4 py-3 rounded-xl outline-none"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: `${theme.bg.primary}b3`,
                  color: theme.text.primary,
                }}
              />
              <div className="mt-5 flex items-center justify-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('idle')
                    setName('')
                  }}
                  className="opacity-70 hover:opacity-100"
                  style={{ color: theme.text.primary }}
                >
                  ← back
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-full text-sm disabled:opacity-30"
                  style={{
                    backgroundColor: theme.accent?.primary ?? theme.text.primary,
                    color: theme.bg.primary,
                  }}
                >
                  continue
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onCancel}
          className="mt-10 text-sm opacity-60 hover:opacity-100"
          style={{ color: theme.text.primary }}
        >
          ← cancel
        </button>
      </div>
    </div>
  )
}
```

Verify the theme store access pattern matches what other Hearth components use (e.g., look at `PostcardFront.tsx` for the current `useThemeStore` import and theme shape; align the property names — `theme.text.primary`, `theme.bg.primary`, `theme.accent?.primary` may differ in your codebase).

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 4: Commit (without wiring yet — UI render will happen in Task 7)**

```bash
git add src/components/letters/compose/RecipientPicker.tsx src/components/letters/letterTypes.ts
git commit -m "feat(letters): RecipientPicker interstitial component"
```

---

## Task 4: Build the `SealModal` component

Recipient-aware seal flow. Date pills + (friend) email field. 30-day cap on friend custom date. On confirm: brief fold animation, then call `onSealed`.

**Files:**
- Create: `src/components/letters/compose/SealModal.tsx`

- [ ] **Step 1: Read `SomedayDatePicker.tsx` (existing date picker) to know if reusable**

```bash
docker compose exec app cat src/components/letters/compose/SomedayDatePicker.tsx
```

If it accepts a `maxDate` prop, use it for the friend-letter custom date. If not, the modal embeds its own native `<input type="date" max="..." />` for friends and reuses `SomedayDatePicker` for self.

- [ ] **Step 2: Create the modal**

Create `src/components/letters/compose/SealModal.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

type SelfPill = '1w' | '1m' | '6m' | '1y' | 'custom'
type FriendPill = '1w' | '2w' | '30d' | 'custom'

function dateForSelf(p: Exclude<SelfPill, 'custom'>): Date {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  if (p === '1w') return new Date(now + 7 * day)
  if (p === '1m') return new Date(now + 30 * day)
  if (p === '6m') return new Date(now + 182 * day)
  return new Date(now + 365 * day)
}

function dateForFriend(p: Exclude<FriendPill, 'custom'>): Date {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  if (p === '1w') return new Date(now + 7 * day)
  if (p === '2w') return new Date(now + 14 * day)
  return new Date(now + 30 * day)
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function SealModal({
  recipient,
  onClose,
  onSealed,
  onSeal,
}: {
  recipient: 'self' | 'friend'
  onClose: () => void
  onSealed: () => void
  onSeal: (data: { unlockDate: Date; recipientEmail?: string }) => Promise<void>
}) {
  const theme = useThemeStore((s) => s.theme)

  const [selfPill, setSelfPill] = useState<SelfPill>('1m')
  const [selfCustom, setSelfCustom] = useState<string>('')

  const [friendPill, setFriendPill] = useState<FriendPill>('1w')
  const [friendCustom, setFriendCustom] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'form' | 'folding' | 'sealed'>('form')

  const maxFriendDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const maxFriendIso = maxFriendDate.toISOString().split('T')[0]
  const minIso = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  function resolveDate(): Date | null {
    if (recipient === 'self') {
      if (selfPill !== 'custom') return dateForSelf(selfPill)
      if (!selfCustom) return null
      return new Date(selfCustom)
    }
    if (friendPill !== 'custom') return dateForFriend(friendPill)
    if (!friendCustom) return null
    return new Date(friendCustom)
  }

  async function handleConfirm() {
    setError(null)
    const date = resolveDate()
    if (!date || Number.isNaN(date.valueOf())) {
      setError('Pick a date.')
      return
    }
    if (recipient === 'friend') {
      if (date > maxFriendDate) {
        setError('Friend letters must arrive within 30 days.')
        return
      }
      if (!EMAIL_REGEX.test(email.trim())) {
        setError('Enter a valid email.')
        return
      }
    }

    setBusy(true)
    try {
      await onSeal({
        unlockDate: date,
        recipientEmail: recipient === 'friend' ? email.trim() : undefined,
      })
      setPhase('folding')
      setTimeout(() => {
        setPhase('sealed')
        setTimeout(() => onSealed(), 700)
      }, 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
          style={{
            backgroundColor: theme.bg.primary,
            color: theme.text.primary,
          }}
        >
          {phase === 'form' && (
            <>
              <h3 className="font-serif text-xl mb-5 italic text-center">
                {recipient === 'self'
                  ? 'When should this find you?'
                  : 'When should it arrive?'}
              </h3>

              {recipient === 'friend' && (
                <>
                  <label className="block text-xs uppercase tracking-wider opacity-60 mb-2">
                    Their email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@example.com"
                    className="w-full px-4 py-3 mb-5 rounded-xl outline-none"
                    style={{
                      border: `1px solid ${theme.text.primary}33`,
                      backgroundColor: `${theme.bg.primary}b3`,
                      color: theme.text.primary,
                    }}
                  />
                </>
              )}

              <div className="flex flex-wrap gap-2 mb-3">
                {recipient === 'self'
                  ? (['1w', '1m', '6m', '1y', 'custom'] as SelfPill[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelfPill(p)}
                        className="px-3 py-1.5 rounded-full text-sm"
                        style={{
                          backgroundColor:
                            selfPill === p
                              ? theme.accent?.primary ?? theme.text.primary
                              : 'transparent',
                          color:
                            selfPill === p ? theme.bg.primary : theme.text.primary,
                          border: `1px solid ${theme.text.primary}33`,
                        }}
                      >
                        {labelForSelf(p)}
                      </button>
                    ))
                  : (['1w', '2w', '30d', 'custom'] as FriendPill[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFriendPill(p)}
                        className="px-3 py-1.5 rounded-full text-sm"
                        style={{
                          backgroundColor:
                            friendPill === p
                              ? theme.accent?.primary ?? theme.text.primary
                              : 'transparent',
                          color:
                            friendPill === p
                              ? theme.bg.primary
                              : theme.text.primary,
                          border: `1px solid ${theme.text.primary}33`,
                        }}
                      >
                        {labelForFriend(p)}
                      </button>
                    ))}
              </div>

              {recipient === 'self' && selfPill === 'custom' && (
                <input
                  type="date"
                  value={selfCustom}
                  min={minIso}
                  onChange={(e) => setSelfCustom(e.target.value)}
                  className="w-full px-4 py-3 mb-3 rounded-xl outline-none"
                  style={{
                    border: `1px solid ${theme.text.primary}33`,
                    backgroundColor: `${theme.bg.primary}b3`,
                    color: theme.text.primary,
                  }}
                />
              )}
              {recipient === 'friend' && friendPill === 'custom' && (
                <input
                  type="date"
                  value={friendCustom}
                  min={minIso}
                  max={maxFriendIso}
                  onChange={(e) => setFriendCustom(e.target.value)}
                  className="w-full px-4 py-3 mb-3 rounded-xl outline-none"
                  style={{
                    border: `1px solid ${theme.text.primary}33`,
                    backgroundColor: `${theme.bg.primary}b3`,
                    color: theme.text.primary,
                  }}
                />
              )}

              {error && (
                <p className="text-sm text-red-700 mb-3 text-center">{error}</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm opacity-70 hover:opacity-100"
                  style={{ color: theme.text.primary }}
                >
                  cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirm}
                  className="px-5 py-2.5 rounded-full text-sm disabled:opacity-30"
                  style={{
                    backgroundColor:
                      theme.accent?.primary ?? theme.text.primary,
                    color: theme.bg.primary,
                  }}
                >
                  {busy
                    ? 'sealing...'
                    : recipient === 'self'
                    ? 'seal it'
                    : 'seal and send'}
                </button>
              </div>
            </>
          )}

          {phase !== 'form' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center font-serif italic text-lg"
            >
              {phase === 'folding' ? 'folding...' : 'sealed.'}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function labelForSelf(p: SelfPill): string {
  return p === '1w'
    ? '1 week'
    : p === '1m'
    ? '1 month'
    : p === '6m'
    ? '6 months'
    : p === '1y'
    ? '1 year'
    : 'custom'
}

function labelForFriend(p: FriendPill): string {
  return p === '1w'
    ? '1 week'
    : p === '2w'
    ? '2 weeks'
    : p === '30d'
    ? '30 days'
    : 'custom'
}
```

Adjust theme imports/property names as needed for your codebase (see Task 3 step 2 for the pattern).

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/letters/compose/SealModal.tsx
git commit -m "feat(letters): SealModal with recipient-aware date pills"
```

---

## Task 5: Redesign `PostcardFront`

Remove recipient toggle. Add header band (date left, stamp right). Pre-print non-editable salutation. Mount editor with CharacterCount limit. Glow animation on the "turn over" button when at cap.

**Files:**
- Modify: `src/components/letters/compose/PostcardFront.tsx`

- [ ] **Step 1: Read the current `PostcardFront.tsx` end-to-end**

```bash
docker compose exec app cat src/components/letters/compose/PostcardFront.tsx
```

Note: where the time-of-day label is computed, how the lined background gradient is composed, where the existing TipTap editor is mounted, what props are accepted. We will rewrite the layout but preserve the visual aesthetic (lined paper, paper gradient, Caveat type).

- [ ] **Step 2: Confirm or install `@tiptap/extension-character-count`**

```bash
docker compose exec app grep "@tiptap/extension-character-count" package.json
```

If not present:

```bash
docker compose exec app npm install @tiptap/extension-character-count
```

- [ ] **Step 3: Define the front layout + cap helper at the top of the file**

Add (near the top, after imports):

```typescript
import CharacterCount from '@tiptap/extension-character-count'

// Tuned during smoke test. ~9 lines × ~36 chars = ~324 chars cap per page.
export const FRONT_CHAR_LIMIT = 324
const FRONT_LINES = 9
```

- [ ] **Step 4: Replace the component body**

Replace the existing component with this layout (preserve the existing paper-gradient / lined-background constants; copy them from the current file if they live there):

```typescript
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

export const FRONT_CHAR_LIMIT = 324
const FRONT_LINES = 9

function timeOfDay(d: Date): string {
  const h = d.getHours()
  if (h < 5) return 'late night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

function formatDateLabel(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'long' })
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day}, ${md} · ${timeOfDay(d)}`
}

export function PostcardFront({
  salutationName,           // string used in "Dear ___,"
  body,
  onBodyChange,
  onTurnOver,
  onCancel,
  createdAt,                // Date for the header band
}: {
  salutationName: string
  body: string
  onBodyChange: (next: string) => void
  onTurnOver: () => void
  onCancel: () => void
  createdAt: Date
}) {
  const theme = useThemeStore((s) => s.theme)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Placeholder.configure({ placeholder: '' }),
      CharacterCount.configure({ limit: FRONT_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      onBodyChange(editor.getText())
    },
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
  })

  const atCap =
    (editor?.storage.characterCount.characters() ?? 0) >= FRONT_CHAR_LIMIT

  return (
    <div
      className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl"
      style={{
        backgroundImage:
          'linear-gradient(180deg, #fff6f2 0%, #fbe6dd 100%)',
        color: '#3d342a',
      }}
    >
      {/* HEADER BAND — date left, stamp right */}
      <div className="absolute inset-x-0 top-0 h-14 px-6 flex items-center justify-between pointer-events-none">
        <div className="text-xs italic opacity-70">
          {formatDateLabel(createdAt)}
        </div>
        <div className="opacity-80">
          {/* Hearth stamp — keep the existing SVG from the prior PostcardFront */}
          <span className="text-xs tracking-widest font-serif">HEARTH ✦</span>
        </div>
      </div>

      {/* WRITING SURFACE — salutation pre-print + lines */}
      <div className="absolute inset-x-0 top-16 bottom-16 px-8 overflow-hidden">
        <div
          className="font-[Caveat] text-[19px] leading-[36px] mb-1"
          style={{ color: '#3d342a' }}
        >
          Dear {salutationName},
        </div>

        {/* Lined paper effect under the editor */}
        <div
          className="relative"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, rgba(61,52,42,0.18) 35px, rgba(61,52,42,0.18) 36px)',
            height: `${FRONT_LINES * 36}px`,
          }}
        >
          <EditorContent
            editor={editor}
            className="font-[Caveat] text-[19px] leading-[36px] outline-none"
          />
        </div>
      </div>

      {/* FOOTER BAND — cancel left, turn-over right */}
      <div className="absolute inset-x-0 bottom-0 h-14 px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm opacity-70 hover:opacity-100 italic"
          style={{ color: '#3d342a' }}
        >
          ← cancel
        </button>
        <motion.button
          type="button"
          onClick={onTurnOver}
          animate={
            atCap
              ? { opacity: [0.7, 1, 0.7] }
              : { opacity: 1 }
          }
          transition={atCap ? { duration: 2, repeat: Infinity } : { duration: 0.3 }}
          className="px-5 py-2 rounded-full text-sm italic"
          style={{
            backgroundColor: '#7b2540',
            color: '#fbe6dd',
          }}
        >
          turn over →
        </motion.button>
      </div>
    </div>
  )
}
```

Note: the colors above (`#7b2540`, `#3d342a`) are placeholder constants pulled from the screenshot. If the current `PostcardFront.tsx` reads them from `theme.accent` / `useThemeStore`, prefer that — keeps the front theme-aware per CLAUDE.md's theme rules.

- [ ] **Step 5: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 6: Manual visual verify**

ComposeView still wires the old props for now; the visual will look broken until Task 7. Just confirm the file compiles. Smoke verification is in Task 10.

- [ ] **Step 7: Commit**

```bash
git add src/components/letters/compose/PostcardFront.tsx package.json package-lock.json
git commit -m "feat(letters): redesign PostcardFront with header band + cap"
```

---

## Task 6: Redesign `PostcardBack`

Split 60/40. Left = continuation TipTap editor (cap = `BACK_CHAR_LIMIT`). Right = music slot top, 2 photos middle, doodle bottom. Drop unlock pills + email field.

**Files:**
- Modify: `src/components/letters/compose/PostcardBack.tsx`

- [ ] **Step 1: Read the current PostcardBack and identify reusable journal media components**

```bash
docker compose exec app cat src/components/letters/compose/PostcardBack.tsx
docker compose exec app ls src/components/desk/
docker compose exec app grep -rn "song\|SongEmbed\|MusicSlot" src/components/desk/ | head -10
```

Find the journal versions of: song-embed slot, polaroid photo block (likely `PhotoBlock.tsx` in `src/components/desk/`), doodle canvas. We will mount these directly.

- [ ] **Step 2: Replace the component body**

Rewrite `src/components/letters/compose/PostcardBack.tsx`:

```typescript
'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import CharacterCount from '@tiptap/extension-character-count'
import { motion } from 'framer-motion'
// REUSED FROM JOURNAL — confirm paths against your codebase
import { PhotoBlock } from '@/components/desk/PhotoBlock'
import { SongEmbedSlot } from '@/components/desk/SongEmbedSlot'
import { DoodleCanvas } from '@/components/desk/DoodleCanvas'

export const BACK_CHAR_LIMIT = 324
const BACK_LINES = 9

export function PostcardBack({
  entryId,
  body,
  onBodyChange,
  onTurnBack,
  onSeal,
  canSeal,
}: {
  entryId: string | null   // null until first autosave creates the row
  body: string
  onBodyChange: (next: string) => void
  onTurnBack: () => void
  onSeal: () => void
  canSeal: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      CharacterCount.configure({ limit: BACK_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      onBodyChange(editor.getText())
    },
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
  })

  const atCap =
    (editor?.storage.characterCount.characters() ?? 0) >= BACK_CHAR_LIMIT

  return (
    <div
      className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl"
      style={{
        backgroundImage:
          'linear-gradient(180deg, #fff6f2 0%, #fbe6dd 100%)',
        color: '#3d342a',
      }}
    >
      <div className="absolute inset-x-0 top-0 bottom-16 flex">
        {/* LEFT 60% — writing continuation */}
        <div className="basis-[60%] grow-0 shrink-0 px-8 pt-10 overflow-hidden">
          <div
            className="relative"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, rgba(61,52,42,0.18) 35px, rgba(61,52,42,0.18) 36px)',
              height: `${BACK_LINES * 36}px`,
            }}
          >
            <EditorContent
              editor={editor}
              className="font-[Caveat] text-[19px] leading-[36px] outline-none"
            />
          </div>
          {atCap && (
            <p className="mt-3 text-xs italic opacity-70">
              your letter is full.
            </p>
          )}
        </div>

        {/* RIGHT 40% — music / photos / doodle stack */}
        <div className="basis-[40%] grow shrink px-6 pt-10 pb-2 flex flex-col gap-3">
          <SongEmbedSlot entryId={entryId} compact />
          <PhotoBlock entryId={entryId} compact slots={2} />
          <DoodleCanvas entryId={entryId} compact />
        </div>
      </div>

      {/* FOOTER BAND */}
      <div className="absolute inset-x-0 bottom-0 h-14 px-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onTurnBack}
          className="text-sm opacity-70 hover:opacity-100 italic"
          style={{ color: '#3d342a' }}
        >
          ← turn back
        </button>
        <button
          type="button"
          disabled={!canSeal}
          onClick={onSeal}
          className="px-5 py-2 rounded-full text-sm italic disabled:opacity-30"
          style={{ backgroundColor: '#7b2540', color: '#fbe6dd' }}
        >
          fold and seal →
        </button>
      </div>
    </div>
  )
}
```

**Important:** the journal components (`PhotoBlock`, `SongEmbedSlot`, `DoodleCanvas`) likely have different prop names in your codebase. Read each one's current signature first and adapt the call sites. The intent: reuse the components verbatim — no internal modifications. If a `compact` or sizing prop doesn't exist, wrap the component in a sized container (`<div className="h-32 overflow-hidden">…</div>`) instead.

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/letters/compose/PostcardBack.tsx
git commit -m "feat(letters): redesign PostcardBack with 60/40 split"
```

---

## Task 7: Rewire `ComposeView` for new phases + two-string body + picker + seal modal

The orchestrator. Replaces inline recipient toggle and inline unlock pills with the picker → compose → seal-modal flow. Holds body as `{bodyFront, bodyBack}`. Handles draft-resume via `?id=`.

**Files:**
- Modify: `src/components/letters/compose/ComposeView.tsx`

- [ ] **Step 1: Read the current ComposeView end-to-end**

```bash
docker compose exec app cat src/components/letters/compose/ComposeView.tsx
```

Note: existing autosave wiring, the `mapRecipientToSchema()` helper used today, how the 3D flip animation is structured, and how `PostcardFolded` was previously used.

- [ ] **Step 2: Rewrite ComposeView with the new flow**

Replace `ComposeView.tsx` with this structure (preserve the existing 3D flip animation; merge into the new phase model):

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { RecipientPicker } from './RecipientPicker'
import { PostcardFront, FRONT_CHAR_LIMIT } from './PostcardFront'
import { PostcardBack, BACK_CHAR_LIMIT } from './PostcardBack'
import { SealModal } from './SealModal'
import { useAutosaveEntry } from '@/hooks/useAutosaveEntry'
import type { RecipientChoice } from '../letterTypes'

type Phase = 'picker' | 'front' | 'back'

const BODY_SEPARATOR = '\n\n'

function splitBody(text: string): { front: string; back: string } {
  if (!text) return { front: '', back: '' }
  const sepIdx = text.indexOf(BODY_SEPARATOR)
  if (sepIdx >= 0 && sepIdx <= FRONT_CHAR_LIMIT) {
    return {
      front: text.slice(0, sepIdx),
      back: text.slice(sepIdx + BODY_SEPARATOR.length),
    }
  }
  // Legacy row with no separator — overflow past front cap goes to back.
  return {
    front: text.slice(0, FRONT_CHAR_LIMIT),
    back: text.slice(FRONT_CHAR_LIMIT, FRONT_CHAR_LIMIT + BACK_CHAR_LIMIT),
  }
}

function joinBody(front: string, back: string): string {
  if (!back) return front
  return `${front}${BODY_SEPARATOR}${back}`
}

export function ComposeView() {
  const router = useRouter()
  const params = useSearchParams()
  const draftId = params.get('id')

  const [phase, setPhase] = useState<Phase>(draftId ? 'front' : 'picker')
  const [recipient, setRecipient] = useState<RecipientChoice | null>(null)
  const [entryId, setEntryId] = useState<string | null>(draftId)
  const [bodyFront, setBodyFront] = useState('')
  const [bodyBack, setBodyBack] = useState('')
  const [createdAt, setCreatedAt] = useState<Date>(new Date())
  const [showSeal, setShowSeal] = useState(false)
  const [loading, setLoading] = useState(Boolean(draftId))

  // Hydrate a resumed draft.
  useEffect(() => {
    if (!draftId) return
    void (async () => {
      const res = await fetch(`/api/entries/${draftId}`)
      if (!res.ok) {
        router.replace('/letters')
        return
      }
      const json = await res.json()
      const e = json.entry ?? json
      setCreatedAt(new Date(e.createdAt))
      if (e.entryType === 'letter') {
        setRecipient({ recipient: 'self' })
      } else if (e.entryType === 'unsent_letter') {
        setRecipient({ recipient: 'friend', name: e.recipientName ?? '' })
      }
      const { front, back } = splitBody(e.text ?? '')
      setBodyFront(front)
      setBodyBack(back)
      setLoading(false)
    })()
  }, [draftId, router])

  // Autosave: fire whenever body or recipient changes (and a recipient is set).
  useAutosaveEntry({
    entryId,
    isReady: Boolean(recipient) && phase !== 'picker',
    payload: recipient
      ? {
          text: joinBody(bodyFront, bodyBack),
          entryType:
            recipient.recipient === 'self' ? 'letter' : 'unsent_letter',
          recipientName:
            recipient.recipient === 'friend' ? recipient.name : null,
        }
      : null,
    onCreated: (id) => setEntryId(id),
  })

  if (loading) {
    return <div className="p-10 text-center italic opacity-60">opening...</div>
  }

  if (phase === 'picker' || !recipient) {
    return (
      <RecipientPicker
        onSubmit={(choice) => {
          setRecipient(choice)
          setCreatedAt(new Date())
          setPhase('front')
        }}
        onCancel={() => router.push('/letters')}
      />
    )
  }

  const salutationName =
    recipient.recipient === 'self' ? 'future me' : recipient.name

  async function handleSeal({
    unlockDate,
    recipientEmail,
  }: {
    unlockDate: Date
    recipientEmail?: string
  }) {
    if (!entryId) {
      throw new Error('Draft has not been saved yet — please add some text.')
    }
    const res = await fetch(`/api/entries/${entryId}/seal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        unlockDate: unlockDate.toISOString(),
        recipientEmail,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? 'Could not seal.')
    }
  }

  return (
    <div className="relative w-full h-screen flex items-center justify-center px-6">
      <motion.div
        className="relative w-[min(900px,95vw)] aspect-[3/2]"
        animate={{ rotateY: phase === 'back' ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <PostcardFront
            salutationName={salutationName}
            body={bodyFront}
            onBodyChange={setBodyFront}
            onTurnOver={() => setPhase('back')}
            onCancel={() => router.push('/letters')}
            createdAt={createdAt}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          <PostcardBack
            entryId={entryId}
            body={bodyBack}
            onBodyChange={setBodyBack}
            onTurnBack={() => setPhase('front')}
            onSeal={() => setShowSeal(true)}
            canSeal={bodyFront.trim().length > 0 || bodyBack.trim().length > 0}
          />
        </div>
      </motion.div>

      {showSeal && (
        <SealModal
          recipient={recipient.recipient}
          onClose={() => setShowSeal(false)}
          onSealed={() => router.push('/letters?tab=sent')}
          onSeal={handleSeal}
        />
      )}
    </div>
  )
}
```

**Adapt:** the `useAutosaveEntry` hook signature here is illustrative — read the real one in `src/hooks/useAutosaveEntry.ts` and adapt the props. The intent is unchanged: debounce 1500ms, POST on first content change to create the row, PUT on subsequent changes.

- [ ] **Step 3: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

Fix any prop-name mismatches against the real `useAutosaveEntry` and journal media components.

- [ ] **Step 4: Manual verify (start of real smoke)**

```bash
docker compose restart app
```

Open `http://localhost:3112/letters/write` in a browser. Expected:
- Picker appears first. Tap "Future me" → compose loads with "Dear future me," header.
- Type a few lines → check the text appears under the lined background, salutation stays visible, no overlap with date/stamp/buttons.
- Tap "turn over →" → card flips → back shows the writing area and the music/photo/doodle slots on the right.
- Tap "← turn back" → flips back; front text preserved.
- Tap "fold and seal →" → seal modal appears with date pills only.

Don't seal yet — Task 8 wires drafts; we'll do the full happy path in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/letters/compose/ComposeView.tsx
git commit -m "feat(letters): wire picker + two-string body + seal modal"
```

---

## Task 8: Render `DraftsSection` at the top of the Sent tab

New component + integration with the existing Sent view. Resume navigation opens `/letters/write?id=…` which Task 7 already handles.

**Files:**
- Create: `src/components/letters/sent/DraftsSection.tsx`
- Modify: `src/components/letters/sent/SentView.tsx`

- [ ] **Step 1: Read the existing SentView**

```bash
docker compose exec app cat src/components/letters/sent/SentView.tsx
```

Note how it fetches and renders the sent list, and what theme/style helpers it uses.

- [ ] **Step 2: Build `DraftsSection`**

Create `src/components/letters/sent/DraftsSection.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useThemeStore } from '@/store/theme'
import { useE2EE } from '@/hooks/useE2EE'

type Draft = {
  id: string
  entryType: 'letter' | 'unsent_letter'
  recipientName: string | null
  text: string  // possibly ciphertext if E2EE — decrypted below
  e2eeIV?: string | null
  e2eeIVs?: Record<string, string> | null
  encryptionType: 'server' | 'e2ee'
  updatedAt: string
}

export function DraftsSection() {
  const theme = useThemeStore((s) => s.theme)
  const { decryptString } = useE2EE()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})

  async function refresh() {
    const res = await fetch('/api/letters/drafts')
    if (!res.ok) return
    const json = await res.json()
    setDrafts(json.drafts ?? [])
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Decrypt preview text for each E2EE draft (first ~80 chars).
  useEffect(() => {
    void (async () => {
      const next: Record<string, string> = {}
      for (const d of drafts) {
        try {
          const plain =
            d.encryptionType === 'e2ee'
              ? await decryptString(d.text, d.e2eeIVs?.text ?? d.e2eeIV ?? '')
              : d.text
          next[d.id] = (plain ?? '').slice(0, 80)
        } catch {
          next[d.id] = ''
        }
      }
      setPreviews(next)
    })()
  }, [drafts, decryptString])

  async function discard(id: string) {
    if (!confirm('Discard this draft?')) return
    await fetch(`/api/entries/${id}`, { method: 'DELETE' })
    await refresh()
  }

  if (drafts.length === 0) return null

  return (
    <section className="mb-8">
      <h2
        className="text-sm uppercase tracking-wider opacity-60 mb-3"
        style={{ color: theme.text.primary }}
      >
        Drafts
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {drafts.map((d) => {
          const name =
            d.entryType === 'letter' ? 'Future me' : d.recipientName ?? 'A friend'
          return (
            <li
              key={d.id}
              className="rounded-xl p-4 group relative"
              style={{
                border: `1px solid ${theme.text.primary}33`,
                backgroundColor: `${theme.bg.primary}80`,
                color: theme.text.primary,
              }}
            >
              <Link
                href={`/letters/write?id=${d.id}`}
                className="block"
              >
                <div className="text-sm font-serif italic mb-1">{name}</div>
                <div className="text-xs opacity-70 mb-2">
                  edited {formatRelative(d.updatedAt)}
                </div>
                <div className="text-sm opacity-80 line-clamp-2 font-[Caveat] text-[16px]">
                  {previews[d.id] ?? '…'}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => discard(d.id)}
                aria-label="Discard draft"
                className="absolute top-2 right-2 text-xs opacity-50 hover:opacity-100 px-2"
                style={{ color: theme.text.primary }}
              >
                ⋯
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.valueOf()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}
```

**Adapt:** the `useE2EE` hook's actual API may differ — replace `decryptString(text, iv)` with whatever the real signature is (likely `decryptString({ ciphertext, iv })` or similar). For initial implementation, if decryption is non-trivial, ship the cards with `previews[d.id] = ''` and a tiny "draft" placeholder; preview decryption can land in a follow-up if time pressed.

The `⋯` button uses a `confirm()` dialog for v1 — a styled menu is a future polish.

- [ ] **Step 3: Wire into SentView**

In `src/components/letters/sent/SentView.tsx`, add the import and render the section above the existing list:

```typescript
import { DraftsSection } from './DraftsSection'

// inside the component's JSX, above the sent list:
<DraftsSection />
```

- [ ] **Step 4: Type-check + restart**

```bash
docker compose exec app npx tsc --noEmit
docker compose restart app
```

- [ ] **Step 5: Manual verify**

1. Start a fresh compose, type one sentence, click "← cancel" (does NOT seal — leaves a draft).
2. Open `/letters`, switch to Sent tab.
3. Expect: Drafts section appears at the top with one card showing recipient label, edit time, and a short preview (if E2EE decryption is wired) or empty preview placeholder.
4. Click the card → compose re-opens with the body restored, skipping the picker.
5. Add more text, seal. Refresh `/letters` Sent tab → the draft is gone; the sealed letter is in the regular Sent list.
6. Start another draft → cancel → on the Sent tab, click `⋯` → confirm discard → draft disappears, row is deleted (verify via `psql`: `SELECT id FROM journal_entries WHERE id='<draftId>'` returns 0 rows).

- [ ] **Step 6: Commit**

```bash
git add src/components/letters/sent/DraftsSection.tsx src/components/letters/sent/SentView.tsx
git commit -m "feat(letters): drafts pinned at top of Sent tab"
```

---

## Task 9: Header band stamp polish + theme-aware color pass

Sweep the compose components to replace any hardcoded `#3d342a` / `#7b2540` etc. with theme-store values so the redesign respects the active Hearth theme on every page that uses it. Pull the actual Hearth stamp SVG from the prior `PostcardFront.tsx` (kept in git history) and re-mount it in the new header band.

**Files:**
- Modify: `src/components/letters/compose/PostcardFront.tsx`
- Modify: `src/components/letters/compose/PostcardBack.tsx`
- Modify: `src/components/letters/compose/SealModal.tsx`

- [ ] **Step 1: Find the original stamp markup**

```bash
git show HEAD~6:src/components/letters/compose/PostcardFront.tsx | grep -A 20 -i "stamp\|HEARTH" | head -40
```

(Adjust the commit ref — find a pre-redesign version of `PostcardFront.tsx`.) Copy the stamp SVG/markup.

- [ ] **Step 2: Replace the placeholder stamp in the new `PostcardFront` header band**

In `PostcardFront.tsx`, replace `<span className="text-xs tracking-widest font-serif">HEARTH ✦</span>` with the real stamp SVG. Theme-color it via `useThemeStore` if the original was theme-aware.

- [ ] **Step 3: Audit hardcoded colors**

```bash
docker compose exec app grep -nE "#[0-9a-fA-F]{3,8}" src/components/letters/compose/PostcardFront.tsx src/components/letters/compose/PostcardBack.tsx src/components/letters/compose/SealModal.tsx
```

For each hex color found that affects letter chrome (border, button background, text), replace with a `useThemeStore` lookup unless the spec calls for a constant (the paper gradient `#fff6f2 → #fbe6dd` is the postcard's intrinsic paper color — keep that as a constant; per the existing PostcardFront convention).

The buttons (`#7b2540` mulberry seal-button) can stay if the original code treated them as a constant. Match whatever the pre-redesign file did.

- [ ] **Step 4: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 5: Manual verify across themes**

Switch theme to `rivendell` (dark), then `rose` (light), then `sunset`. For each: open compose, verify the picker, front, back, and seal modal all render legibly — no invisible text on its background, no bleed-through against a dark theme.

- [ ] **Step 6: Commit**

```bash
git add src/components/letters/compose/PostcardFront.tsx src/components/letters/compose/PostcardBack.tsx src/components/letters/compose/SealModal.tsx
git commit -m "polish(letters): theme-aware colors + restore stamp SVG"
```

---

## Task 10: End-to-end smoke test + final commit

Walk through the full done-criteria checklist from the spec. If anything fails, fix in place and re-run the affected steps. If all passes, commit the verification log and tag the working state.

- [ ] **Step 1: Cold start**

```bash
docker compose down
docker compose up -d --build
docker compose logs -f app --tail=80
```

Wait until the app reports ready on `:3112`.

- [ ] **Step 2: Self-letter happy path**

In an incognito window, logged in as a fully-onboarded E2EE user:

1. Go to `/letters` → tap "Begin a letter"
2. Picker appears → tap "Future me"
3. Compose loads with "Dear future me," pre-printed; date stamp in top-left; HEARTH stamp top-right; no overlap with the lined writing area
4. Type a paragraph filling about half the front → confirm autosave fires (no errors in network tab)
5. Continue typing until you hit the last line of the front
6. Press Enter on the last line → confirm NO new line is added, the turn-over button starts gently breathing
7. Type more characters → confirm they are rejected
8. Click "turn over →" → card flips; back-left shows an empty writing area
9. Type a sentence on the back-left
10. Add a song URL in the back-right music slot; upload a photo; doodle a stroke
11. Click "fold and seal →" → modal appears titled "When should this find you?" with date pills (no email field)
12. Pick "1 month" → click "seal it"
13. Modal shows "folding... / sealed." → routes to `/letters?tab=sent`
14. Sent tab → sealed letter appears; the draft is gone

- [ ] **Step 3: Friend-letter happy path**

1. `/letters` → "Begin a letter" → tap "A friend"
2. Card morphs to a name input → type "Sam" → continue
3. Compose loads with "Dear Sam," → write a sentence, turn over, write more, add media
4. "fold and seal →" → modal titled "When should it arrive?" with email field + date pills (`1 week / 2 weeks / 30 days / custom`)
5. Type a malformed email → click seal → error appears
6. Fix email → pick "custom" → date picker only allows up to today+30 days → pick day 25
7. Click "seal and send" → folds → routes to Sent tab → letter appears

- [ ] **Step 4: 30-day cap server enforcement**

In a separate terminal:

```bash
# Make a fresh friend-letter draft with autosave, get its id, then:
curl -X POST http://localhost:3112/api/entries/<id>/seal \
  -H 'content-type: application/json' \
  --cookie 'hearth-auth-token=<token>' \
  -d '{"unlockDate":"2099-01-01T00:00:00Z","recipientEmail":"x@example.com"}'
# Expected: 400 with "Friend letters must arrive within 30 days."
```

- [ ] **Step 5: Draft resume + discard**

1. Begin a friend letter → write half a sentence → close the tab (no seal)
2. Reopen `/letters` Sent tab → Drafts section shows the unfinished letter with name "Sam", "edited just now", preview text
3. Click the card → compose re-opens with the body restored, recipient still locked to friend (no picker shown)
4. Add a sentence → seal → confirm it leaves Drafts and joins the Sent list
5. Begin another draft → cancel → on Sent tab click `⋯` → confirm → row deleted

- [ ] **Step 6: E2EE DB inspection**

```bash
docker compose exec db psql -U hearth -d hearth -c "
  SELECT id, entry_type, is_sealed,
         encryption_type,
         length(text) as text_len,
         left(text, 40) as text_sample,
         recipient_email
  FROM journal_entries
  WHERE entry_type IN ('letter','unsent_letter')
  ORDER BY updated_at DESC LIMIT 5;
"
```

For each sealed letter row: `text` should be hex-ish ciphertext, not readable English; `encryption_type` should be `e2ee`; `recipient_email` is plaintext for friend, null for self.

- [ ] **Step 7: No-scrollbar visual check**

On both front and back, with the writing surfaces filled to the cap and maximum media on the back, confirm neither page introduces a scrollbar (DevTools → check `<body>` and the postcard container's overflow).

- [ ] **Step 8: Theme sweep**

Switch theme to `rivendell` → reopen compose → confirm picker, front, back, and seal modal all render legibly. Repeat for `rose` and `sunset`.

- [ ] **Step 9: Type-check + lint sanity pass**

```bash
docker compose exec app npx tsc --noEmit
docker compose exec app npm run lint
```

Both clean.

- [ ] **Step 10: Tag the working state**

```bash
git tag letter-compose-redesign-shipped
```

No commit needed if all prior tasks already committed cleanly.

---

## Verification checklist (paste at the end of the PR description)

- [ ] Picker shows on first compose entry; locks recipient on selection
- [ ] Friend card morphs to a name input; cancels back cleanly
- [ ] Front page has no overlap between buttons / stamp / lines
- [ ] Pre-printed "Dear ___," cannot be edited or deleted
- [ ] Front hits hard cap at last line — Enter and overflow chars rejected
- [ ] Turn-over button glows when front is at cap
- [ ] Back-left is independent editor; hits its own cap with "your letter is full." whisper
- [ ] Back-right music / photos / doodle reuse journal components
- [ ] Photos upload encrypted via `/api/photos` adapter (DB inspection confirms `encryptedRef` is set, `url` is null)
- [ ] Seal modal: self shows date pills only; friend shows email + date pills with 30-day cap
- [ ] `/api/entries/[id]/seal` server-side rejects friend letters > 30 days and missing/bad email
- [ ] Drafts section appears at top of Sent tab when unsealed letters exist
- [ ] Draft resume skips picker and locks original recipient
- [ ] Discard draft deletes the row
- [ ] No scrollbars on either compose page at maximum content
- [ ] Theme sweep: legible in rivendell, rose, sunset
- [ ] `npx tsc --noEmit` clean; `npm run lint` clean
