# Letter reveal = the same postcard (read-only, flippable)

**Date:** 2026-06-05
**Branch:** diary-camera-polish (or follow-up)
**Status:** Approved, ready for implementation plan

## Problem

Opening an arrived letter currently shows a small, bespoke single-page card
(`RevealModal`) that only renders the letter **text**. It does not look like the
postcard you actually wrote, and it never shows the song / photos / doodle.

The user wants: clicking a letter keeps the envelope/seal-break animation, but
once it opens, the envelope clears away and you see **the exact postcard you
wrote** — front (text) → flip → back (song · photos · doodle) — read-only and
theme-specific.

## Goal

Reveal a letter as the *same* `PostcardFront` / `PostcardBack` used in compose,
in a read-only mode, flippable, on the same leather blotter, themed via
`getGlassDiaryColors(theme)`.

Non-goals: mobile reveal (`MobileLettersView`) stays as-is this pass; friend
letters (they land in other inboxes); compose UI is unchanged except the seal
payload fix below.

## Approach

Reuse the real postcard components in a new `readOnly` mode — single source of
truth, so the read view is guaranteed identical to the write view and inherits
theme support for free. Rejected alternatives: a separate reveal-only card
(drifts from compose) and reusing `ComposeView` wholesale (too coupled to
autosave/seal/drafts).

## Changes

### 1. `PostcardFront` — add `readOnly?: boolean`
- TipTap `editable: false` when read-only (keep the ResizeObserver line-measure
  so layout is identical; the overflow-trim path is inert with no input).
- Hide the **cancel** button.
- Keep **"turn over →"** as the read flip control (no pulse needed; harmless if
  it stays).
- Content seeded from `body` as today.

### 2. `PostcardBack` — add `readOnly?: boolean`
- `PhotoBlock` rendered `disabled`, no `onPhotoAdd` / `onPhotoRemove`.
- Song: render `<SongEmbed>` only; never show `SongPicker`.
- Doodle: `CompactDoodleCanvas` in read-only mode (see #3).
- Footer: only **"← turn back"** (no seal button).
- Sign-off block kept.

### 3. `CompactDoodleCanvas` — add `readOnly?: boolean`
- When true: no pointer handlers, no toolbar/brush UI; render the saved strokes
  only. Same SVG path rendering as today.

### 4. `RevealModal` — rewrite the content stage
- Keep phases `sealed → breaking → opening → shown` and the entire
  envelope/wax/flap/seal animation unchanged.
- Decrypt the **full** self-letter payload, parsing the JSON into
  `{ text, song, photos, doodleStrokes }`. Back-compat: any missing field → empty.
  Legacy / non-JSON bodies → `text` only.
- On `opening`/`shown`: fade + scale the envelope out, and mount the flippable
  postcard (same 3D flip wrapper + leather blotter as `ComposeView`) with a local
  `face: 'front' | 'back'` state, both faces `readOnly`.
- `isViewed` letters skip straight to `shown` (no seal step), postcard visible.
- Close (×) + Esc behaviour unchanged.

### 5. Persist self-letter photos/doodles at seal
- In `ComposeView.handleSeal` self-branch, pass the real `photos` (by
  `encryptedRef` / `url`) and `doodleStrokes` into `buildSelfLetterPayload`
  instead of the current hardcoded `[]` / `[]`.
- Doodle strokes stored as **plaintext inside the already-E2EE-encrypted JSON**
  (the whole payload is encrypted under the master key, so no per-stroke
  encryption needed). Photos stored by reference (`encryptedRef`), decrypted on
  read via `usePhotoSrc` exactly like the journal.
- Extend `SelfLetterDraft` / the JSON shape to carry `doodleStrokes: StrokeData[]`
  alongside the existing `photos`. Affects **new letters only**; old letters keep
  rendering (empty back media).

## Data flow (read)

1. Inbox row carries inline ciphertext (`letter.text`) for self letters.
2. `RevealModal` calls `decryptEntryFromServer` → JSON string → parse to
   `{ text, song, photos, doodleStrokes }`.
3. `PostcardFront` shows `text`; `PostcardBack` shows `song`, `photos`
   (via `usePhotoSrc`), `doodleStrokes` — all read-only.

## Risks / notes

- The reveal card is `min(760px, 100vw-48px)` wide — fine on desktop, hence
  mobile is deferred.
- Trim/overflow logic in `PostcardFront` must be safely inert when
  `editable:false` (no `onUpdate` firing from user input).
- Verify `usePhotoSrc` works for letter-context photos identically to journal
  entries (same `encryptedRef` shape).
