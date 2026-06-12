# Pagination Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone editor compute the *exact* desktop two-page break point, show it as a live overlay divider, and persist it so an entry written on mobile renders word-for-word identically on the desktop book.

**Architecture:** One shared geometry config (`page-geometry.ts`) drives both the desktop on-screen textarea and a hidden offscreen measurement textarea. One shared algorithm (overflow-predicate + `findLargestFittingPrefix` + word-snap) is called by desktop, the engine, and mobile — no duplicate copies. The engine measures against *desktop* geometry regardless of device, so the break matches everywhere. Mobile draws an informational divider overlay at the break and writes `PAGE_BREAK_MARKER` on save (the mechanism desktop already restores from).

**Tech Stack:** Next.js 16 / React 19, TypeScript, vitest (jsdom), Caveat web font via `next/font`.

**Spec:** `docs/superpowers/specs/2026-06-12-pagination-parity-design.md`

**Decisions carried in from grilling:**
- Offscreen exact measurement; **share the algorithm** (desktop refactored to call shared helpers, behavior-preserving).
- Drift guard = shared `page-geometry.ts` config + **vitest** tests on the pure logic; real-font pixel parity verified **manually in the browser** (jsdom returns zero for layout, so it cannot test real wrapping).
- Mobile display = one scroll + **overlay divider** (text stays one editable field).
- Recompute **live, debounced**.
- Engine takes **no `hasSong`** (song section height is always reserved). Engine accepts optional `fontFamily`/`fontSizePx` (default Caveat / 21px) for future restyle support; mobile uses defaults.

---

## File Structure

**Create:**
- `src/lib/journal/page-geometry.ts` — canonical measurement geometry (width, height, font, line-height) read by every measurement site.
- `src/lib/journal/pagination.ts` — pure algorithm: `snapToWordBoundary`, `paginateWithPredicate`. No DOM.
- `src/lib/journal/measure-dom.ts` — browser-only DOM helpers: hidden measurement textarea + overflow predicate.
- `src/lib/journal/paginate.ts` — `findPageBreak(text, opts)` glue (DOM predicate → pure algorithm). Browser-only with SSR fallback.
- `src/lib/journal/__tests__/pagination.test.ts` — vitest for the pure algorithm + html builder.

**Modify:**
- `src/lib/text-utils.ts` — add `paragraphsToHtml` + `buildPagedHtml` (marker insertion from a single string).
- `src/components/desk/LeftPage.tsx` — refactor `handleTextChange` to call shared helpers; textarea CSS sourced from `page-geometry.ts`.
- `src/components/desk/BookSpread.tsx` — `combineDraftHtml` reuses `paragraphsToHtml`.
- `src/components/desk/MobileJournalEntry.tsx` — live break recompute, divider overlay, marker on save.
- `src/lib/textarea-caret.ts` — add `getCharYOffset(textarea, index)` for divider placement.
- `src/lib/journal-constants.ts` — delete dead phone-viewport pagination fns.

---

## Task 1: Shared page geometry config

**Files:**
- Create: `src/lib/journal/page-geometry.ts`

Geometry sourced from the real desktop left page: page width 650px, padding `20px 20px 20px 50px` ([BookSpread.tsx:83](../../src/components/desk/BookSpread.tsx)) → writing width `650 - 50 - 20 = 580`. `LINE_HEIGHT = 32`, base font 21px Caveat (`var(--font-caveat), Georgia, serif`).

The writing-area **height** is set by flexbox at runtime, so it must be measured once on a real desktop and codified (Step 2) — jsdom can't compute it.

- [ ] **Step 1: Create the config with width + font known, height as a placeholder constant**

```typescript
// src/lib/journal/page-geometry.ts
//
// THE single source of truth for the desktop left-page text geometry. Both the
// on-screen LeftPage textarea AND the offscreen measurement textarea read these
// values, so the desktop break and the engine break cannot drift on geometry.
//
// Width is derived from BookSpread's page box (650px) minus the left page's
// horizontal padding (50 + 20). Height is the runtime flex height of the
// writing area, measured once on a real desktop (see plan Task 1 Step 2).

export const LEFT_PAGE_GEOMETRY = {
  /** Content width of the left-page textarea, px. 650 page − 50 − 20 padding. */
  WRITING_AREA_WIDTH: 580,
  /**
   * Content height of the left-page textarea, px. Measured from the real
   * desktop /write left page (textarea.clientHeight). Codified so the offscreen
   * engine reproduces the same capacity on any device.
   */
  WRITING_AREA_HEIGHT: 660, // PLACEHOLDER — replace via Task 1 Step 2
  LINE_HEIGHT: 32,
  BASE_FONT_SIZE_PX: 21,
  FONT_FAMILY: 'var(--font-caveat), Georgia, serif',
  /** CSS the measurement textarea must mirror to wrap like the real one. */
  WRAP: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
  },
} as const
```

- [ ] **Step 2: Measure the real height and replace the placeholder**

Run the app (`docker compose up -d`), open http://localhost:3112/write at a desktop width (≥1400px), log in with `.dev-creds.local`. In DevTools console:

```js
// Select the left-page writing textarea (first textarea in the spread)
const ta = document.querySelector('textarea')
console.log('writing area:', ta.clientWidth, ta.clientHeight)
```

Expected: width ≈ `580`. Set `WRITING_AREA_HEIGHT` to the logged `clientHeight` (and correct `WRITING_AREA_WIDTH` if it differs from 580). Record the measured numbers in a code comment.

- [ ] **Step 3: Commit**

```bash
git add src/lib/journal/page-geometry.ts
git commit -m "feat(pagination): add shared left-page geometry config"
```

---

## Task 2: Pure pagination algorithm

**Files:**
- Create: `src/lib/journal/pagination.ts`
- Test: `src/lib/journal/__tests__/pagination.test.ts`

Extracts the word-snap from [LeftPage.tsx:282-287](../../src/components/desk/LeftPage.tsx) and composes it with the existing `findLargestFittingPrefix` ([text-fit.ts](../../src/lib/text-fit.ts)). Pure — testable in jsdom with a fake predicate.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/journal/__tests__/pagination.test.ts
import { describe, it, expect } from 'vitest'
import { snapToWordBoundary, paginateWithPredicate } from '@/lib/journal/pagination'

const fitsIfLE = (limit: number) => (s: string) => s.length <= limit

describe('snapToWordBoundary', () => {
  it('keeps an index that already sits on a space', () => {
    expect(snapToWordBoundary('hello world', 5)).toBe(5) // index 5 is the space
  })
  it('walks back to the previous space when mid-word', () => {
    expect(snapToWordBoundary('hello world', 8)).toBe(5) // "wo|rld" -> back to space
  })
  it('walks back to a newline', () => {
    expect(snapToWordBoundary('ab\ncdef', 5)).toBe(2) // index 2 is the \n
  })
  it('returns the original index when no boundary exists before it', () => {
    expect(snapToWordBoundary('abcdef', 4)).toBe(4) // long unbroken word: hard cut
  })
  it('passes through 0, full length, and out-of-range', () => {
    expect(snapToWordBoundary('abc', 0)).toBe(0)
    expect(snapToWordBoundary('abc', 3)).toBe(3)
  })
})

describe('paginateWithPredicate', () => {
  it('returns full length when everything fits (no break)', () => {
    expect(paginateWithPredicate('hello world', fitsIfLE(100))).toBe(11)
  })
  it('snaps the fitting prefix back to a word boundary', () => {
    // raw fit = 8 chars ("hello wo"), snap back to the space at 5
    expect(paginateWithPredicate('hello world', fitsIfLE(8))).toBe(5)
  })
  it('respects the floor (never returns below it)', () => {
    expect(paginateWithPredicate('hello world here', fitsIfLE(2), 6)).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pagination`
Expected: FAIL — `Cannot find module '@/lib/journal/pagination'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/journal/pagination.ts
//
// Pure pagination logic shared by the desktop textarea, the offscreen
// measurement engine, and the mobile editor. The DOM measurement (the `fits`
// predicate) is supplied by the caller — this file has no DOM dependency so it
// is unit-testable in jsdom. Keep src/lib/journal/__tests__/pagination.test.ts
// green when touching anything here.

import { findLargestFittingPrefix } from '@/lib/text-fit'

/**
 * Given a character `index`, walk backward to the nearest space or newline so a
 * page break never splits a word. Mirrors the snap in LeftPage.handleTextChange.
 * If no boundary exists before `index` (a very long unbroken word), returns
 * `index` unchanged (a hard cut, same as desktop today).
 */
export function snapToWordBoundary(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index
  let i = index
  while (i > 0 && text[i] !== ' ' && text[i] !== '\n') i--
  return i === 0 ? index : i
}

/**
 * Find the character index where page 1 ends: the largest prefix that `fits`,
 * snapped back to a word boundary. Returns `text.length` (no break) when the
 * whole text fits. `floor` guarantees a minimum (e.g. existing content stays).
 */
export function paginateWithPredicate(
  text: string,
  fits: (prefix: string) => boolean,
  floor: number = 0,
): number {
  const raw = findLargestFittingPrefix(text, fits, floor)
  if (raw >= text.length) return text.length
  return snapToWordBoundary(text, raw)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pagination`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/journal/pagination.ts src/lib/journal/__tests__/pagination.test.ts
git commit -m "feat(pagination): pure word-snap + predicate-driven break"
```

---

## Task 3: HTML builder with page-break marker

**Files:**
- Modify: `src/lib/text-utils.ts`
- Test: `src/lib/journal/__tests__/pagination.test.ts` (append)

Mobile currently saves `'<p>' + text.replace(/\n/g,'</p><p>') + '</p>'` with **no** marker ([MobileJournalEntry.tsx:191](../../src/components/desk/MobileJournalEntry.tsx)). We add a builder that splits a single string at the break index and inserts `PAGE_BREAK_MARKER`, round-tripping through the existing `htmlToSplitPlainText`.

- [ ] **Step 1: Write the failing test (append to pagination.test.ts)**

```typescript
import { buildPagedHtml } from '@/lib/text-utils'
import { htmlToSplitPlainText } from '@/lib/text-utils'

describe('buildPagedHtml', () => {
  it('emits a single page (no marker) when break == length', () => {
    expect(buildPagedHtml('hello world', 11)).toBe('<p>hello world</p>')
  })
  it('inserts the marker and strips leading space on the right page', () => {
    const html = buildPagedHtml('hello world', 5)
    expect(html).toBe('<p>hello</p><!--page-break--><p>world</p>')
  })
  it('round-trips through htmlToSplitPlainText', () => {
    const html = buildPagedHtml('line one\nline two', 8)
    const [left, right] = htmlToSplitPlainText(html)
    expect(left).toBe('line one')
    expect(right).toBe('line two')
  })
  it('returns empty string for blank text', () => {
    expect(buildPagedHtml('   ', 0)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pagination`
Expected: FAIL — `buildPagedHtml is not exported`.

- [ ] **Step 3: Add `paragraphsToHtml` + `buildPagedHtml` to text-utils.ts**

Append to `src/lib/text-utils.ts`:

```typescript
/**
 * Wrap plain text (\n-separated) in <p> paragraphs. Shared by buildPagedHtml
 * and BookSpread.combineDraftHtml so both sides format identically.
 */
export function paragraphsToHtml(text: string): string {
  return '<p>' + text.replace(/\n/g, '</p><p>') + '</p>'
}

/**
 * Build stored entry HTML from a single plain-text string and a break index.
 * Inserts PAGE_BREAK_MARKER at the break so the desktop book restores the exact
 * same left/right split via htmlToSplitPlainText. The right page's leading
 * whitespace is stripped to match desktop's overflow handling.
 */
export function buildPagedHtml(text: string, breakIndex: number): string {
  const left = text.slice(0, breakIndex)
  const right = text.slice(breakIndex).replace(/^\s+/, '')
  if (!left.trim() && !right) return ''
  if (!right) return paragraphsToHtml(left)
  return paragraphsToHtml(left) + PAGE_BREAK_MARKER + paragraphsToHtml(right)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pagination`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/text-utils.ts src/lib/journal/__tests__/pagination.test.ts
git commit -m "feat(pagination): buildPagedHtml inserts page-break marker from a single string"
```

---

## Task 4: DOM measurement engine

**Files:**
- Create: `src/lib/journal/measure-dom.ts`
- Create: `src/lib/journal/paginate.ts`

Browser-only. A reused hidden textarea, styled from `page-geometry.ts`, gives the overflow predicate. `findPageBreak` ties it to the pure algorithm, with an SSR/jsdom fallback so it never throws server-side. No unit test (jsdom layout is zero); verified manually in Task 9.

- [ ] **Step 1: Create the measurement DOM helper**

```typescript
// src/lib/journal/measure-dom.ts
//
// Browser-only DOM measurement for pagination. Maintains ONE hidden textarea
// styled to the canonical desktop left-page geometry; the overflow predicate
// it returns is the exact check desktop uses (scrollHeight <= clientHeight + 1).
// Never import this in server code paths — guard with typeof document.

import { LEFT_PAGE_GEOMETRY as G } from './page-geometry'

let hidden: HTMLTextAreaElement | null = null

function getHiddenTextarea(): HTMLTextAreaElement {
  if (hidden) return hidden
  const el = document.createElement('textarea')
  el.setAttribute('aria-hidden', 'true')
  el.tabIndex = -1
  Object.assign(el.style, {
    position: 'absolute',
    left: '-99999px',
    top: '0',
    boxSizing: 'border-box',
    resize: 'none',
    border: '0',
    padding: '0',
    margin: '0',
    overflow: 'hidden',
    visibility: 'hidden',
    whiteSpace: G.WRAP.whiteSpace,
    wordBreak: G.WRAP.wordBreak,
    overflowWrap: G.WRAP.overflowWrap,
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(el)
  hidden = el
  return el
}

export interface MeasureGeometry {
  fontFamily?: string
  fontSizePx?: number
}

/**
 * Build the overflow predicate against the canonical desktop left page.
 * Returns a function: does `text.slice(0, n)` fit on page 1?
 */
export function makeLeftPageFits(geom: MeasureGeometry = {}): (prefix: string) => boolean {
  const el = getHiddenTextarea()
  el.style.width = `${G.WRITING_AREA_WIDTH}px`
  el.style.height = `${G.WRITING_AREA_HEIGHT}px`
  el.style.lineHeight = `${G.LINE_HEIGHT}px`
  el.style.fontFamily = geom.fontFamily ?? G.FONT_FAMILY
  el.style.fontSize = `${geom.fontSizePx ?? G.BASE_FONT_SIZE_PX}px`
  return (prefix: string) => {
    el.value = prefix
    return el.scrollHeight <= el.clientHeight + 1
  }
}

/** True once the Caveat web font is ready (measuring before this mismeasures). */
export function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  return (document as Document).fonts.ready.then(() => undefined)
}
```

- [ ] **Step 2: Create `findPageBreak` glue**

```typescript
// src/lib/journal/paginate.ts
//
// findPageBreak — the public entry point. In the browser it measures against the
// canonical desktop left page so the break matches the desktop book on any
// device. On the server / in jsdom (no real layout) it falls back to the
// character-count heuristic so callers never crash.

import { paginateWithPredicate } from './pagination'
import { makeLeftPageFits, type MeasureGeometry } from './measure-dom'
import { splitTextForSpread } from '@/lib/text-utils'

export interface FindPageBreakOpts extends MeasureGeometry {
  /** Lower bound for the break (e.g. existing content that must stay on page 1). */
  floor?: number
}

/**
 * Character index where page 1 ends for the given plain text, measured against
 * the desktop left-page geometry. Returns text.length when it all fits.
 */
export function findPageBreak(text: string, opts: FindPageBreakOpts = {}): number {
  if (!text) return 0
  if (typeof document === 'undefined') {
    // SSR / test fallback: derive an index from the char-count split.
    const [left] = splitTextForSpread(text)
    return left.length
  }
  const fits = makeLeftPageFits(opts)
  return paginateWithPredicate(text, fits, opts.floor ?? 0)
}
```

- [ ] **Step 3: Verify it builds**

Run: `npm run build` (or `docker compose exec app npx tsc --noEmit` via the `typecheck` skill)
Expected: no type errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/journal/measure-dom.ts src/lib/journal/paginate.ts
git commit -m "feat(pagination): offscreen measurement engine (findPageBreak)"
```

---

## Task 5: Refactor desktop to the shared algorithm (behavior-preserving)

**Files:**
- Modify: `src/components/desk/LeftPage.tsx:248-317` (`handleTextChange`)
- Modify: `src/components/desk/LeftPage.tsx` textarea style block (~433-443) + `LINE_HEIGHT` const
- Modify: `src/components/desk/BookSpread.tsx` `combineDraftHtml` (~93-101)

Desktop keeps identical UX; it now calls the shared `paginateWithPredicate` + `snapToWordBoundary` instead of its inline copy, and its textarea geometry reads from `page-geometry.ts`. This is the real drift guard. **No automated test — verify manually (Step 4).**

- [ ] **Step 1: Refactor `handleTextChange` to use shared helpers**

In `src/components/desk/LeftPage.tsx`, replace the inline binary-search + snap (lines ~258-300) so the fit/snap come from shared code. Keep the cursor logic. New body of the overflow branch:

```typescript
    // Use DOM measurement to detect overflow against the REAL on-screen textarea.
    const prevValue = textarea.value
    textarea.value = newText
    const fitsOnScreen = (prefix: string) => {
      textarea.value = prefix
      return textarea.scrollHeight <= textarea.clientHeight + 1
    }

    if (fitsOnScreen(newText)) {
      textarea.value = prevValue
      onTextChange?.(newText)
      return
    }

    // Shared algorithm: largest fitting prefix, snapped to a word boundary.
    const splitAt = paginateWithPredicate(newText, fitsOnScreen)
    textarea.value = prevValue

    const fitsText = newText.slice(0, splitAt)
    const overflowText = newText.slice(splitAt).replace(/^\s+/, '')
    const cursorStaysOnLeft = overflowText.length === 0 || newCursorPos <= splitAt

    onTextChange?.(fitsText)
    if (onPageFull) onPageFull(overflowText, cursorStaysOnLeft)
    // ...keep the existing requestAnimationFrame caret-restore block unchanged...
```

Add the import at the top:

```typescript
import { paginateWithPredicate } from '@/lib/journal/pagination'
```

Remove the now-dead local binary-search loop and the local snap loop (lines ~270-287 of the original).

- [ ] **Step 2: Source the textarea geometry from page-geometry.ts**

Replace the local `const LINE_HEIGHT = 32` (line 22) and the textarea's hard-coded line-height with config values:

```typescript
import { LEFT_PAGE_GEOMETRY } from '@/lib/journal/page-geometry'
const LINE_HEIGHT = LEFT_PAGE_GEOMETRY.LINE_HEIGHT
```

In the textarea `style` (around line 437), keep `fontFamily`/`fontSize` as the resolved entry-style values (these already match the geometry defaults for the default entry), and ensure `lineHeight: \`${LINE_HEIGHT}px\``. No other visual change.

- [ ] **Step 3: Share `paragraphsToHtml` in BookSpread.combineDraftHtml**

In `src/components/desk/BookSpread.tsx`, import and reuse the shared helper so left/right formatting can't drift from mobile's:

```typescript
import { paragraphsToHtml, PAGE_BREAK_MARKER } from '@/lib/text-utils'

function combineDraftHtml(left: string, right: string): string {
  const leftHtml = left ? paragraphsToHtml(left) : ''
  const rightHtml = right ? paragraphsToHtml(right) : ''
  if (!rightHtml) return leftHtml
  return leftHtml + PAGE_BREAK_MARKER + rightHtml
}
```

(Match the existing empty-handling; adjust if the original differed.)

- [ ] **Step 4: Manual verification — desktop unchanged**

Restart (`docker compose restart app`), open `/write` desktop width, log in. Type past the bottom of the left page. Verify:
- Overflow still flows onto the right page at the same word as before.
- Caret behaves the same (Enter near the bottom keeps focus correctly).
- Saving + reopening shows the same split.

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `npm test`
Expected: all green (text-fit + pagination + existing suites).

- [ ] **Step 6: Commit**

```bash
git add src/components/desk/LeftPage.tsx src/components/desk/BookSpread.tsx
git commit -m "refactor(pagination): desktop calls shared break algorithm + geometry"
```

---

## Task 6: Mobile — live break recompute + divider overlay

**Files:**
- Modify: `src/lib/textarea-caret.ts` (add `getCharYOffset`)
- Modify: `src/components/desk/MobileJournalEntry.tsx`

The break index comes from `findPageBreak` (desktop geometry). The divider's *pixel y* must be measured in the **phone's** textarea (it wraps narrower), so we add a mirror-based `getCharYOffset`.

- [ ] **Step 1: Add `getCharYOffset` to textarea-caret.ts**

```typescript
/**
 * Pixel y-offset (from the top of the textarea's content) of character `index`,
 * measured by mirroring the textarea's own computed style + width. Used to place
 * the page-break divider on the mobile editor, where text wraps at the phone
 * width rather than the desktop page width.
 */
export function getCharYOffset(textarea: HTMLTextAreaElement, index: number): number {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const copy = [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'textTransform',
  ] as const
  for (const p of copy) mirror.style[p as any] = style[p as any]
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.left = '-99999px'
  mirror.style.top = '0'
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.whiteSpace = 'pre-wrap'
  const before = textarea.value.slice(0, index)
  // A trailing marker span lets us read the y at exactly `index`.
  mirror.textContent = before
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const y = marker.offsetTop
  document.body.removeChild(mirror)
  return y
}
```

- [ ] **Step 2: Add break state + live recompute in MobileJournalEntry**

Near the other state (after `const [text, setText] = useState('')`):

```typescript
import { findPageBreak } from '@/lib/journal/paginate'
import { fontsReady } from '@/lib/journal/measure-dom'
import { getCharYOffset } from '@/lib/textarea-caret'

const writeTextareaRef = useRef<HTMLTextAreaElement>(null)
const [dividerY, setDividerY] = useState<number | null>(null)
const breakDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Add an effect that recomputes the break (debounced) whenever `text` changes:

```typescript
useEffect(() => {
  if (breakDebounceRef.current) clearTimeout(breakDebounceRef.current)
  breakDebounceRef.current = setTimeout(async () => {
    await fontsReady()
    const ta = writeTextareaRef.current
    if (!ta) return
    const idx = findPageBreak(text)
    if (idx >= text.length) {
      setDividerY(null) // no break — fits on one desktop page
    } else {
      setDividerY(getCharYOffset(ta, idx))
    }
  }, 200)
  return () => { if (breakDebounceRef.current) clearTimeout(breakDebounceRef.current) }
}, [text])
```

- [ ] **Step 3: Attach the ref to the write textarea and render the divider overlay**

Give the writing `<textarea>` the new ref (`ref={writeTextareaRef}`) and wrap it in a `relative` container. After the textarea, render:

```tsx
{dividerY !== null && (
  <div
    aria-hidden
    className="pointer-events-none absolute left-0 right-0 flex items-center gap-2"
    style={{ top: dividerY }}
  >
    <span className="h-px flex-1" style={{ background: `${mutedColor}55` }} />
    <span
      className="text-[9px] uppercase tracking-[0.18em]"
      style={{ color: mutedColor }}
    >
      page 2
    </span>
    <span className="h-px flex-1" style={{ background: `${mutedColor}55` }} />
  </div>
)}
```

(The container holding the textarea must be `position: relative` so `top: dividerY` is relative to the text origin. If the textarea has internal scroll, offset `dividerY` by `-textarea.scrollTop` — add that in Step 2's `setDividerY`.)

- [ ] **Step 4: Manual verification — divider appears + tracks**

Restart, open `/write` at a phone width (DevTools device toolbar, e.g. 390px). Type enough to overflow one desktop page. Verify a "page 2" divider line appears and moves up/down live (debounced) as you add/remove text and newlines.

- [ ] **Step 5: Commit**

```bash
git add src/lib/textarea-caret.ts src/components/desk/MobileJournalEntry.tsx
git commit -m "feat(pagination): mobile live break divider overlay"
```

---

## Task 7: Mobile save writes the page-break marker

**Files:**
- Modify: `src/components/desk/MobileJournalEntry.tsx:191` (html build in the autosave effect)

Replace the marker-less HTML build so the stored entry carries the exact break, restored 1:1 by the desktop book.

- [ ] **Step 1: Use `buildPagedHtml` with the measured break**

Replace:

```typescript
const html = '<p>' + text.replace(/\n/g, '</p><p>') + '</p>'
```

with:

```typescript
import { buildPagedHtml } from '@/lib/text-utils'
// ...
const breakIndex = findPageBreak(text)
const html = buildPagedHtml(text, breakIndex)
```

(`findPageBreak` is synchronous and cheap; the autosave is already debounced upstream, so calling it here is fine. The fonts-ready gate matters only for the live divider; by autosave time the font is loaded.)

- [ ] **Step 2: Manual cross-device verification**

Phone width: write a long entry that crosses the break, let it autosave. Switch to desktop width, reload, open the same entry. **The desktop book must turn the page at the same word the divider showed.** Repeat with extra newlines.

- [ ] **Step 3: Run the suite + typecheck**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/desk/MobileJournalEntry.tsx
git commit -m "feat(pagination): mobile persists exact desktop page break on save"
```

---

## Task 8: Delete the dead phone-viewport pagination

**Files:**
- Modify: `src/lib/journal-constants.ts:55-101`

These four functions paginate by the phone's own viewport (the old, drifting model) and are imported nowhere (verified: only self-references). Removing them prevents a future regression source.

- [ ] **Step 1: Confirm they're unused**

Run: `grep -rn "getMobileWritingLinesPerPage\|getMobileTotalWritingPages\|getMobileCharsPerPage\|countVisualLines" src/`
Expected: only the definitions in `journal-constants.ts` (no import sites).

- [ ] **Step 2: Delete the four functions and their doc comments**

Remove `getMobileWritingLinesPerPage`, `getMobileCharsPerPage`, `getMobileTotalWritingPages`, and `countVisualLines` from `src/lib/journal-constants.ts` (lines ~55-101). Keep `getLeftPageMaxLines` / `getRightPageMaxLines` and the `JOURNAL` constants.

- [ ] **Step 3: Verify build is clean**

Run: `npm run build`
Expected: no "unused export" / no broken imports.

- [ ] **Step 4: Commit**

```bash
git add src/lib/journal-constants.ts
git commit -m "chore(pagination): remove dead phone-viewport pagination helpers"
```

---

## Task 9: Final cross-device parity verification

**Files:** none (manual gate).

- [ ] **Step 1: Parity sweep**

Restart the app. For each case below, write on a phone width, autosave, then reload at desktop width and open the entry. Confirm the desktop page break lands at the **same word** the mobile divider showed:
- short entry (no break — no divider, single desktop page)
- entry that fills exactly to the boundary
- entry with several blank lines / newlines near the boundary
- entry with one very long unbroken "word"
- entry with a song attached (break position unchanged vs no song — confirms the always-reserved song section)

- [ ] **Step 2: Desktop regression sweep**

On desktop, confirm typing overflow, caret behavior, and reopening a desktop-written entry all behave exactly as before the change.

- [ ] **Step 3: Suite + lint**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

---

## Self-Review (completed)

- **Spec coverage:** offscreen engine (T4), shared geometry config (T1), shared algorithm/desktop refactor (T5), mobile divider + live recompute (T6), marker persistence (T7), dead-code cleanup (T8), parity guard via shared config + vitest pure-logic tests + manual browser check (T2/T3/T9). ✅
- **Spec correction:** spec listed `hasSong` as affecting the break; code shows the song section height is always reserved, so the engine takes no `hasSong`. Reflected in T1/T9. Update the spec's decision table to match.
- **Placeholders:** the only deliberate placeholder is `WRITING_AREA_HEIGHT`, which T1 Step 2 measures and replaces with a real number before anything depends on it. No others.
- **Type consistency:** `paginateWithPredicate`, `snapToWordBoundary`, `findPageBreak`, `makeLeftPageFits`, `buildPagedHtml`, `paragraphsToHtml`, `getCharYOffset` — names used consistently across tasks.
