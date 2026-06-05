# Letter Reveal as Read-Only Flippable Postcard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make opening an arrived letter show the exact postcard the user wrote — front (text) → flip → back (song · photos · doodle) — read-only and theme-specific, keeping the envelope/seal-break animation.

**Architecture:** Add a `readOnly` mode to the existing `PostcardFront` / `PostcardBack` / `CompactDoodleCanvas` (single source of truth so the read view is identical to compose), then rewrite `RevealModal` to decrypt the full payload and mount those components in a flip card after the envelope opens. Also persist self-letter photos/doodles at seal time so the back has content.

**Tech Stack:** Next.js 16 / React 19, TipTap, Framer Motion, Zustand, E2EE (AES-256-GCM under master key).

**Verification:** Per Hearth convention, NO unit tests. Each task ends with a typecheck + manual smoke test in Docker dev mode. Restart with `docker compose restart app`; app runs at http://localhost:3112 (note: the screenshot showed :3112).

---

### Task 1: `CompactDoodleCanvas` read-only mode

**Files:**
- Modify: `src/components/desk/CompactDoodleCanvas.tsx`

- [ ] **Step 1: Add the `readOnly` prop to the interface**

In `CompactDoodleCanvasProps` (around line 28), add:

```tsx
interface CompactDoodleCanvasProps {
  strokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
  doodleColors: string[]
  canvasBackground: string
  canvasBorder: string
  textColor: string
  mutedColor: string
  readOnly?: boolean
}
```

And destructure it (around line 46) with a default:

```tsx
const CompactDoodleCanvas = memo(function CompactDoodleCanvas({
  strokes,
  onStrokesChange,
  doodleColors,
  canvasBackground,
  canvasBorder,
  textColor,
  mutedColor,
  readOnly = false,
}: CompactDoodleCanvasProps) {
```

- [ ] **Step 2: Hide the toolbar when read-only**

Wrap the toolbar block (`{/* Compact Toolbar */}` `<div className="flex items-center gap-1 mb-1">…</div>`, lines ~191-251) in a guard:

```tsx
{!readOnly && (
  <div className="flex items-center gap-1 mb-1">
    {/* …existing toolbar unchanged… */}
  </div>
)}
```

- [ ] **Step 3: Disable pointer handlers + drawing affordances on the canvas**

Change the canvas `<div ref={canvasRef} …>` (lines ~254-267) so the pointer handlers and cursor are gated by `readOnly`:

```tsx
<div
  ref={canvasRef}
  className="flex-1 relative touch-none rounded-lg overflow-hidden"
  style={{
    background: canvasBackground,
    border: `1px solid ${canvasBorder}`,
    cursor: readOnly ? 'default' : isErasing ? 'cell' : 'crosshair',
    minHeight: '100px',
  }}
  onPointerDown={readOnly ? undefined : handlePointerDown}
  onPointerMove={readOnly ? undefined : handlePointerMove}
  onPointerUp={readOnly ? undefined : handlePointerUp}
  onPointerLeave={readOnly ? undefined : handlePointerUp}
>
```

- [ ] **Step 4: Suppress the "Draw here" placeholder when read-only**

Change the empty placeholder guard (lines ~272-276) to also require not-read-only:

```tsx
{localStrokes.length === 0 && !isDrawing && !readOnly && (
  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
    <span className="text-sm italic" style={{ color: mutedColor, opacity: 0.65 }}>Draw here</span>
  </div>
)}
```

- [ ] **Step 5: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/desk/CompactDoodleCanvas.tsx
git commit -m "feat(doodle): read-only mode for CompactDoodleCanvas"
```

---

### Task 2: `PostcardFront` read-only mode

**Files:**
- Modify: `src/components/letters/compose/PostcardFront.tsx`

- [ ] **Step 1: Add `readOnly` to the props**

Update the prop type + destructure (lines ~49-67):

```tsx
export function PostcardFront({
  salutationName = 'future me',
  body = '',
  onBodyChange,
  onTurnOver,
  onCancel,
  createdAt,
  active = true,
  readOnly = false,
}: {
  salutationName?: string
  body?: string
  onBodyChange?: (next: string) => void
  onTurnOver: () => void
  onCancel?: () => void
  createdAt: Date
  active?: boolean
  readOnly?: boolean
}) {
```

- [ ] **Step 2: Make the editor non-editable when read-only**

In the `useEditor({…})` config (line ~119), add the `editable` field right after `immediatelyRender`:

```tsx
const editor = useEditor({
  immediatelyRender: false,
  editable: !readOnly,
  extensions: [
```

(The `onUpdate` trim/overflow logic stays — it only fires on user edits, which can't happen when `editable:false`.)

- [ ] **Step 3: Hide the cancel button when read-only**

Wrap the cancel `<button>` in the footer (lines ~380-398) in a guard so the footer keeps its layout (turn-over stays right):

```tsx
{readOnly ? <span /> : (
  <button
    type="button"
    onClick={onCancel}
    style={{ /* …unchanged… */ }}
  >
    ← cancel
  </button>
)}
```

- [ ] **Step 4: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/letters/compose/PostcardFront.tsx
git commit -m "feat(letters): read-only mode for PostcardFront"
```

---

### Task 3: `PostcardBack` read-only mode

**Files:**
- Modify: `src/components/letters/compose/PostcardBack.tsx`

- [ ] **Step 1: Add `readOnly` to the props**

Update the destructure + type (lines ~36-62):

```tsx
export function PostcardBack({
  photos = [],
  onPhotoAdd,
  onPhotoRemove,
  doodleStrokes = [],
  onDoodleStrokesChange,
  song = null,
  onSongChange,
  onTurnBack,
  onSeal,
  canSeal,
  active = true,
  readOnly = false,
}: {
  photos?: Photo[]
  onPhotoAdd?: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  onPhotoRemove?: (position: 1 | 2) => void
  doodleStrokes?: StrokeData[]
  onDoodleStrokesChange?: (strokes: StrokeData[]) => void
  song?: string | null
  onSongChange?: (next: string | null) => void
  onTurnBack?: () => void
  onSeal?: () => void
  canSeal?: boolean
  active?: boolean
  readOnly?: boolean
}) {
```

- [ ] **Step 2: Song shows embed only when read-only**

Replace the song conditional (lines ~129-159). When `readOnly`, never show the picker; show the embed if a song exists, otherwise nothing:

```tsx
{readOnly ? (
  songInput ? <SongEmbed url={songInput} compact audioOnly /> : (
    <div style={{ ...labelStyle, opacity: 0.4 }}>no song</div>
  )
) : isEditingSong || !songInput ? (
  <SongPicker
    value={songInput}
    onChange={(next) => handleSongChange(next ?? '')}
    placeholder="Search a song or paste a link…"
  />
) : (
  <div style={{ position: 'relative' }}>
    <SongEmbed url={songInput} compact audioOnly />
    <button
      onClick={() => setIsEditingSong(true)}
      title="Change song"
      style={{ /* …unchanged ✎ button… */ }}
    >
      ✎
    </button>
  </div>
)}
```

- [ ] **Step 3: Photos read-only**

In the `<PhotoBlock>` (lines ~175-179), pass `disabled` and drop the handlers when read-only:

```tsx
<PhotoBlock
  photos={photos}
  onPhotoAdd={readOnly ? undefined : onPhotoAdd}
  onPhotoRemove={readOnly ? undefined : onPhotoRemove}
  disabled={readOnly}
/>
```

- [ ] **Step 4: Doodle read-only**

In the `<CompactDoodleCanvas>` (lines ~189-197), add `readOnly`:

```tsx
<CompactDoodleCanvas
  strokes={doodleStrokes}
  onStrokesChange={(s) => onDoodleStrokesChange?.(s)}
  doodleColors={DOODLE_COLORS}
  canvasBackground={DOODLE_BG}
  canvasBorder={DOODLE_BORDER}
  textColor={PAPER_INK}
  mutedColor="rgba(120, 90, 50, 0.5)"
  readOnly={readOnly}
/>
```

- [ ] **Step 5: Footer — drop the seal button when read-only**

Replace the seal `<button>` in the footer (lines ~288-307) with a guard. Keep "← turn back" on the left:

```tsx
{readOnly ? <span /> : (
  <button
    type="button"
    disabled={!sealEnabled}
    onClick={onSeal}
    style={{ /* …unchanged "fold and seal →" button… */ }}
  >
    fold and seal →
  </button>
)}
```

- [ ] **Step 6: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/letters/compose/PostcardBack.tsx
git commit -m "feat(letters): read-only mode for PostcardBack"
```

---

### Task 4: Persist self-letter photos + doodles at seal

**Files:**
- Modify: `src/lib/letters/self-letter-client.ts`
- Modify: `src/components/letters/compose/ComposeView.tsx:254-278`

- [ ] **Step 1: Extend `SelfLetterDraft` + the encrypted JSON shape**

In `self-letter-client.ts`, import `StrokeData`, loosen the `photos` shape (url OR encryptedRef), and add `doodleStrokes`. Replace the interface (lines ~8-14) and the JSON build (lines ~28-33):

```tsx
import { encryptString, decryptString } from '@/lib/e2ee/crypto'
import type { StrokeData } from '@/store/journal'

export interface SelfLetterDraft {
  text: string
  song?: string | null
  photos?: Array<{
    url?: string | null
    encryptedRef?: string | null
    encryptedRefIV?: string | null
    position: number
    spread: number
    rotation: number
  }>
  doodleStrokes?: StrokeData[]
  // Legacy field kept for friend-letter payload compatibility; unused by self.
  doodles?: Array<{ encryptedStrokes: string; e2eeIV: string; spread: number; positionInEntry: number }>
  letterLocation?: string | null
}
```

And inside `buildSelfLetterPayload`, include the new fields in the JSON:

```tsx
  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    photos: args.draft.photos ?? [],
    doodleStrokes: args.draft.doodleStrokes ?? [],
    doodles: args.draft.doodles ?? [],
  })
```

- [ ] **Step 2: Pass real photos + doodle strokes from `ComposeView`**

In `ComposeView.tsx`, the self-letter branch of `handleSeal` (lines ~256-278). Replace the `buildSelfLetterPayload` call so it sends the actual `photos` state (mapped to the draft shape) and `doodleStrokes`:

```tsx
    if (recipient.recipient === 'self') {
      const payload = await buildSelfLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: photos.map((p) => ({
            url: p.url ?? null,
            encryptedRef: p.encryptedRef ?? null,
            encryptedRefIV: p.encryptedRefIV ?? null,
            position: p.position,
            spread: 1,
            rotation: p.rotation,
          })),
          doodleStrokes,
          letterLocation: null,
        },
        unlockDate,
        masterKey,
      })
      const res = await fetch('/api/letters/self', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, draftLetterId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not save self letter.')
      }
      return
    }
```

(`photos` and `doodleStrokes` are already in scope — they're `ComposeView` state.)

- [ ] **Step 3: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke — seal a self letter with a photo + doodle**

`docker compose restart app`, then at http://localhost:3112/letters: begin a self letter, write text, turn over, add a photo + draw a doodle + a song, seal with the shortest delay (1h is fine — we just check storage). No error on seal = pass. (Full read-back is verified in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/letters/self-letter-client.ts src/components/letters/compose/ComposeView.tsx
git commit -m "feat(letters): persist photos + doodle strokes in self letters"
```

---

### Task 5: Rewrite `RevealModal` to show the flippable read-only postcard

**Files:**
- Modify: `src/components/letters/inbox/RevealModal.tsx` (full rewrite of the component body; keep the envelope CSS + helper functions)

**Design notes:**
- Keep the envelope/wax/flap/seal markup + CSS and the phase machine for the *sealed → break → open* gesture.
- After the flap opens (`phase === 'shown'`), fade the envelope out and crossfade IN the postcard (Framer Motion), built like `ComposeView`'s flip card (leather blotter + 3D flip wrapper) but read-only and with no quill.
- Parse the full decrypted JSON into `{ text, song, photos, doodleStrokes }`.

- [ ] **Step 1: Replace the imports + parsing state**

At the top of `RevealModal.tsx`, replace imports (lines 1-13) with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { InboxLetter } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { PostcardFront } from '../compose/PostcardFront'
import { PostcardBack } from '../compose/PostcardBack'
import type { Photo } from '@/components/desk/PhotoBlock'
import type { StrokeData, JournalEntry } from '@/store/journal'

interface Props {
  letter: InboxLetter | null
  onClose: () => void
  onMarkRead: (id: string) => void
}

type Phase = 'sealed' | 'breaking' | 'opening' | 'shown'

interface LetterContent {
  text: string
  song: string | null
  photos: Photo[]
  doodleStrokes: StrokeData[]
}
```

> NOTE: confirm `StrokeData` and `JournalEntry` are both exported from `@/store/journal` (they are used elsewhere via that path). If `JournalEntry` is not exported there, import it from wherever `useE2EE` consumes it — check `src/store/journal.ts` exports before finalizing.

- [ ] **Step 2: Replace component state + decrypt effect**

Replace the body from `export default function RevealModal` down to the end of the decrypt `useEffect` (old lines 17-71) with:

```tsx
export default function RevealModal({ letter, onClose, onMarkRead }: Props) {
  const [phase, setPhase] = useState<Phase>('sealed')
  const [content, setContent] = useState<LetterContent>({
    text: '', song: null, photos: [], doodleStrokes: [],
  })
  const [face, setFace] = useState<'front' | 'back'>('front')
  const { decryptEntryFromServer, isE2EEReady } = useE2EE()
  const theme = useThemeStore((s) => s.theme)
  const diaryColors = getGlassDiaryColors(theme)

  useEffect(() => {
    if (!letter) return
    setPhase(letter.isViewed ? 'shown' : 'sealed')
    setFace('front')
    setContent({ text: '', song: null, photos: [], doodleStrokes: [] })

    const apply = (raw: string) => {
      // Self letters (new flow) encrypt a JSON blob; legacy / friend letters
      // decrypt to a plain string and only fill `text`.
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as {
            text?: unknown
            song?: unknown
            photos?: unknown
            doodleStrokes?: unknown
          }
          setContent({
            text: typeof parsed.text === 'string' ? parsed.text : '',
            song: typeof parsed.song === 'string' ? parsed.song : null,
            photos: Array.isArray(parsed.photos)
              ? (parsed.photos as Array<Record<string, unknown>>)
                  .filter((p) => p.position === 1 || p.position === 2)
                  .map((p) => ({
                    url: (p.url as string) ?? undefined,
                    encryptedRef: (p.encryptedRef as string) ?? undefined,
                    encryptedRefIV: (p.encryptedRefIV as string) ?? undefined,
                    rotation: typeof p.rotation === 'number' ? p.rotation : 0,
                    position: p.position as 1 | 2,
                  }))
              : [],
            doodleStrokes: Array.isArray(parsed.doodleStrokes)
              ? (parsed.doodleStrokes as StrokeData[])
              : [],
          })
          return
        } catch {
          // not JSON — fall through to plain text
        }
      }
      setContent({ text: raw, song: null, photos: [], doodleStrokes: [] })
    }

    if (letter.text !== undefined) {
      const inlineEntry = {
        id: letter.id,
        text: letter.text,
        encryptionType: letter.encryptionType,
        e2eeIVs: letter.e2eeIVs,
      } as unknown as JournalEntry
      decryptEntryFromServer(inlineEntry)
        .then((decrypted) => apply((decrypted?.text || '').toString()))
        .catch(() => apply(''))
      return
    }

    fetch(`/api/entries/${letter.id}`)
      .then((r) => r.json())
      .then(async (d) => {
        const entry = (d?.entry || d) as JournalEntry
        const decrypted = await decryptEntryFromServer(entry)
        apply((decrypted?.text || '').toString())
      })
      .catch(() => apply(''))
  }, [letter, decryptEntryFromServer, isE2EEReady])
```

- [ ] **Step 3: Keep the Esc handler + early return unchanged**

The existing Esc `useEffect` (old lines 73-77) and `if (!letter) return null` (old line 79) stay as-is.

- [ ] **Step 4: Keep `breakSeal` + `emitWaxParticles` but transition to the postcard**

Keep `breakSeal` / `emitWaxParticles` (old lines 81-103) unchanged — they already drive `sealed → breaking → opening → shown` and call `onMarkRead`.

- [ ] **Step 5: Replace the JSX return — envelope crossfades into the postcard**

Replace the `return (…)` block (old lines 109-389, the whole overlay + `<style jsx>`) with the structure below. Keep the entire `<style jsx>` envelope CSS, but DELETE the `.env-letter` rules (old lines 313-357) since the tiny floating letter is gone. Add the postcard layer:

```tsx
  const sealed = phase === 'sealed'
  const flapOpen = phase === 'opening' || phase === 'shown'
  const postcardShown = phase === 'shown'
  const salutationName = (letter.recipientName ?? 'future me').replace(/^to /, '')
  const cardRotateY = face === 'back' ? 180 : 0

  return (
    <div
      className="reveal-overlay open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button className="reveal-close" onClick={onClose} aria-label="close">×</button>

      {/* ENVELOPE STAGE — fades out once the postcard is shown */}
      {!postcardShown && (
        <div className="reveal-stage">
          <div className="reveal-meta">
            a letter <span className="from">from past you</span> · sealed {sealedLabel(letter.sealedAt)}
          </div>

          <div className={`reveal-env phase-${phase}`} onClick={breakSeal}>
            <div className="env-back" />
            <div className={`env-flap${flapOpen ? ' opened' : ''}`} />
            <div className={`env-seal${!sealed ? ' broken' : ''}`}>
              <div className={`wax-half left${!sealed ? ' broken' : ''}`} />
              <div className={`wax-half right${!sealed ? ' broken' : ''}`} />
              <div className="seal-mark">✦</div>
            </div>
          </div>

          {sealed && <div className="reveal-prompt">tap to break the seal</div>}
        </div>
      )}

      {/* POSTCARD STAGE — the exact card the user wrote, read-only + flippable */}
      {postcardShown && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ perspective: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            style={{
              position: 'relative',
              padding: '20px 26px',
              borderRadius: 14,
              backgroundColor: diaryColors.cover,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 6px)',
              border: `1px solid ${diaryColors.coverBorder}`,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25), 0 35px 70px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.28)',
            }}
          >
            <motion.div
              style={{
                width: 'min(760px, calc(100vw - 48px))',
                height: 'min(860px, calc(100vh - 104px))',
                position: 'relative',
                transformStyle: 'preserve-3d',
              }}
            >
              <motion.div
                animate={{ rotateY: cardRotateY }}
                transition={{ duration: 0.85, ease: [0.45, 0.05, 0.15, 1] }}
                style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}
              >
                <PostcardFront
                  readOnly
                  active={face === 'front'}
                  salutationName={salutationName}
                  body={content.text}
                  onTurnOver={() => setFace('back')}
                  createdAt={new Date(letter.sealedAt)}
                />
                <PostcardBack
                  readOnly
                  active={face === 'back'}
                  photos={content.photos}
                  doodleStrokes={content.doodleStrokes}
                  song={content.song}
                  onTurnBack={() => setFace('front')}
                />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      )}

      <style jsx>{`
        /* …KEEP the existing envelope CSS exactly, MINUS the .env-letter rules… */
      `}</style>
    </div>
  )
```

- [ ] **Step 6: Keep the helper functions**

`sealedLabel` (old lines 392-394) stays. `salutationFor` (old lines 396-400) is now unused — delete it.

- [ ] **Step 7: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: no new errors. (If `JournalEntry` isn't exported from `@/store/journal`, fix the import per the Step 1 note.)

- [ ] **Step 8: Commit**

```bash
git add src/components/letters/inbox/RevealModal.tsx
git commit -m "feat(letters): reveal a letter as the read-only flippable postcard"
```

---

### Task 6: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Restart**

Run: `docker compose restart app` and wait for it to come up (`docker compose logs -f app` until ready).

- [ ] **Step 2: Write + seal a fresh self letter with full content**

At http://localhost:3112/letters: begin a self letter → write a few lines → "turn over" → add a song, a photo, and draw a doodle → "fold and seal" with the **1 hour** delay (or shortest available). Confirm no error.

- [ ] **Step 3: Force the letter to be deliverable (if needed) and open it**

If a freshly-sealed letter isn't yet in the inbox as readable (unlock in the future), either seal an already-due test letter or temporarily verify the reveal against an existing arrived letter. Click the postbox → click the letter.

Expected:
- Envelope appears with wax seal; "tap to break the seal".
- Tapping breaks the wax + opens the flap, then the envelope fades and the **postcard** scales in.
- Front shows your text on themed paper (matches the compose look).
- "turn over →" flips to the back; song embed + photo + doodle render; everything is read-only (no editing toolbar, no add/remove, no seal button).
- "← turn back" flips to the front. × and Esc close.

- [ ] **Step 4: Theme check**

Switch the theme (gear → a dark theme like rivendell and a light one like rose). Re-open a letter. The postcard paper + cover follow the theme (no hardcoded cream that ignores the palette).

- [ ] **Step 5: Legacy letter check**

Open an OLDER letter (sealed before this change, text-only). Expected: front shows text; back shows "no song" + empty doodle/photos gracefully — no crash.

- [ ] **Step 6: Final commit (if any verification fixups were made)**

```bash
git add -A
git commit -m "fix(letters): reveal-as-postcard verification fixups"
```
(Skip if nothing changed.)

---

## Self-Review Notes

- **Spec coverage:** Task 1 → CompactDoodleCanvas readOnly (spec §3); Task 2 → PostcardFront readOnly (§1); Task 3 → PostcardBack readOnly (§2); Task 4 → persist self-letter media (§5); Task 5 → RevealModal rewrite + full-payload decrypt + flip card + envelope animation (§4); Task 6 → manual verification incl. theme + legacy (spec Risks).
- **Mobile** intentionally untouched (`MobileLettersView`), per approved scope.
- **Open verification point:** `JournalEntry` / `StrokeData` export path from `@/store/journal` — confirm at Task 5 Step 1 before finalizing imports.
- **`usePhotoSrc` for letter photos:** Task 6 Step 3 exercises a letter photo end-to-end; if the encrypted ref doesn't resolve, check that `PhotoSlot`/`usePhotoSrc` reads `encryptedRef`/`encryptedRefIV` identically to journal entries.
