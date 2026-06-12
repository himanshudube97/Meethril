# Try Mode — local, no-login, no-E2EE trial sandbox

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Himanshu

## Why

First-time E2EE is scary: the master-key flow asks people to commit before they
know if they like the product. Try Mode lets anyone *write and feel the magic*
with zero friction — no account, no key, no server. It is a taste, not real
data. Conversion happens once they're hooked.

This is the **first of three related features** (the other two — mobile↔desktop
pagination parity, and general mobile polish/desktop-gate decision — get their
own spec/plan/build cycles later). Try Mode is built first because it is the
most self-contained and the highest conversion value.

## Decisions (locked)

| Question | Decision |
|---|---|
| Storage | **Local-only, no login.** Entries/letters live in `localStorage`, never hit the server, no account created. Plaintext by nature (no E2EE). |
| Scope of screens | Everything responsive **except scrapbook**: write, letters/postbox, memory, shelf. |
| Letters | **Demo the flow with fake delivery.** Write → seal → drop in postbox (full animation), then a "fast-forward" / instant-reveal so the user sees the payoff immediately. No email, no cron, no week-long wait. |
| Entry limit | **5 entries → soft wall + CTA.** Gentle overlay ("keep your diary forever") + sign-up CTA. Existing entries stay readable. |
| Migration on signup | **Discard — fresh start.** Local trial data stays local/ephemeral. After signup the user starts clean (with real E2EE). |
| Reuse architecture | **Approach C — try-mode flag + local adapter, reuse the real scenes.** Core data hooks get one `isTryMode` branch; scenes render unchanged. |
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
                  └─ data hooks detect try mode:
                       useEntries / useAutosaveEntry → useTrialStore (localStorage)
                       useE2EE                       → { ready:true, identity crypto }
```

### New units

1. **`TryModeProvider` + `useTryMode()`** (`src/store/try-mode.tsx` or context)
   - Provides `{ isTryMode: boolean }`. True only inside `/try/*`.
   - Single source of truth the data hooks read. False everywhere else, so the
     real app is unaffected.

2. **`useTrialStore`** (Zustand, persisted to `localStorage`) — `src/store/trial.ts`
   - Holds `entries[]`, `letters[]`, `entryCount`.
   - Entry/letter shapes **mirror the `/api/entries` and letters response shapes**
     so the scenes need no changes (same fields the hooks expect: id, text/html,
     mood, entryType, createdAt, photos refs, doodle, song, letter fields…).
   - CRUD actions: `createEntry`, `updateEntry`, `getEntries`, `createLetter`,
     `revealLetter` (instant), reset.
   - Photos in try mode: store compressed image as a `data:`/blob in the local
     record (no `/api/photos` round-trip; no encryption). The `usePhotoSrc`
     legacy `data:` passthrough already renders these. **Do not** introduce new
     inline `data:` URLs in the *real* app — this is trial-only.

3. **`/try` routes** (`src/app/try/...`)
   - Public (added to `middleware.ts` public paths + `DesktopGate` allow-list).
   - Wrap children in `TryModeProvider`. Bypass `AuthGate`/`E2EEProvider` unlock
     modal (no key needed). Reuse `LayoutContent` chrome rules: add `/try*`
     cases so the right background/theme renders and nav is suppressed where
     appropriate (theme system rules in CLAUDE.md still apply — read from
     `useThemeStore`, never hardcode bg).

### Modified shared files (the only touch-points in real-app code)

- **`useE2EE`** (`src/hooks/useE2EE.ts`): if `isTryMode`, return
  `isE2EEReady = true`; `encryptEntryData` = identity (plaintext);
  `decryptEntryFromServer` = identity (no placeholder). This is what lets scenes
  hydrate without a master key.
- **`useEntries`** (`src/hooks/useEntries.ts`): if `isTryMode`, read from
  `useTrialStore` instead of fetching `/api/entries` (cursor pagination becomes
  trivial over a ≤5 array).
- **`useAutosaveEntry`** (`src/hooks/useAutosaveEntry.ts`): if `isTryMode`,
  create/update against `useTrialStore` instead of POST/PUT. The append-only
  entry-lock rules can be relaxed in try mode (it's a sandbox) OR mirrored — see
  open detail below.
- **Letters hook / API caller**: if `isTryMode`, write to `useTrialStore` and
  expose `revealLetter()` for instant fast-forward.

Each branch is guarded by `isTryMode`, which is `false` outside `/try`, so the
real flows are byte-for-byte unchanged at runtime.

## Data flow

**Begin writing:** `/try/write` → DeskScene picks BookSpread (desktop) or mobile
editor (phone) → user types → `useAutosaveEntry` (try branch) debounce-writes to
`useTrialStore` → persisted to localStorage. `useEntries` (try branch) reflects
it back. On the 6th attempt, soft wall overlay.

**Get the feel (tour):** `/try/tour` steps through scenes with next-buttons;
each step mounts the real scene against trial data; letter step shows
write→seal→postbox then a fast-forward button → `revealLetter()` → reveal modal.

**Soft wall:** when `entryCount >= 5`, render overlay with sign-up CTA → `/login`
(or `/pricing`). Existing local entries remain readable behind it.

**Signup:** CTA leaves `/try`; local trial data is **not** migrated. Optionally
clear `useTrialStore` on successful auth (fresh start).

## Responsiveness

Reuses the Bridge split — nothing new. Desktop ≥1400 → full BookSpread; tablet →
scaled BookSpread; <1024 → mobile components. Letters/memory/shelf use their
existing desktop vs mobile render switches. The two entry buttons are a simple
responsive flex layout, identical content both sizes.

## Error handling

- localStorage unavailable / quota exceeded (e.g. private mode, big photos):
  catch, show a gentle "your browser is blocking local storage — sign up to save
  for real" message; don't crash the scene.
- Corrupt/old trial data in localStorage: version the store; on schema mismatch,
  reset trial data silently.
- No network calls in try mode → no network error surface by design.

## Testing

Per project convention (skip formal unit tests by default), verify manually in
dev: enter `/try`, both buttons, write 5 entries + hit wall, run the tour incl.
letter fast-forward reveal, check phone + desktop widths, confirm the **real**
app (logged-in `/write`) still encrypts and behaves identically (regression:
`isTryMode` false path unchanged). A couple of targeted tests on the trial store
CRUD + the `useE2EE` try-branch identity behavior are optional but cheap.

## Out of scope (this feature)

- Scrapbook in trial.
- Real letter email/delivery in trial.
- Migrating trial entries into a real account.
- The desktop-gate removal decision and general mobile polish (feature *a*).
- Mobile↔desktop pagination parity engine (feature *b*) — Try Mode consumes the
  existing engine as-is via the Bridge.

## Open details to settle during planning

1. **Entry-lock in try mode:** relax append-only (full edit of the ≤5 entries,
   simplest) vs mirror the calendar-day lock. Recommend **relax** — it's a
   sandbox and lock rules would confuse a first-timer.
2. **Route shape:** `/try/write` + `/try/tour` sub-routes vs one `/try` shell
   with internal view state. Sub-routes are cleaner for LayoutContent chrome
   branching; confirm in plan.
3. **Theme in try mode:** default theme vs let trial users switch themes
   (showcases the theme system — possible upsell). Recommend default + maybe a
   one-tap theme peek; decide in plan.
