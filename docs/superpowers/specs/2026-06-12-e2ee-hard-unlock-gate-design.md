# E2EE Hard Unlock Gate — Design Spec

**Date:** 2026-06-12
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem

Cross-device overwrite bug: write an entry on desktop, open it on another device
(notably mobile) while the journal is locked, and the real content gets replaced
by the placeholder string `[Encrypted — unlock to view]`.

### Root cause

The desktop editor `BookSpread` fetches `/api/entries` on mount **regardless of
unlock state** (`src/components/desk/BookSpread.tsx:170`). When the master key is
not loaded, `decryptEntryFromServer()` (`src/hooks/useE2EE.ts:32-37`) returns the
entry with `text: '[Encrypted — unlock to view]'`. That placeholder hydrates the
editor, and autosave can round-trip it back to the server as if it were real
content, corrupting the row.

Today this is patched with three piecemeal guards:
- Desktop editor-blanking guard (`BookSpread.tsx:215-222`)
- Mobile editor-blanking guard (`MobileJournalEntry.tsx:147-160`)
- Autosave refuse-to-save-placeholder guard (`useAutosaveEntry.ts:107-116`)

These are fragile (string-matching on the placeholder; any new fetch path or
editor reintroduces the risk). The real fix removes the precondition: never
mount E2EE-content UI, and never fetch any E2EE content, until the journal is
unlocked.

## Goal

A single hard gate: on an authenticated app surface, if E2EE is enabled and the
journal is not unlocked, render a lock screen **instead of** the app, on every
device. No entry/letter/scrapbook/photo fetch happens before unlock. The
overwrite bug becomes structurally impossible (no placeholder ever enters an
editor), not merely guarded against.

## Non-goals

- Repairing entries already corrupted by the old bug. The gate prevents future
  corruption only; it cannot un-rot existing data. A separate one-time data
  check/repair may follow but is out of scope here.
- Changing the encryption scheme, key derivation, or storage tier.
- Touching the `/letter/[token]` recipient-view decryption path (it uses an
  answer-derived `letterKey`, not the journal master key, and is already
  excluded from E2EE modals via `allowsE2EEModals`).

## Architecture

### The gate (single decision point in `E2EEProvider`)

`E2EEProvider` (`src/components/e2ee/E2EEProvider.tsx`) wraps the whole app in
`src/app/layout.tsx`. It already knows `user`, the E2EE store state, and whether
the current route is an authed app surface via `allowsE2EEModals(pathname)`
(`src/lib/auth/public-routes.ts`).

Compute the gate state on every render:

```
onAppSurface = !!user && allowsE2EEModals(pathname)
pending      = onAppSurface && !initialized                       // brief init window
locked       = onAppSurface && initialized && isEnabled && !isUnlocked
```

Render decision:
- `pending || locked` → render `<LockGate pending={pending} />` **instead of**
  `{children}`.
- otherwise → render `{children}` (today's behavior).

Because `{children}` never mounts while `pending || locked`, the editors
(`BookSpread`, `MobileJournalEntry`) and every other E2EE-content fetcher simply
do not exist in the tree → **zero E2EE fetches before unlock**, identical on
desktop and mobile (both editors live inside `{children}`).

Consequences:
- New-load locked → splash (`pending`) then lock screen (`locked`).
- "Lock diary" mid-session clears the master key → `isUnlocked` flips false →
  `locked` becomes true → `LockGate` reappears automatically. No reliance on the
  `showUnlockModal` flag for app surfaces.
- E2EE-disabled users: `isEnabled` is false → never `locked`; after the short
  `pending` window they get `{children}` and the normal `SetupModal` path. They
  are unaffected.
- Public / pre-auth routes (`allowsE2EEModals` false): `onAppSurface` false →
  never gated. Login, landing, pricing, onboarding, letter view unaffected.

### Pure helper (testable)

Extract the decision into a pure function so it can be unit-tested without
React:

```ts
// src/lib/e2ee/gate.ts
export type E2EEGateState = 'pending' | 'locked' | 'open'

export function e2eeGateState(input: {
  hasUser: boolean
  allowsModals: boolean   // = allowsE2EEModals(pathname)
  initialized: boolean
  isEnabled: boolean
  isUnlocked: boolean
}): E2EEGateState
```

Rules:
- not on app surface (`!hasUser || !allowsModals`) → `'open'`
- on app surface, `!initialized` → `'pending'`
- on app surface, initialized, `isEnabled && !isUnlocked` → `'locked'`
- otherwise → `'open'`

`E2EEProvider` calls this and branches on the result.

### `LockGate` component (new)

`src/components/e2ee/LockGate.tsx`, client component.

- Full-bleed themed background: body bg already follows the theme via
  `LayoutContent`; render `<Background />` for theme particles so the lock screen
  matches the active theme. **No hardcoded `bg-[#...]` wrapper** (per CLAUDE.md
  theme rules). All text/border colors read from `useThemeStore` and applied via
  inline style.
- `pending` prop true → neutral splash: centered lock glyph + "Unlocking…", no
  input. Covers the sub-second `/api/e2ee/keys` init.
- `pending` false (locked) → the unlock card:
  - daily-key password input (with show/hide toggle),
  - inline error on wrong key,
  - "Unlock" button,
  - "Forgot your daily key? Use recovery key" → sets `showRecoveryModal` (existing
    flow),
  - **"Log out"** text button → `useAuthStore().logout()`.

The two escape hatches (recovery, logout) are the only actions available while
locked; settings/billing are intentionally not reachable.

### Shared `UnlockForm` (refactor to avoid duplication)

The daily-key form currently lives inline in `UnlockModal.tsx` (input, derive
wrapping key, unwrap master key, `storeMasterKey`, error handling). Extract it:

- `src/components/e2ee/UnlockForm.tsx` — the form + unlock logic, parameterized
  by optional callbacks/affordances (e.g. whether to show a logout button, what
  to do after successful unlock).
- `LockGate` renders `<UnlockForm showLogout />`.
- `UnlockModal` is refactored to render `<UnlockForm />` inside its modal chrome,
  so the residual modal (used on the non-gated `/letter/.../save` flow and any
  future non-gated unlock) shares one implementation.

### Modal rendering in `E2EEProvider`

`E2EEProvider` currently renders `{children}` followed by `SetupModal`,
`UnlockModal`, `RecoveryModal`, `BackfillToast` as siblings.

New rendering:
- When `gateState === 'pending' || 'locked'`: render `<LockGate />` +
  `<RecoveryModal />` (recovery is launched from the gate). Do **not** render
  `UnlockModal` here (it would double up with `LockGate`).
- When `gateState === 'open'`: render `{children}` + all modals exactly as today
  (`SetupModal`, `UnlockModal`, `RecoveryModal`, `BackfillToast`).

### Defense-in-depth (kept, not removed)

- `useAutosaveEntry.ts:107-116` placeholder-refusal guard: kept (cheap safety).
- `useAutosaveEntry.ts:148-154` `!isE2EEReady` bail: kept.
- The editor-blanking guards in `BookSpread`/`MobileJournalEntry` become
  unreachable (editors don't mount while locked) but are left in place —
  removing them is extra risk for no benefit.

## Data flow (locked → unlocked, app surface)

1. App mounts → `E2EEProvider` → `gateState === 'pending'` (not yet initialized)
   → `LockGate pending` splash. `{children}` not mounted → no entry fetch.
2. `initialize()` fetches `/api/e2ee/keys`. E2EE enabled, no local key →
   `initialized` true, `isUnlocked` false → `gateState === 'locked'` →
   `LockGate` unlock card.
3. User enters daily key → `UnlockForm` derives wrapping key, unwraps master key,
   `storeMasterKey()` sets `isUnlocked` true → `gateState === 'open'`.
4. `{children}` mounts for the first time → `BookSpread`/`MobileJournalEntry`
   fetch `/api/entries` **with the master key already loaded** → entries decrypt
   to real content. No placeholder ever exists.

## Error handling

- Wrong daily key → inline error in `UnlockForm`, stay locked.
- `initialize()` failure (network) → `initialized` stays false → `pending`
  splash persists (no app data leaked, no fetch). Acceptable; matches today's
  failure posture.
- Recovery → existing `RecoveryModal` flow, unchanged.

## Testing

- **Unit (Vitest):** `e2eeGateState()` truth table — all combinations of
  `hasUser`, `allowsModals`, `initialized`, `isEnabled`, `isUnlocked` map to the
  expected `'pending' | 'locked' | 'open'`. This is the critical-path pure logic.
- **Manual:** with the `.dev-creds.local` test account, on the active theme + one
  contrasting theme:
  - Fresh load while locked → splash → lock screen; confirm DevTools Network
    shows **no** `/api/entries` (or letters/scrapbook/photos) request until after
    unlock.
  - Unlock → entries render correctly.
  - Write on desktop, open on mobile viewport while locked → unlock → content
    intact (no `[Encrypted…]` overwrite).
  - "Lock diary" mid-session → gate reappears.
  - Logout button and recovery link both work from the lock screen.
  - E2EE-disabled / public routes unaffected.

## Files

New:
- `src/lib/e2ee/gate.ts` — `e2eeGateState()` pure helper.
- `src/lib/e2ee/__tests__/gate.test.ts` (or under `src/__tests__/`) — unit tests.
- `src/components/e2ee/LockGate.tsx` — lock screen.
- `src/components/e2ee/UnlockForm.tsx` — shared daily-key form.

Modified:
- `src/components/e2ee/E2EEProvider.tsx` — compute gate state, branch render.
- `src/components/e2ee/UnlockModal.tsx` — consume shared `UnlockForm`.

Unchanged on purpose (defense-in-depth):
- `src/hooks/useAutosaveEntry.ts`, `BookSpread.tsx`, `MobileJournalEntry.tsx`
  guards left as-is.
