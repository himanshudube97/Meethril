# Handoff — `/try` real app shell

**Date:** 2026-06-20
**Branch:** `main` (20 commits `ad124b0..b7183e6`, **local only — NOT pushed**)
**Status:** Feature complete + reviewed + browser-verified. Ready to push when you choose.

## What this is
`/try` is now the **real Meethril app** running on dummy data — anonymous, no backend,
wiped on tab close. Same scenes/UI as the logged-in app (journal, letters, scrapbook,
memory, shelf, themes), reached via a `window.fetch` interceptor that routes `/api/*`
to a sessionStorage trial store. Replaces the old tour/custom-demo UI.

Design + plan:
- Spec: `docs/superpowers/specs/2026-06-16-try-real-app-shell-design.md`
- Plan: `docs/superpowers/plans/2026-06-16-try-real-app-shell.md`

## Locked product decisions
- Server features faked locally + instant (no email, no week-wait, no checkout).
- Login = fresh start; trial data is sessionStorage, discarded on tab close / leaving `/try`.
- Straight to desktop (no onboarding). Nav shows Write/Scrapbook/Letters/Shelf/Memory +
  theme gear + a **"Sign up"** pill (no profile page).
- Per-feature cap: **5 each** (journal / letters / scrapbook). Cap → `TryLimitModal`.
- **No seed** — empty states until the visitor writes. Memory **ungated** under `/try`
  (threshold 1, vs real 14/20).
- Public brand is **Meethril** (Hearth = dev codename).

## Architecture (how it works)
- `src/app/try/layout.tsx` mounts `TryModeProvider` (boots trial store, installs fetch
  interceptor, primes a throwaway E2EE key). `/try` → redirect `/try/write`.
- Mirror pages re-export the **real** scenes: `/try/{write,letters,letters/write,
  scrapbook,scrapbook/[id],memory,shelf}`.
- `src/lib/trial/router.ts` — pure `/api/*` → response mapper (reads the snapshot).
- `src/lib/trial/intercept.ts` — applies writes to the store + enforces caps (403 + signupPrompt).
- `src/store/trial.ts` — sessionStorage store (entries/letters/scrapbooks, per-feature
  counts, `signupPrompt`, persist v2 + migrate).
- `src/lib/trial/crypto.ts` — throwaway AES key; **resets trial data when no key is found**
  (first visit or after leaving `/try`) so stale-key content can't show "[Decryption failed]".
- Shared scene/nav files are **gated** to `/try` via `pathname.startsWith('/try')` /
  `useTryMode()` and fall back to the exact real path off-`/try`:
  `Navigation`, `LayoutContent`, `useMemories`, `ScrapbookListingView`, `scrapbook/[id]/page`,
  `InboxView`, `ComposeView`, `MobileLetterCompose`, `MobileLettersView`, `ShelfScene`,
  `ScrapbookDesktopOnly`.

## Real-app safety (verified)
Audited every shared file: real-route behavior is identical (changes gated to `/try`).
Trial-only code (`lib/trial/*`, `store/trial`, `components/try/*`, `crypto.ts`) loads only
via `TryModeProvider`; `useTryMode()` defaults `false` on real routes. Live-checked logged in:
`/write`, `/scrapbook`, `/memory` (real 14/20 gate), nav avatar→/me, `/letters` "begin" →
real `/letters/write`, `/shelf` month-click → real `/shelf?year=…`. **No regressions.**
One intentional change: mobile `/scrapbook` now runs its hooks before the desktop-only
return (fixes a latent conditional-hooks crash; adds one harmless mobile fetch).

## Bugs found + fixed during review (all verified in browser)
1. Letter inbox/arrived IV keying → trial self-letters revealed blank. (alias content→text IV)
2. `/api/letters/mine` missing `text` → self-letter dropped from memory.
3. Desktop compose couldn't seal (draft lifecycle unmocked) → mocked POST/PUT/GET `/drafts`.
4. Scrapbook open/create/back + letter-compose nav + shelf query-writes leaked to real
   routes → all path-derived now (no leaks remain; re-swept).
5. Memory "[Decryption failed]" after leaving+returning `/try` → key cleared while entries
   persisted; fixed by reset-on-no-key in `primeTrialCrypto`.
6. Letter seal "Draft has not been saved" despite text → **dev-StrictMode `mountedRef`
   stuck false** in `useAutosaveLetterDraft` dropped the draft id; set `true` on mount +
   `flush()` returns the id from the ref. (Also hardened real-app compose.)
7. Journal not on shelf → trial `/api/entries/stats` returned `years: []`; now aggregates
   `years→months→entryCount`.

## Open / unresolved
- **"Memory shows 5 identical from 1 entry"** — could NOT reproduce. Store→memory is
  faithful (1 entry → 1 memory on both garden + firelight renderers; store had exactly 1).
  Hypothesis: the session had ~5 entries (trial allows 5; `createEntry` day-steps each to a
  prior date) with similar text. **Ask the user to retest with exactly one entry**; if it
  still shows 5, investigate `DesktopMemoryScene` / the day-stepping in `store/trial.ts createEntry`.
- **Login page** shows email/password locally because `USE_DEV_AUTH=true`. Production is
  Google-only already (`PASSWORD_LOGIN_ENABLED = false` in `src/app/login/page.tsx`). Not a bug.
- Quality nits left (not bugs): trial count fields are derivable; `TryLimitModal` overlaps the
  billing `LimitReachedModal`; the `/try` `LayoutContent` branch clones the authed layout.
- **Not pushed** — 20 local commits on `main`.

## Gates / how to verify
- Tests (Docker): `docker compose exec app npx vitest run` → 132 pass.
- Typecheck: `docker compose exec app npx tsc --noEmit` → clean.
- Lint is NOT a gate (pre-existing ~130-error backlog; per-file hook will flag pre-existing
  `set-state-in-effect` / `refs-during-render` in files you touch — only fix your own lines).
- Manual: open `/try` **anonymous** (logged-in → bounces to `/me`). To go anonymous in the
  dev browser: `fetch('/api/auth/logout',{method:'POST'})` then clear sessionStorage.
  Dev login: `.dev-creds.local` (`e2ee@gmail.com` / any pw / E2EE daily key `mydailykey`).
- App at http://localhost:3112. Restart: `docker compose restart app`.

## Memory pointer
See auto-memory `project_try_mode_direction.md` (updated 2026-06-16) for the agreed direction.
