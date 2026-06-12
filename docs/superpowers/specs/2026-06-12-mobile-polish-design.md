# Mobile Polish — un-gate phones for the real app + chrome/nav cleanup

**Date:** 2026-06-12
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Himanshu (audit-driven)

## Why

Phones are currently **blocked** from the real logged-in app by
[`DesktopGate`](../../src/components/DesktopGate.tsx) — they see a "made for your
desk" splash. The separate mobile scene components already exist
(`MobileJournalEntry`, `MobileLettersView`, `ButterflyMemoryView`, and the shelf
grid) but sit unused behind the gate. We want phones to be first-class for every
screen **except scrapbook**.

This is **feature (a) of three.** Build order: (b) pagination parity → (c) try
mode → **(a) this**. It's last because the gate decision touches the real app and
benefits from (b)/(c) being settled first.

## Audit (2026-06-12, real browser @ 390×844)

Drove the running app at phone width (the gate keys off device UA/touch, not
width, so a narrow viewport renders the mobile layouts). Findings:

**The scene bodies are ~70% ready. The real gaps are global chrome + nav.**

Common to every screen:
- A **top floating icon rail** (pen · sparkle · envelope · window · star + lock)
  — desktop chrome bleeding onto mobile; cramped, centered awkwardly. It half-acts
  as nav (one icon highlights per page) but isn't a real mobile nav.
- A **floating profile avatar** ("N") bottom-left, overlapping content.
- **No proper mobile navigation.**

Per screen:
- **memory** (butterflies) — charming, most mobile-ready. Minor touch-ups.
- **shelf** (3-col month grid) — already looks good on phone. Minor.
- **write** — functional but cramped under the floating rail; tabs/song/textarea
  need breathing room.
- **letters** — plainest; loses the postbox metaphor, PostalSky sun-glow bleeds
  oddly. Most per-screen work.

Verdict: **(a) is chrome + nav work + light per-screen polish, not a redesign.**

## Decisions (locked)

| Question | Decision |
|---|---|
| Desktop gate | **Remove for write, letters, memory, shelf.** Phones get the real app on those routes. |
| Scrapbook | **Desktop-only note.** On phone, `/scrapbook` shows a graceful "Scrapbook lives on the desktop — open on a bigger screen" card. No mobile canvas. |
| Quality bar | **Refine, don't redesign.** Keep the existing mobile scene components; fix chrome, nav, spacing, touch targets, theme bleed. |
| Mobile nav | **Hamburger / slide-out drawer.** Top-corner menu icon → slide-out with write · letters · memory · shelf (+ settings/profile/lock). Replaces the cramped top icon rail on mobile. |

## Architecture

The theme/chrome rules in `CLAUDE.md` govern this work: `LayoutContent` is the
gatekeeper for page chrome and branches on `pathname`; theme colours must come
from `useThemeStore` (never hardcoded). Mobile chrome is a `LayoutContent`
concern, not per-page.

### 1. Gate change — `DesktopGate`

- Stop blocking `/write`, `/letters`, `/memory`, `/shelf` on handheld.
- `/scrapbook` on handheld → render the desktop-only note (small themed card),
  not the splash and not the canvas.
- Keep the gate's machinery for any route we still want desktop-only; just narrow
  its block-list to scrapbook (and anything else explicitly desktop-only).

### 2. Mobile chrome — `LayoutContent`

- **Hide** the desktop top icon rail + floating avatar on mobile
  (`useLayoutMode() === 'mobile'`), OR restyle them into the drawer. The bleeding
  desktop chrome is the #1 audit problem.
- **Mount a mobile nav** (new `MobileNav` component): a hamburger button (fixed,
  thumb-safe corner) opening a slide-out drawer. Drawer items: Write, Letters,
  Memory, Shelf, then Settings / Profile / Lock diary. Theme-aware
  (`useThemeStore`), animated with Framer Motion (already a dep).
- The E2EE **lock** button and **settings/gear** move into the drawer on mobile
  (they're in the floating rail today).

### 3. Per-screen polish (refine, scoped by audit)

- **letters** (`MobileLettersView`): contain the PostalSky sun-glow so it doesn't
  bleed; tighten the list cards; make "+ Write" and tabs thumb-friendly. Biggest
  per-screen effort.
- **write** (`MobileJournalEntry`): reclaim the vertical space freed by removing
  the top rail; comfortable spacing for song / tabs / textarea; verify the
  feature-(b) page-break divider sits right with the new chrome.
- **memory** / **shelf**: spacing + touch-target pass only; they're close.

### 4. Scrapbook desktop-only note

A small themed card component shown for `/scrapbook` on handheld (wired in the
gate). Copy: "Scrapbook lives on the desktop — open Meethril on a bigger screen
to arrange your scraps." Theme-aware.

## Data flow

No data changes. Pure presentation/chrome/routing. All four scene components keep
their existing data hooks.

## Error handling

- Drawer must trap focus + close on route change / backdrop tap / Escape.
- Removing the gate must not expose scrapbook's canvas on phones (explicit note
  branch).
- Verify no theme bleeds (the recurring CLAUDE.md bug): every new chrome element
  reads `useThemeStore`; test on a light theme (rose) and a dark theme
  (rivendell) so the drawer/note aren't hardcoded cream/brown.

## Testing

Per project convention, verify manually at phone width across screens + themes.
Checklist: gate removed (phones reach all 4 routes), scrapbook shows the note,
hamburger opens/closes + navigates, no floating desktop chrome remains, write
divider (feature b) still correct, letters glow contained, light+dark themes
clean. Optional: a small test that `DesktopGate` returns the note for
`/scrapbook` and passes through the 4 routes on handheld.

## Out of scope

- Scrapbook mobile editor or view (desktop-only note only).
- Mobile redesign of any scene (refine only).
- The two-page book on phone (feature b chose one-scroll + divider).
- Tablet-specific work beyond what the existing breakpoints already do.

## Open details to settle during planning

1. **Drawer contents + order** — exact items and whether settings/profile/lock
   are grouped or inline. Decide in plan.
2. **Top rail on mobile** — fully hidden vs collapsed into the hamburger. Lean
   "hidden, functions moved into the drawer." Confirm in plan.
3. **Gate mechanism** — narrow the existing allow/block list vs invert to an
   explicit desktop-only list (`/scrapbook`). Pick the smaller diff in plan.
