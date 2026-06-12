# Pagination Parity — one break engine, desktop ⇄ mobile WYSIWYG

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Himanshu

## Why

Writing on the phone should tell you **exactly** how the entry renders on the
desktop two-page book — including *where the page break lands*. Today it can't,
because three different pagination computations exist and **none of them agree**:

1. **Desktop (source of truth):** live DOM binary-search in
   [`LeftPage.tsx:262-287`](../../src/components/desk/LeftPage.tsx) — measures the
   real on-screen textarea (fixed 650×820 left page, real Caveat font), pushes
   overflow to the right page, persists the cut as `PAGE_BREAK_MARKER`. *Exact.*
2. **Stored/legacy:** `splitTextForSpread` char-count formula
   (`CHARS_PER_LINE = 38`) in [`text-utils.ts:62`](../../src/lib/text-utils.ts).
3. **Mobile:** `getMobileWritingLinesPerPage` paginates by the **phone's own
   viewport height** ([`journal-constants.ts:67`](../../src/lib/journal-constants.ts)).

Desktop paginates by a fixed 650px page; mobile by the phone screen. They can
never match — and Caveat is a variable-width handwriting font, so the
`38 chars/line` guess drifts hard. This feature makes the phone compute the
**desktop's** break, against **desktop geometry + the real font**.

This is **feature (b) of three.** Build order: **(b) this → (c) try mode →
(a) mobile polish**. Try Mode depends on (b) (phone must show the real two-page
book feel). See `2026-06-12-try-mode-design.md`.

## Key simplifier

Desktop is **always exactly 2 pages / one break** — `MAX_CHARS = 1200` always
fits the spread (left ≈22 lines + right ≈15 lines). So this is "find the single
left→right cut," **not** N-page reflow.

## Decisions (locked)

| Question | Decision |
|---|---|
| Parity mechanism | **Offscreen exact measurement.** A shared engine measures text in a HIDDEN textarea sized to the desktop left-page geometry with the real Caveat font, using the same overflow binary-search desktop uses. On the phone it measures *desktop* geometry, not the phone — so the break matches pixel-for-pixel. |
| Desktop refactor | **Keep desktop's live binary-search as-is.** The engine *reproduces* the algorithm for mobile rather than unifying. ⚠️ This means two measurement code paths — see Drift guard. |
| Drift guard | **Shared config + parity test.** Both the on-screen textarea AND the offscreen measurer read ONE `page-geometry.ts` config (font, size, line-height, writing-area width, padding), so geometry can't drift. PLUS a parity test feeding sample texts through the engine and asserting the break matches desktop's reference. (This overrides the project's usual skip-tests default — it's the one place a test directly guards the regression this feature fixes.) |
| Mobile display | **One scroll + overlay divider.** Phone keeps ONE continuous textarea; an absolutely-positioned divider line ("┈┈ page 2 ┈┈") is drawn on top at the break's y-position. Text flows normally, caret moves freely, divider is informational and moves live. |
| Recompute timing | **Live, debounced.** Break recomputes as the user types (debounced), like desktop pushing overflow in real time. |
| Song dependency | **None** (corrected during planning). The left page's song section is a fixed-height container (~68px) that is *always reserved* whether or not a song is attached, so the writing capacity — and thus the break — is constant. Engine takes no `hasSong`. Photos/doodle only affect the right page (always has room under the 1200 cap). |

## Architecture

### New unit — `page-geometry.ts` (shared config, single source of truth)

`src/lib/journal/page-geometry.ts`. The ONE place the page measurement is
defined. Both consumers import from here so they cannot drift:

- `FONT_FAMILY` (Caveat), `FONT_SIZE` (21px), `LINE_HEIGHT` (32px)
- `WRITING_AREA_WIDTH` (the real left-page writing width, ~560px — pull the
  exact value from LeftPage's textarea CSS during planning)
- `PADDING`, `white-space`/`word-break`/`overflow-wrap` rules
- `getLeftWritingHeight(hasSong: boolean)` — left page height minus song/label
  reservations (reuses the existing `journal-constants` heights)

LeftPage's on-screen textarea is migrated to consume these same constants (CSS
sourced from config), so "shared config drives both" is real, not aspirational.

### New unit — the pagination engine

`src/lib/journal/paginate.ts`:

```
findPageBreak(fullText: string, opts: { hasSong: boolean }): number
  → returns the character index where page 1 ends (page 2 = rest)
```

Implementation:
- A **hidden `<textarea>`** (off-screen, `position:absolute; visibility:hidden`)
  styled from `page-geometry.ts` at the desktop left-page width + height.
- **Gate on `document.fonts.ready`** before first measure — measuring with a
  fallback font gives the wrong width → wrong break. Re-measure once the font
  resolves.
- Same overflow detection desktop uses: set value, compare
  `scrollHeight <= clientHeight + 1`; binary-search the max chars that fit; snap
  back to a word/newline boundary (mirrors
  [`LeftPage.tsx:269-287`](../../src/components/desk/LeftPage.tsx)).
- Reuses `findWordBoundary` from `text-utils`.
- A singleton hidden element (created once, reused) avoids per-call DOM churn.

### Consumer — mobile editor

`MobileJournalEntry`:
- On text change (debounced), call `findPageBreak(text, { hasSong })` → break
  index `N`.
- **Second measurement (phone geometry):** locate where char `N` sits in the
  *phone's* textarea (it wraps at the narrower phone width) to get the divider's
  y-pixel. Use a mirror element or a `Range` over a synced overlay.
- Render the divider overlay at that y. It updates live as the break moves.
- Output HTML still inserts `PAGE_BREAK_MARKER` at index `N` on save, so the
  desktop restores the identical cut (existing mechanism, unchanged).

### Desktop — unchanged behavior

LeftPage keeps its live binary-search. The only change: its textarea CSS now
derives from `page-geometry.ts` (so the engine measures the same geometry). No
change to the typing/overflow UX.

### Cleanup

Delete the now-dead phone-viewport pagination:
`getMobileWritingLinesPerPage`, `getMobileTotalWritingPages`,
`getMobileCharsPerPage`, `countVisualLines` ([journal-constants.ts:67-101](../../src/lib/journal-constants.ts))
— and any mobile UI consuming them. Leaving them is drift-source #5.

## Data flow

Phone: type → debounce → `findPageBreak` (desktop geometry, hidden textarea,
real font) → break index `N` → phone-side measure y of char `N` → move divider
overlay. Save → HTML with `PAGE_BREAK_MARKER` at `N`. Desktop opens the entry →
`htmlToSplitPlainText` reads the marker → identical left/right split. ✅ parity.

## Error handling

- **Font not yet loaded:** defer first measure to `document.fonts.ready`; show no
  divider until measured (don't draw at a wrong position).
- **Engine unavailable (SSR / no DOM):** `findPageBreak` falls back to the
  existing char-count `splitTextForSpread` so nothing crashes; divider just less
  exact until client measure runs.
- **Very long unbroken word:** word-boundary snap falls back to a hard cut (same
  as desktop today).

## Testing (parity test is in-scope, by decision)

- **Parity test** (`src/lib/journal/__tests__/paginate.test.ts`): a table of
  sample texts (short, exactly-full, overflowing, many newlines, long word, with
  & without song) → assert `findPageBreak` index matches a committed reference
  set derived from desktop measurement. This is the drift guard's teeth.
- Manual: write on phone, watch the divider track live; save; open same entry on
  desktop; confirm the page break lands at the same word. Repeat with a song
  attached (break should move up). Tablet width: break correct, visually scaled.

## Out of scope

- Phone rendering the *full* swipeable two-page book (chosen display is
  one-scroll + divider). A future enhancement could upgrade the divider into real
  swipe pages; the engine already returns the break it would need.
- N-page entries (desktop is always 2 pages under the 1200 cap).
- Unifying desktop onto the engine (explicitly deferred — managed via shared
  config + parity test instead).

## Open details to settle during planning

1. **Exact `WRITING_AREA_WIDTH` + padding** — read the real values off LeftPage's
   textarea CSS and codify in `page-geometry.ts`.
2. **Phone-side y measurement technique** — mirror div vs `Range` over an overlay;
   pick whichever tracks the textarea's wrapping most faithfully.
3. **Divider label/styling** — theme-aware (read `useThemeStore`, per CLAUDE.md);
   exact copy ("page 2", a fold line, etc.) is a small design choice.
