# Letter Compose Redesign — Design Spec

**Date:** 2026-05-15
**Status:** Awaiting user review
**Lands in:** `feat/e2ee-onboarding` branch (alongside Phase 2 work)
**Scope:** UI/UX redesign of the letter compose flow. No changes to the letters home page (tabs stay `letters | sent | lights`). No changes to Lights. No backend write-path migration (writes continue to `JournalEntry` per Phase 2 reality).

---

## Summary

Redesign the letter compose UI from a single inline form (recipient toggle + body editor + unlock pills + email field all on one back-of-postcard surface) into a three-step ceremonial flow:

1. **Begin → ceremonial recipient picker.** Tap "Begin a letter" → an interstitial asks "Who's this letter for?" with two cards (Future me / A friend). Friend selection collects the recipient's name. Picker closes; compose opens with recipient locked.
2. **Compose → two-page letter.** A two-sided postcard with the front as a dedicated writing surface (lines, date, stamp, salutation pre-printed above the lines, no overlap). When the front is full, a glowing "turn over" button invites the user to flip. The back is split: left half = continuation writing lines; right half = music, two photos, doodle. Letter has a hard cap when both writing pages fill.
3. **Fold & seal → recipient-aware modal.** A single modal collects only delivery details: when to send (always), and email (only for friend letters). Confirm → fold animation → done.

Drafts (unsealed letters) are surfaced in the existing Sent tab as a pinned top section, so users can return to and complete unfinished letters before sealing.

The change is **UI-only against the Phase 2 backend**: writes still go to `JournalEntry` with master-key E2EE encryption; photos/song/doodle reuse the journal storage adapter and components verbatim.

## Goals

- Give the user a dedicated, uncluttered writing surface on the front of the letter — no buttons, stamps, recipient toggles, or hint text overlapping the lines they write on.
- Replace the inline recipient toggle + unlock-pills + email field on the back with a clean separation: writing lives in compose, delivery details live in the seal modal.
- Add a real two-page letter feel (front + back-left writing, back-right media) without introducing scrollbars on either page.
- Surface drafts so unfinished letters aren't invisible to the user.
- Match Hearth's slow, intentional aesthetic — ceremonial picker, gentle glow on the turn-over button, no popups or jitter.
- Reuse journal components (`Editor`, `PhotoBlock`, song embed, doodle canvas) verbatim. No new media-handling code.

## Non-goals

- **No changes to the letters home page.** The `letters | sent | lights` tab nav stays. (We discussed a desk/drawer metaphor; deferred.)
- **No changes to Lights / stranger notes.** That redesign is its own future work.
- **No data-model migration.** Writes stay on `JournalEntry` with `entryType: letter` (self) or `unsent_letter` (friend). The Phase 3/4 migration of writes onto the `Letter` model is independent; when it lands, the redesigned UI's API contract doesn't have to change.
- **No new cron, no new email logic.** Friend-letter delivery still goes through the existing `/api/cron/deliver-letters` flow. The 30-day cap on friend-letter unlock dates is enforced at write/seal time, not at delivery.
- **No multi-page expansion.** A letter has exactly two pages — front and back-left. When both fill, the user cannot type more text. They can still add media to the back-right beyond that point.
- **No new tests.** Per project convention (`feedback_skip_tests.md`), verification is manual in Docker against `localhost:3112`.

---

## Context: Phase 2 reality the redesign sits on top of

After the 9-commit Phase 2 ship (`4efee53..74d4eda`):

- `JournalEntry` is still the source-of-record for **writes**. Compose autosaves to a `JournalEntry` row from the first keystroke, with `entryType: letter` or `unsent_letter`, `isSealed: false`. Sealing flips `isSealed: true`.
- `Letter` + `LetterDelivery` tables exist but are populated **only by the idempotent backfill**. No native `Letter` writes yet.
- Read routes (`/api/letters/{inbox,sent,arrived,mine,received}` and `/api/letters/[id]/{peek,viewed,read}`) dual-read: `Letter` first, fall back to `JournalEntry`. State (peek/viewed/read) is sourced from `JournalEntry` via join.
- E2EE is mandatory (Phase 1). Every new user has a master key. Body text, recipient name/email, song URL, doodle strokes JSON are encrypted under the master key. Photos use the `/api/photos` adapter with the encrypted-ref pattern (`encryptedRef` + `encryptedRefIV` on `EntryPhoto`).
- Photos and doodles join via `JournalEntry`, not `Letter`. `EntryPhoto.entryId → JournalEntry.id`. `Doodle.journalEntryId → JournalEntry.id`. This stays.

The redesign is a UI-only change against this reality. Phase 3 will move writes for self-letters to a new `POST /api/letters/self` against `Letter`; Phase 4 will introduce the friend-letter tlock + Resend transient flow. Neither is required to ship the compose redesign.

---

## User flow

### 1. Entry: "Begin a letter" → ceremonial picker

The user enters compose by tapping a "Begin a letter" CTA from `/letters` (location of the CTA is the existing one; we don't redesign the home page in this spec).

Compose route stays at `/letters/write`. On load, the route renders the **recipient picker interstitial** first — not the compose UI. The picker is a full-bleed quiet scene:

- Centered, single line of prompt copy: *"Who's this letter for?"*
- Below: two equally-sized cards side by side.
  - **Future me** — small icon (e.g., a small clock or a "✦"), label, one-line subtitle ("a note to yourself, later").
  - **A friend** — same visual weight, label, subtitle ("delivered to their email, within 30 days").
- Below the cards: a small "← cancel" link returning to `/letters`.

Behavior:

- Tap "Future me" → interstitial fades out → compose UI fades in. Recipient is locked to `self`. Salutation pre-fills "Dear future me,".
- Tap "A friend" → the friend card **morphs in place** into a single text input asking for the friend's name (placeholder *"who is this for?"*). The Future me card dims. A small "← back" toggle re-expands both cards. On submit (Enter or a small "continue" button) → interstitial fades out → compose UI fades in. Recipient is locked to `friend`. Salutation pre-fills `"Dear ${name},"`.
- Email is **not** asked here. It's a delivery detail; it lives in the seal modal.

Once compose loads, the user cannot change recipient inline. To switch, they tap cancel → start again.

### 2. Compose front (page 1)

A two-sided postcard component, single 3D card. Front shown initially.

**Header band** (top of the card, ~64px tall, fully separated from the writing lines below):

- Top-left: a small italic date label — `"Friday, May 15 · night"` (existing time-of-day-aware format from the current `PostcardFront.tsx`).
- Top-right: the existing Hearth stamp graphic in the corner.
- **No** recipient toggle pills on the front (already chosen in the picker).

**Writing surface** (below the header band, fills the rest of the front):

- A salutation header rendered as the first line *above* the writable area — `"Dear ${recipientLabel},"` in Caveat. **Non-editable**, treated as a pre-printed header so the user never has to type or accidentally delete it.
- Below the salutation: a fixed number of writing lines (target: ~9 lines, tuned in implementation to fit comfortably in the postcard's vertical space at the chosen line-height). The line count is a design constant; we compute it once and freeze it.
- Lined paper effect: same `repeating-linear-gradient` pattern the current front uses.
- TipTap editor mounted inside the lines region. Caveat font, ~19px, ~36px line-height (matches current). No toolbar, no formatting affordances — just plain text.
- Cursor visible, no placeholder text, no "turn it over to write your letter" hint (that hint is gone).

**Footer band** (bottom of the card):

- Bottom-left: small "← cancel" pill (returns to `/letters`, leaves the draft autosaved).
- Bottom-right: "turn over →" button. Calm at rest; glows when the writing surface is full (see *Overflow behavior* below).

### 3. Compose back (page 2)

After tapping "turn over →", the card flips (existing 3D `rotateY` Framer Motion animation). Back layout: split 60/40 left/right.

**Back-left (60%): writing continuation.**

- Same lined paper, same Caveat font, same line-height as the front.
- **No salutation header** on the back — this is mid-letter continuation, not a new section.
- Same fixed line count as the front.
- TipTap editor — a **separate instance** from the front editor. The body is stored as two independent strings (`bodyFront`, `bodyBack`) on the compose component's state. Each is capped independently. They are concatenated only at seal time into a single `text` value (with a paragraph break between them) for storage on `JournalEntry.text`. This matches the "real letter" analogy: writing on the back does not push or pull text from the front. If the user deletes content on the front and creates new space, the back text does not migrate back; the user can choose to retype on the front or leave the new gap.

**Back-right (40%): media slots.** Stacked vertically:

- **Top: music slot.** Reuses the existing song embed component from journal (`Editor.tsx`'s song handling). Same UX: paste a YouTube/Spotify URL, get a small embed card. One song max.
- **Middle: two photo slots.** Reuses the existing `PhotoBlock` component from journal verbatim. Polaroid-style, slight rotation, overlapping. Same upload flow: client compresses → encrypts (E2EE on) → POST `/api/photos` → store `{encryptedRef, encryptedRefIV}` on `EntryPhoto`. Display via the same `usePhotoSrc` hook.
- **Bottom: doodle slot.** Reuses the existing journal doodle canvas component. Smaller canvas footprint than journal (back-right is narrow), but same component, same data model (`Doodle.strokes` JSON, encrypted under master key when E2EE).

**Footer band on the back:**

- Bottom-left: "← turn back" — flips to front.
- Bottom-right: "fold and seal →" button. Disabled if no body text exists (you can't seal an empty letter). For friend letters, disabled is fine even if email isn't set yet — email is collected in the modal.

### 4. Writing flow & overflow behavior

The letter body is one logical string. The compose component paginates it across front and back-left by character-count derived from the line count × chars-per-line. The user **cannot autoflow** — typing on the last line of the current page is hard-stopped.

**On the front, when the user's cursor reaches the last line of the writing surface:**

- The "turn over →" button starts a gentle breathing animation — opacity ~0.7 ↔ 1.0, ~2s cycle.
- No whisper text, no popup. Just the glow.
- If the user presses Enter on the last line, or types past the visible last character, **input is rejected** — no newline created, no characters added.

The user must tap "turn over →" to continue writing on the back-left.

**On the back-left, when the user's cursor reaches the last line:**

- Same hard stop on Enter and over-typing.
- A whisper-soft text appears below the "fold and seal" button: *"your letter is full."*
- Photos / song / doodle remain addable beyond this point. Only text input is capped.

The hard cap is the spec for "letter is full." There is no multi-page expansion.

### 5. Fold and seal — modal

On tap of "fold and seal →" from the back:

- The back-of-letter dims slightly.
- A single modal panel slides up from the bottom, anchored over the dimmed card.
- Modal content varies by recipient type:

**Self letter:**

- Title: *"When should this find you?"*
- Date pills: `1 week` / `1 month` / `6 months` / `1 year` / `custom date`.
- "Custom date" expands an inline date picker. No upper bound.
- Confirm button: *"seal it."*

**Friend letter:**

- Title: *"When should it arrive?"*
- Email input (validated as a well-formed email; placeholder *"their email"*). Pre-filled from `recipientEmail` if a previous attempt set it.
- Date pills: `1 week` / `2 weeks` / `30 days` / `custom`.
- "Custom" expands an inline date picker. **Max 30 days from today**, validated client-side. Server-side check on `/api/entries/[id]/seal` rejects friend-letter unlock dates > 30 days as a defense-in-depth.
- Confirm button: *"seal and send."*

On confirm:

1. Flush autosave (existing `useAutosaveEntry` pattern).
2. POST `/api/entries/[id]/seal` with `{ unlockDate, recipientEmail? }`.
3. On success → modal dismisses → card visually folds (existing fold animation from `PostcardFolded.tsx`, reused) → brief "sealed" beat → navigate to `/letters` (Sent tab).
4. On failure → modal stays, error text appears under the confirm button.

The user can dismiss the modal (back tap / Escape) to return to the back of the letter without sealing — the draft is preserved.

### 6. Drafts in the Sent tab

The existing `/letters` Sent tab today shows only sealed-and-sent letters. Redesign extends it:

- **Top section: Drafts.** Rendered only if drafts exist. Small `"Drafts"` sub-heading. Cards for each unsealed letter (`isSealed: false`) the user owns, sorted by most-recently-edited. Each card shows:
  - Recipient name ("Future me" or the friend's name)
  - Last-edited timestamp ("edited 2 hours ago")
  - A one-line text preview (first ~80 chars of body, decrypted client-side via master key).
  - A small `⋯` menu with a single action: *"discard draft."*
- **Below: Sent.** Existing list, unchanged.
- Tap a draft card → navigates to `/letters/write?id={draftId}` (existing route pattern), recipient is loaded from the row (no interstitial shown when resuming a draft), compose loads with all state populated.

If the user tries to switch recipient on a draft, the spec is: there is no UI to do that. They must discard the draft and start again.

---

## Components

### New components

| Path | Responsibility |
|------|----------------|
| `src/components/letters/compose/RecipientPicker.tsx` | The ceremonial interstitial. Renders the two cards, handles the morph-to-friend-name-input, emits `{recipient: 'self'\|'friend', name?: string}`. |
| `src/components/letters/compose/SealModal.tsx` | The fold-and-seal modal. Recipient-aware. Renders email field only for friend letters. Owns the 30-day cap validation on friend letters. |
| `src/components/letters/sent/DraftsSection.tsx` | The pinned drafts sub-section at the top of the Sent tab. Fetches drafts, renders cards, handles discard. |

### Modified components

| Path | Change |
|------|--------|
| `src/components/letters/compose/ComposeView.tsx` | Reordered phases: `picker → front → back → sealing`. The `folded` phase is folded into the seal modal's success animation. Recipient toggle moved out (now in `RecipientPicker`). Unlock-date pills and email moved out (now in `SealModal`). |
| `src/components/letters/compose/PostcardFront.tsx` | Removed: recipient toggle. Salutation becomes non-editable pre-printed header above the writing surface. Lined paper and date/stamp layout repositioned into a header band with no overlap. "Turn over" button gains the glow animation. |
| `src/components/letters/compose/PostcardBack.tsx` | Split 60/40 into writing-continuation (left) and media stack (right). Existing media handling reused; layout reshuffled. Unlock pills + email removed. |
| `src/components/letters/compose/PostcardFolded.tsx` | Repurposed as the fold animation that plays inside the seal modal's success state. Likely simplified or partially merged into `SealModal`. |
| `src/components/letters/SentView.tsx` (or equivalent) | Renders `DraftsSection` at the top when drafts exist, then existing sent list. |

### Reused without modification

| Component | From | Used in |
|-----------|------|---------|
| `Editor` (TipTap) | journal | both front and back writing surfaces (each instance with character-cap config) |
| `PhotoBlock` | journal | back-right photo slots |
| Song embed component | journal | back-right music slot |
| Doodle canvas | journal | back-right doodle slot |
| `useAutosaveEntry` hook | journal | compose autosave |
| `usePhotoSrc` hook | journal | photo display in compose and draft cards |
| `/api/photos` adapter | journal | photo upload (E2EE encrypted bytes; local blob in dev, Supabase Storage in prod) |

---

## Data model

No schema changes. The redesign writes to `JournalEntry` exactly as it does today:

- **First content change** in compose (any character in the body, a photo upload, a song add, a doodle stroke) triggers `POST /api/entries` (debounced 1500ms via `useAutosaveEntry`).
- New row created with:
  - `entryType: 'letter'` (self) or `'unsent_letter'` (friend)
  - `isSealed: false`
  - `recipientName` = the name captured at the picker (encrypted under master key when E2EE)
  - `recipientEmail` = null until the seal modal sets it (friend only)
  - `unlockDate` = null until seal
  - `text` = body, encrypted under master key
- Subsequent changes: debounced `PUT /api/entries/{id}`.
- On seal: `POST /api/entries/{id}/seal` with `{ unlockDate, recipientEmail? }`. Sets `isSealed: true`. Server validates: friend-letter `unlockDate <= today + 30 days`.

Encryption stays under the existing master-key flow. Photos use the existing `/api/photos` adapter and `EntryPhoto.encryptedRef` pattern.

**Recipient choice persistence**: `entryType` on the row encodes self vs friend. A draft re-opened from the Sent tab reads `entryType` from the row to skip the picker and load directly into compose with that recipient locked.

---

## API changes

### `/api/letters/sent` — extended to include drafts

Today this route returns only sealed letters owned by the user. Redesign extends it (or adds a query param) so the client can fetch both drafts and sent in one call:

```
GET /api/letters/sent
→ {
    drafts: [...],   // isSealed: false rows owned by user
    sent:   [...],   // isSealed: true rows owned by user
  }
```

Alternative (smaller surface change): keep `/api/letters/sent` returning only sent, add a sibling `GET /api/letters/drafts` returning only drafts, and have the Sent tab call both.

**Decision:** Add a sibling `GET /api/letters/drafts` route. Smaller surface change, easier to dual-read against `JournalEntry` (no row joining), and keeps existing `/api/letters/sent` behavior identical for any callers we haven't audited. Uses the same dual-read helper pattern (`findLetterForRead`) so it's Phase-2-consistent.

### `/api/entries/[id]/seal` — add 30-day validation

Modify the existing seal endpoint to add:

```typescript
if (entry.entryType === 'unsent_letter') {
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  if (new Date(body.unlockDate) > maxDate) {
    return NextResponse.json(
      { error: 'Friend letters must arrive within 30 days.' },
      { status: 400 }
    )
  }
}
```

Plus: require `recipientEmail` (well-formed) for `unsent_letter`; require it to be null for `letter`.

### `/api/entries` POST + PUT — no signature change

Existing autosave routes already accept `entryType`, `recipientName`, `text`, photos. No new fields needed for the redesign. The seal modal is the only place that introduces new validation, and it's on the seal route.

---

## State management

**Autosave**: same time-locked autosave the journal uses (`useAutosaveEntry` hook). 1500ms debounce. First content change creates the row; subsequent changes update it. On cancel-without-seal, the row persists as a draft.

**Locking**: drafts are freely editable — text, photos, music, doodle, recipient name can all be modified by re-opening from the Sent tab. Once sealed (`isSealed: true`), the row is fully locked. No append-only loophole.

This differs from journal entries (which have within-day full edit + after-day empty-slot append) because letters are sealed for a reason — once sent, they're committed.

**Body state**: the compose component holds two independent strings — `bodyFront` and `bodyBack` — one per editor instance. Each enforces its own character cap on the client. On every autosave tick, `text` on the row is computed as `bodyFront + "\n\n" + bodyBack` (or `bodyFront` alone if the back is empty). On draft resume, the saved `text` is split back into front/back at the paragraph-break separator if present; otherwise it loads entirely into `bodyFront` and overflow (anything past the front's cap) becomes the initial `bodyBack`.

**Recipient state**: the compose component reads `recipient` from a router query param or React state set by the picker. On draft resume, recipient is read from `entryType` on the loaded row. There is no recipient-changing UI inside compose.

---

## Validation rules summary

| Rule | Where enforced |
|------|----------------|
| Body must be non-empty to seal | Client (disable "fold and seal" button), server (`/api/entries/[id]/seal` returns 400) |
| Body character cap (front + back-left lines × chars-per-line) | Client (reject input past cap), no server enforcement |
| Friend letter: `recipientEmail` is required at seal | Client (modal validates), server (`/api/entries/[id]/seal` returns 400) |
| Friend letter: `recipientEmail` must be well-formed | Client (modal validates), no server email-format validation |
| Friend letter: `unlockDate` ≤ today + 30 days | Client (modal date picker maxes at +30d), server (`/api/entries/[id]/seal` returns 400) |
| Self letter: `recipientEmail` must be null at seal | Client (modal hides field), server (`/api/entries/[id]/seal` returns 400 if present) |
| Self letter: `unlockDate` ≥ today + 1 day | Server (already validated today; preserve) |

---

## Done criteria

A manual smoke test in Docker against `localhost:3112`:

1. From `/letters`, tap "Begin a letter."
2. **Self path:** Picker appears → tap "Future me" → compose loads with "Dear future me," pre-printed → write a paragraph → confirm no overlap with date/stamp/buttons → fill the front line by line → confirm last-line Enter does nothing and the turn-over button glows → tap turn-over → land on back-left → write more → fill the back-left → confirm hard cap + "your letter is full." whisper → add a song, two photos, a doodle on the back-right → tap "fold and seal" → modal appears with date pills only (no email field) → pick "1 month" → confirm → fold animation → land on `/letters` Sent tab → confirm sealed letter appears in Sent list.
3. **Friend path:** Repeat with "A friend" → name input appears → submit → compose loads with "Dear [name]," → write → seal → modal shows email field + date pills with 30-day max → enter invalid email → confirm validation error → fix → pick "2 weeks" → seal → letter appears in Sent.
4. **Custom date max:** Open friend seal modal → tap "custom" → confirm date picker won't allow > 30 days from today.
5. **Draft resume:** Begin a friend letter → write half → cancel → return to `/letters` → switch to Sent tab → confirm draft appears in pinned Drafts section with name, edit time, preview → tap → compose re-opens with all state loaded, recipient still locked to friend → seal → confirm draft disappears from Drafts and appears in Sent.
6. **Draft discard:** Begin a letter → write → cancel → Sent tab → `⋯` on the draft card → "discard draft" → confirm row deleted (server response 200) and draft disappears.
7. **E2EE verify:** Inspect the DB row for a sealed letter — `text` should be ciphertext (not plaintext), `recipientName` should be ciphertext, `EntryPhoto.encryptedRef` should be set, `EntryPhoto.url` should be null. (Spot-check via `psql` inside the container.)
8. **No scrollbars:** On both front and back, with maximum text content, neither page introduces a scrollbar. The page is either fillable to the hard cap or empty — never scrollable.
9. **Type-check passes:** `docker compose exec app npx tsc --noEmit` runs clean.

---

## Open items / things to verify when planning implementation

These don't block the spec but will need attention when expanding into an implementation plan:

- **Exact line count for front/back-left.** Needs visual tuning in dev. Start with `9 lines × ~36 chars/line` per page → ~324 chars per page → ~648 chars total. Adjust during implementation by eye.
- **Draft resume split rule.** When loading a saved draft, the body splits on the paragraph-break separator the seal/autosave wrote between front and back. If a legacy row (pre-redesign) has body text with no separator, the loader puts everything into `bodyFront` up to its cap and the overflow into `bodyBack`. Document this so implementation handles both cases.
- **Whether the song embed component on journal supports being constrained to a small slot.** If not, may need a sized wrapper, but no internal changes to the component.
- **`/api/letters/drafts` route file location.** Mirror existing pattern (`src/app/api/letters/drafts/route.ts`). Confirm dual-read helper handles `isSealed: false` rows (it should — Phase 2 dual-read doesn't filter on `isSealed`).
- **Seal modal animation.** The folded-card visual exists in `PostcardFolded.tsx` today. Decide whether the seal modal owns the fold animation directly or composes with the existing component.
- **Cancel-without-seal flow when the row is empty.** If user opens compose and immediately cancels with nothing typed, no autosave has fired yet → no row exists → no draft to clean up. Confirm this is the existing autosave behavior (the `useAutosaveEntry` hook only fires on first change).
- **Edge case: user starts a draft, then days pass, then resumes.** The autosave row's `createdAt` is the original creation date. Date stamp on the front of the letter should display the **resume session's** date (today), not the original. Confirm via UX call — current code uses `createdAt`, which may want to change. Mark this as a design knob to decide during implementation.

---

## What this spec does NOT cover

- The Letters home page layout (the `letters | sent | lights` tab nav and the layout of each tab beyond the new Drafts section).
- The desk/drawer metaphor home page redesign — deferred.
- Lights redesign (premium replies, paid-tier gating, anonymous notes) — deferred to its own spec.
- Phase 3/4 backend migration of letter writes onto the `Letter` model — independent work, will land in its own spec.
- The `/letter/[token]` public friend-letter reading page — that's Phase 4 work.
- Account-recovery / forgot-passphrase flows — already shipped in Phase 1.
