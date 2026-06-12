# Try Mode — local, no-login, no-E2EE trial sandbox

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Himanshu

## Why

First-time E2EE is scary: the master-key flow asks people to commit before they
know if they like the product. Try Mode lets anyone *write and feel the magic*
with zero friction — no account, no key, no server. It is a taste, not real
data. Conversion happens once they're hooked.

This is **one of three related features.** Build order (revised after design
grilling): **(b) mobile↔desktop pagination-parity engine FIRST**, then **(c)
this Try Mode**, then **(a) general mobile polish + desktop-gate decision**. Try
Mode depends on (b): on phone, "Begin writing" must show the real two-page book,
which only exists once the pagination-parity engine ships. Building (c) before
(b) would showcase the *least* magical phone editor. So this spec is approved but
**parked behind feature (b)**.

## Decisions (locked)

| Question | Decision |
|---|---|
| Storage | **Local-only, no login.** Metadata in **`sessionStorage`** (cleared on tab close — matches the master-key pattern, keeps plaintext off a shared machine). Photo/doodle **bytes in IndexedDB** (localStorage can't hold image blobs — quota). Never hit the server, no account. Plaintext by nature (no E2EE). |
| Scope of screens | Everything responsive **except scrapbook**: write, letters/postbox, memory, shelf. |
| Letters | **Demo the flow with fake delivery, self-letters only.** Write → seal → drop in postbox (full animation), then a "fast-forward" / instant-reveal so the user sees the payoff immediately. No email, no cron, no week-long wait. Friend letters (recipientEmail + Resend) are **disabled in trial** — they can't send without a server. |
| Entry limit | **5 entries → soft wall + CTA.** Gentle overlay ("keep your diary forever") + sign-up CTA. Existing entries stay readable. |
| 1-entry-per-day | **Each trial entry is dated to a different day** (today, yesterday, …). 5 entries = 5 days, so the real "1 entry per calendar day" rule is respected (no contradiction the user has to unlearn), and the user's own writing naturally fills memory/shelf with multi-day history. |
| Migration on signup | **Discard — fresh start.** Local trial data stays local/ephemeral. After signup the user starts clean (with real E2EE). |
| Reuse architecture | **Approach C — try-mode flag + local adapter, reuse the real scenes.** Data hooks get one `isTryMode` branch — **except `useE2EE.ts`, which is NEVER modified** (see Crypto isolation below). Scenes render unchanged. |
| Crypto isolation | **Hard isolation.** Trial's no-op (identity) crypto lives in a separate `useTrialCrypto`. `useE2EE.ts` is never touched. Scenes read crypto via a source-selector that returns trial-crypto only under `/try`. The real encryption path *physically cannot* run a plaintext-to-server leak. |
| Demo seed | **Pre-written demo entries** (a few beautiful past-dated entries) so memory constellation + shelf look alive in the tour even before the user writes much. The user's own dated entries (see 1/day above) add to them. |
| Entry buttons | Two buttons on `/try`, identical on desktop + phone: **"Begin writing"** = drop straight into the diary write scene (free play, 5-entry limit). **"Get the feel"** = guided linear tour through the screens (write → letter → postbox → memory → shelf) with next-buttons. No persistent tab nav — the tour IS how you reach the other screens. |
| Mobile model (shared across all 3 features) | **Bridge** — keep the separate mobile components, share the pagination engine with desktop. Try Mode reuses this split for free: `BookSpread` on desktop, mobile components on phone, both wired to the local adapter. |
| Desktop gate | **Deferred.** Not touched in this feature. `/try` is simply added to the gate's allow-list so phones can reach it. |

## Architecture

Approach C: do **not** fork the UI. Render the real scene components, swap only
the data layer underneath them.

```
/try  (public route — middleware allow-list; bypasses AuthGate + DesktopGate)
 │
 ├─ /try               entry screen: "Begin writing" · "Get the feel"
 ├─ /try/write         diary write scene (free play)
 └─ /try/tour          guided linear tour (write → letter → postbox → memory → shelf)
        │
        └─ <TryModeProvider>          isTryMode = true
             └─ real scenes (DeskScene / LettersScene / memory / shelf renderers)
                  ├─ useEntries / useAutosaveEntry → (try branch) useTrialStore
                  ├─ crypto via useCryptoSource()   → useTrialCrypto (identity)
                  │     useE2EE.ts is NEVER touched ───────┘
                  └─ incidental APIs (song/photo/stats) neutralized by trial guard
```

### New units

1. **`TryModeProvider` + `useTryMode()`** (`src/store/try-mode.tsx` or context)
   - Provides `{ isTryMode: boolean }`. True only inside `/try/*`.
   - Single source of truth the data hooks read. False everywhere else, so the
     real app is unaffected.

2. **`useTrialStore`** (Zustand) — `src/store/trial.ts`
   - Metadata (`entries[]`, `letters[]`, `entryCount`, schema `version`) persisted
     to **`sessionStorage`** (cleared on tab close).
   - Photo/doodle **bytes in IndexedDB** (a small `trial-blobs` store). The trial
     record holds an opaque blob key; a trial photo-src hook reads IndexedDB →
     blob URL. localStorage/sessionStorage never hold image bytes.
   - Entry/letter shapes **mirror the `/api/entries` and letters response shapes**
     so the scenes need no changes (id, text/html, mood, entryType, createdAt,
     photo refs, doodle, song, letter fields…).
   - **Each created entry is dated to a distinct past day** (today, −1d, −2d…) so
     the 1-entry-per-day rule holds and memory/shelf gain real multi-day history.
   - CRUD: `createEntry`, `updateEntry`, `getEntries`, `createLetter`,
     `revealLetter` (instant), `reset`.
   - Seeded at init with a few **pre-written demo entries** (past-dated) so
     memory/shelf look alive in the tour.

3. **`useTrialCrypto`** (`src/hooks/useTrialCrypto.ts`) + **`useCryptoSource()`**
   - `useTrialCrypto` returns identity crypto: `isE2EEReady=true`,
     `encryptEntryData`/`decryptEntryFromServer` pass data through unchanged.
   - `useCryptoSource()` is the **only** new indirection scenes call for crypto:
     `isTryMode ? useTrialCrypto() : useE2EE()`. **`useE2EE.ts` is never edited.**
     The real encryption path therefore cannot run a no-op leak under any flag
     drift. (This is the hard-isolation guarantee.)

4. **`/try` routes** (`src/app/try/...`) — **sub-routes, each fully unmounting**
   - `/try` (entry: two buttons), `/try/write` (free play), `/try/tour` (guided).
     Sub-routes (not one nested shell) so each `fixed inset-0` scene unmounts the
     previous — no z-index/stacking chaos.
   - Public (added to `middleware.ts` public paths + `DesktopGate` allow-list).
   - Wrap children in `TryModeProvider`. Bypass `AuthGate`/`E2EEProvider` unlock
     modal (no key needed). Add `/try*` cases to `LayoutContent` chrome branching;
     theme rules in CLAUDE.md still apply (read `useThemeStore`, never hardcode bg).

### Modified shared files (the touch-points in real-app code)

- **`useEntries`** (`src/hooks/useEntries.ts`): if `isTryMode`, read from
  `useTrialStore` instead of fetching `/api/entries` (cursor pagination is trivial
  over a small array).
- **`useAutosaveEntry`** (`src/hooks/useAutosaveEntry.ts`): if `isTryMode`,
  create/update against `useTrialStore` instead of POST/PUT. Append-only
  entry-lock is **relaxed** in trial (sandbox; lock rules would confuse a
  first-timer). Crypto comes via `useCryptoSource()`, not `useE2EE` directly.
- **Letters hook / API caller**: if `isTryMode`, write to `useTrialStore` and
  expose `revealLetter()` for instant fast-forward. Friend-letter path disabled.
- **Incidental API callers** (song-search, `PhotoBlock` → `/api/photos`, stats):
  each checks `isTryMode` and routes to a local/no-op path (song search may stay —
  it's an anonymous external lookup — decide in plan; photos go to IndexedDB).
- **`useE2EE.ts` is explicitly NOT in this list** — hard isolation.

Every branch is guarded by `isTryMode`, which is `false` outside `/try`, so the
real flows are byte-for-byte unchanged at runtime.

## Data flow

**Begin writing:** `/try/write` → DeskScene picks BookSpread (desktop) or mobile
editor (phone) → user types → `useAutosaveEntry` (try branch) debounce-writes to
`useTrialStore` (sessionStorage; blobs → IndexedDB). New entries are dated to
successive past days. `useEntries` (try branch) reflects them back. On the 6th
entry, soft wall overlay.

**Get the feel (tour):** `/try/tour` steps through scenes with next-buttons;
each step is its own mounted scene against trial data (seeded demo entries make
memory/shelf look alive); letter step shows write→seal→postbox then a
fast-forward button → `revealLetter()` → reveal modal.

**Soft wall:** when `entryCount >= 5`, render overlay with sign-up CTA → `/login`
(or `/pricing`). Existing trial entries remain readable behind it.

**Signup:** CTA leaves `/try`; trial data is **not** migrated. Clear
`useTrialStore` + IndexedDB blobs on successful auth (fresh start). Tab close also
clears sessionStorage metadata.

## Responsiveness

Reuses the Bridge split — nothing new. Desktop ≥1400 → full BookSpread; tablet →
scaled BookSpread; <1024 → mobile components. Letters/memory/shelf use their
existing desktop vs mobile render switches. The two entry buttons are a simple
responsive flex layout, identical content both sizes.

## Error handling

- sessionStorage/IndexedDB unavailable or quota exceeded (private mode, big
  photos): catch, show a gentle "your browser is blocking storage — sign up to
  save for real" message; don't crash the scene.
- Corrupt/old trial data: `version` the store; on schema mismatch, reset silently.
- No journal/letter network calls in try mode → no network error surface by
  design. (Any allowed external lookup like song search fails gracefully.)

## Testing

Per project convention (skip formal unit tests by default), verify manually in
dev: enter `/try`, both buttons, write 5 entries + hit wall, run the tour incl.
letter fast-forward reveal, check phone + desktop widths, confirm the **real**
app (logged-in `/write`) still encrypts and behaves identically (regression:
`isTryMode` false path unchanged — and `useE2EE.ts` is untouched, so this is
guaranteed by construction). A couple of targeted tests on the trial store CRUD +
the `useTrialCrypto` identity behavior are optional but cheap.

## Out of scope (this feature)

- Scrapbook in trial.
- Real letter email/delivery in trial.
- Migrating trial entries into a real account.
- The desktop-gate removal decision and general mobile polish (feature *a*).
- Mobile↔desktop pagination parity engine (feature *b*) — Try Mode **depends on**
  it (phone book-feel) and is built *after* it. Trial consumes the engine via the
  Bridge once it exists.
- Friend letters in trial (self-letters only).

## Resolved during grilling (2026-06-12)

- **Build order** → (b) pagination → (c) trial → (a) polish. Trial parked behind (b).
- **Crypto** → hard isolation; `useE2EE.ts` never touched.
- **Photos** → IndexedDB (not localStorage).
- **Trial data lifetime** → sessionStorage metadata, clear on exit.
- **1-entry-per-day** → date trial entries to distinct days.
- **Memory/shelf emptiness** → seed pre-written demo entries.
- **Entry-lock** → relaxed in trial.
- **Route shape** → `/try/write` + `/try/tour` sub-routes (each unmounts).
- **Friend letters** → disabled in trial.

## Open details to settle during planning

1. **Theme in try mode:** default theme vs let trial users switch themes
   (showcases the theme system — possible upsell). Recommend default + maybe a
   one-tap theme peek; decide in plan.
2. **Song search in trial:** keep the anonymous external iTunes lookup, or stub
   it. Leaning keep (it's harmless, anonymous, and adds life). Confirm in plan.
3. **Analytics:** whether to fire PostHog funnel events (try-start, entry-written,
   wall-hit, signup-click). Likely yes — decide in plan.
