# `/try` as the Real Meethril Shell — Design

**Date:** 2026-06-16
**Status:** Approved (design), pending implementation plan

## Goal

Let an anonymous visitor experience the **whole** Meethril app — journal, letters,
scrapbook, memory, shelf, themes — with the **byte-identical real UI**, where:

- Nothing hits the backend (no auth, no DB, no email, no Dodo).
- All state lives in the existing sessionStorage trial layer and is wiped on tab close.
- The visitor reuses the real scene components, not a custom tour/demo UI.

This reworks the current `/try` (which is an entry screen + a 4-step guided tour + a
custom letter demo) into the real app shell running on the trial data layer.

## Decisions (locked during brainstorming)

| Topic | Decision |
|---|---|
| Server-dependent features | Fake locally, instant (no email, no week-delay, no checkout) |
| Conversion / signup | Discard trial data, fresh start (already wiped on tab close) |
| Entry point | Straight to the desktop (no onboarding, no theme/nickname step) |
| Nav scope | Write, Letters, Scrapbook, Shelf, Memory + theme sidebar. **No profile page.** |
| Write caps | 5 **per feature** (journal entries, letters, scrapbook boards — independently) |
| Conversion points | Cap wall + nav "Sign up" link + keep floating "Make it permanent" button |
| Seed data | **None.** Empty states until the visitor creates. Memory shows what the visitor wrote. |
| Memory gate | **Ungated in `/try`** — show visitor entries immediately (real app keeps gate=14) |

## Architecture — Approach A: mirror routes under `/try/*`

Real scenes are separate top-level routes (`/write`, `/letters`, `/scrapbook`,
`/scrapbook/[id]`, `/memory`, `/shelf`, `/me`) and `Navigation` links to those absolute
paths. We mirror them under `/try/*` with thin pages that re-export the real scene
components, so the UI can never drift from the real app. Real routes stay 100% untouched.

Rejected alternatives:
- **B — reuse real routes with an anonymous trial flag:** pollutes real routes with trial
  branches and fights middleware auth guards. Too risky for the real app.
- **C — single `/try` page with internal scene state:** re-implements routing/nav behavior
  and diverges from the real shell.

## Components

### 1. Route mirror (`src/app/try/*`)

- `src/app/try/layout.tsx` — wraps all `/try/*` children in `TryModeProvider` (boots trial
  store, installs fetch interceptor, primes throwaway crypto key, seatbelt-redirects
  logged-in users to `/me`).
- `src/app/try/page.tsx` — redirect to `/try/write` (journal desk is the landing).
- `src/app/try/write/page.tsx` → real `DeskScene`.
- `src/app/try/letters/page.tsx` → real letters page component.
- `src/app/try/scrapbook/page.tsx` → real scrapbook listing.
- `src/app/try/scrapbook/[id]/page.tsx` → real `ScrapbookCanvas`.
- `src/app/try/memory/page.tsx` → real memory scene (ungated, see §6).
- `src/app/try/shelf/page.tsx` → real `ShelfScene`.
- **No `/try/me`** — profile page is intentionally excluded.

Each page is a thin wrapper/re-export of the real scene component. No scene logic is
duplicated.

### 2. Trial-aware `Navigation` (`src/components/Navigation.tsx`)

Add a trial mode keyed on `pathname.startsWith('/try')`:

- Scene links prefix `/try`: `/try/write`, `/try/letters`, `/try/scrapbook`, `/try/shelf`,
  `/try/memory`.
- Tabs shown: Write, Letters, Scrapbook, Shelf, Memory. **No profile.**
- The `/me` avatar pill is replaced by a **"Sign up"** link to `/login`.
- Theme gear (`DeskSettingsPanel`) renders and works unchanged — gives the visitor the
  theme switcher from the sidebar.

The trial branch must keep desktop + mobile parity (Navigation has separate desktop and
mobile renders).

### 3. `LayoutContent` trial branch (`src/components/LayoutContent.tsx`)

Today `/try` is folded into the immersive onboarding branch
(`isOnboardingPage = pathname.startsWith('/onboarding') || pathname.startsWith('/try')`),
which strips all chrome. Change this so `/try` is **not** treated as immersive and instead
renders the **full real chrome**: Navigation (trial variant), Background, TopChromeBackdrop,
FullscreenButton, DeskSettingsPanel, and the padded `<main>` wrapper — exactly like the
authed scene routes. `/onboarding` keeps its immersive branch.

### 4. Trial router expansion (`src/lib/trial/router.ts` + `intercept.ts`)

The router currently handles entries + photos and returns empty for letters. Expand it to a
full read+write API over the sessionStorage snapshot. Endpoints to cover:

- Profile: `GET/PUT /api/profile`, `GET/PUT /api/me/profile-flags`.
- Letters: `POST /api/letters/self`, `POST /api/letters/friend` (instant seal + deliver),
  `GET /api/letters/inbox|sent|mine|drafts|arrived`, `POST /api/letters/[id]/viewed|read`.
- Scrapbook: `GET/POST /api/scrapbooks`, `GET/PUT /api/scrapbooks/[id]`.
- Stranger notes: `GET /api/stranger-notes/*` (operates on local threads; empty until/unless
  the visitor interacts — no seed).
- Everything else: benign `200`.

Mutations follow the existing pattern: the router returns the expected response shape and the
interceptor applies the trial-store mutation. Photos continue through the IndexedDB blob
store.

### 5. Instant / faked server features

- **Letters:** the seal animation plays, then the letter is immediately delivered /
  revealable — no 1-week `unlockDate` wait, no Resend email. Friend letters land directly in
  the local inbox (no external recipient).
- **Stranger notes ("lights" tab):** read/reply against local trial threads only.
- **Billing:** no surface in `/try` (no profile page, no checkout). Conversion is the signup
  CTA only.

### 6. Memory — ungated in `/try`

The real memory scene gates on `gate=14` entries. In `/try`, with no seed and a 5-entry cap,
that gate could never be reached. The trial memory view must show the visitor's entries
immediately (1+), with no 14-entry threshold. The real app keeps `gate=14` unchanged. This
requires the memory scene to read a trial-aware gate (e.g. a prop / context flag set under
`/try`) rather than the hardcoded constant.

### 7. No seed data

Remove all demo seeding. Delete `src/lib/trial/seed.ts` and its use in `TryModeProvider`. The
trial store starts empty; every scene shows its real empty state ("write your first entry",
etc.) until the visitor creates content. Memory reflects only what the visitor wrote.

### 8. Caps + conversion (5 per feature)

The trial store enforces a cap of **5 each** for journal entries, letters, and scrapbook
boards, independently. On hitting a cap, the relevant create action surfaces a "sign up to
keep going" prompt. Conversion surfaces:

1. The cap wall prompt.
2. The nav **"Sign up"** link.
3. The existing floating **"Make it permanent"** button (`TryInvite`), kept as-is.

Login starts a fresh, empty real account; trial data is discarded (it is sessionStorage and
already wiped on tab close — no migration).

### 9. Deletions

Remove the custom-UI pieces that the real shell replaces:

- `src/components/try/TryEntryScreen.tsx`
- `src/components/try/TryTour.tsx`
- `src/components/try/TryLetterDemo.tsx`
- old routes: the standalone `/try/write` free-play page (replaced by the mirror page) and
  `/try/tour`.
- `src/lib/trial/seed.ts` (per §7).

Keep the data layer: `src/store/trial.ts`, `src/lib/trial/{intercept,router,blob-store,crypto}.ts`,
`TryModeProvider`, and the `TryInvite` floating button.

## Data flow

1. Visitor opens `/try` → redirect to `/try/write`.
2. `/try/layout.tsx` mounts `TryModeProvider`: trial store (empty), fetch interceptor, primed
   throwaway AES-GCM key.
3. Visitor navigates via the trial-aware Navigation between `/try/{write,letters,scrapbook,
   shelf,memory}`. Each renders the real scene component.
4. Scenes call `/api/*` as usual; the interceptor routes them to the trial router, which
   reads/writes the sessionStorage snapshot and IndexedDB blobs. Encryption happens
   client-side under the throwaway key, identical to the real path.
5. Hitting a per-feature cap of 5 surfaces the signup prompt. The nav "Sign up" link and the
   floating button also route to `/login`.
6. On login (or tab close) the trial data is discarded; the real account starts empty.

## Testing

Per repo convention, critical-path **pure logic** gets a Vitest test; UI is verified
manually.

- **Unit (Vitest, in Docker):** trial store per-feature cap enforcement (5 each, seeds
  excluded → there are no seeds); trial router request→response mapping for the new endpoints
  (letters self/friend instant-deliver, scrapbook CRUD, profile, profile-flags); trial memory
  gate = ungated.
- **Manual:** on the running app at `/try`, walk every scene on two themes (one dark e.g.
  rivendell, one light e.g. rose): write an entry → see it in memory; compose + seal a letter →
  instant reveal; create a scrapbook board + add a photo; hit each 5-cap → signup prompt;
  confirm nav has no profile, shows "Sign up"; confirm reload preserves session and tab close
  wipes it; confirm a logged-in user visiting `/try` is bounced to `/me`.

## Risks / invariants to respect

- **Dual editor parity:** journal edits affect both desktop `BookSpread` and mobile
  `MobileJournalEntry` — Navigation trial variant must cover mobile too.
- **E2EE tiers:** trial uses the real client-side encryption under a throwaway key; do not
  introduce a plaintext shortcut.
- **Theme-awareness:** the new chrome on `/try` must follow the active theme (read from
  `useThemeStore`, no hardcoded palette) — see CLAUDE.md themes section.
- **Real routes untouched:** the gate ungating and nav trial branch must be scoped to `/try`
  only; `/write`, `/memory`, etc. behave exactly as before.
- **No backend leakage:** every `/api/*` path a scene can hit must be covered by the trial
  router; uncovered paths return benign 200 (never reach the real server).
