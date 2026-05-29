# Stranger Notes UI Redesign — Design

**Date:** 2026-05-29
**Scope:** UI/UX redesign of the "to a stranger" tab in Letters. No behavioral change to matching, waves, E2EE, moderation, or rate limits. One additive API change (inbox pagination).

## Goal

Make the stranger-notes surface theme-aware, font-consistent with the rest of the app, scalable as a user's correspondences grow, and identified by single-letter monograms instead of whimsical two-word names.

## Background (current state)

- **Compose:** `ComposePaper.tsx` (desktop) / `MobileComposePaper.tsx` (mobile). Torn-paper card, ruled lines, body text rendered in handwriting feel, 10–200 char limit, country postmark picker, fold→ignite→drift send ceremony.
- **"Your planes":** `PlanesCluster.tsx` — scattered animated planes over 10 hardcoded slots. Overlaps past ~10 threads. Backed by `GET /api/stranger-notes/inbox`, which returns ALL threads (outgoing / active / penpals) with no pagination.
- **Correspondence:** `ThreadView.tsx` — tilted paper letter cards, ruled-line backgrounds, two handwriting fonts (Caveat / Patrick Hand), `var(--paper-1)` vs `var(--paper-2)` to distinguish speakers, inline `— APR 28` timestamps, ` . . . ` dividers, header `to <Two Word Name> · a correspondence, N letters deep`.
- **Names:** `src/lib/stranger-names.ts` — `generateDisplayName(seed)` produces deterministic two-word names ("Radiant Lantern"). Stored on `StrangerThread.senderDisplayName` / `recipientDisplayName`.
- **App fonts:** `--font-serif` = EB Garamond (the app's primary typeface). Caveat + Patrick Hand are handwriting fonts used only in this feature.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Char limit | **Keep 200** (cold-open and replies share it). Min 10 kept. |
| Stranger identity | **Single-letter monogram = first letter of the existing stored display name** (`"Radiant Lantern"` → `R`). Render-time only, **no migration**. Stored two-word names remain in DB, unused by the UI. |
| Font (correspondence) | **EB Garamond (app `--font-serif`) for all messages.** Drop Caveat / Patrick Hand from this feature. |
| Speaker distinction | **Color + alignment only**, no bubbles/cards. *you* = theme `text.primary`, right-aligned; *them* = theme `accent.primary`, left-aligned. Derived per theme (accept that contrast strength varies; no new theme tokens). |
| Ruled lines | **Removed** — plain paper on both compose and correspondence. |
| "Your planes" scaling | **Hybrid sky + list** + **cursor pagination** on the inbox API. |

## Part 1 — Compose note

`ComposePaper.tsx` / `MobileComposePaper.tsx`:

- Torn-paper card retained; **paper + ink fully theme-aware** (read from `useThemeStore` / theme CSS vars — no hardcoded cream/brown literals).
- **Remove ruled-line background.** Plain paper.
- Body text font → EB Garamond (`font-serif` / `var(--font-serif)`), not handwriting.
- Keep: 200-char counter, min-10 gate, country/postmark picker, "release into the night" CTA, fold→ignite→drift ceremony.
- Verify on rivendell (dark), rose (light), sunset (warm) — text + placeholder + counter legible on all.

## Part 2 — "Your planes" → hybrid sky + list

Replaces `PlanesCluster.tsx`'s scatter-only layout.

**Sky strip (top, the kept magic):**
- Renders **only unread / new-arrival threads** as floating planes (cap ~5; if more unread, show the most recent and a `+N` affordance).
- No unread → strip collapses to a quiet single line (e.g. "the sky is quiet").

**All-correspondence list (below):**
- Vertical list, one row per thread:
  `[monogram] · status · last-line preview · timestamp · unread dot`
  - status string: `N letters deep` (active), `pen pal`, `awaiting a reply` (outgoing/unmatched).
  - preview = last message's first line (server-tier decrypted server-side as today; thread-tier shows a sealed glyph since the client can't decrypt in a list context — render `✦ sealed` rather than ciphertext).
- **Filter chips:** `pen pals · strangers · sent` → penpals / active / outgoing groups.
- Theme-aware throughout (`useThemeStore`).

**Pagination (the scale fix):**
- `GET /api/stranger-notes/inbox` gains optional `?cursor=<id|lastActivityAt>&limit=<n>` (default limit e.g. 30), ordered `lastActivityAt DESC`, returns `{ ..., nextCursor }`.
- Mirror the cursor approach already used by `useEntries`.
- The sky strip queries unread threads (small set) independent of list pagination; the list paginates.
- Backwards-compatible: with no `cursor`/`limit` params the route still returns the existing grouped shape for the first page; new fields are additive.

## Part 3 — Correspondence / chat view

`ThreadView.tsx`:

- **Plain paper, no ruled lines, theme-aware.** Remove tilted letter cards / paper-1-vs-paper-2 backgrounds.
- **All messages in EB Garamond.**
- **Speakers by color + alignment:** *you* = `text.primary`, right-aligned; *them* = `accent.primary`, left-aligned. No bubbles.
- **Keep:** inline `— APR 28` timestamps, ` . . . ` dividers between messages, header `to <Initial> · a correspondence, N letters deep`, the country flag.
- Reply box: plain, app font, 200-char limit + counter, min-10 gate. Unchanged: wave prompt, skip / block / end-connection, E2EE thread-tier encrypt/decrypt path.

## Part 4 — Monogram helper

- Single render-time transform: first non-whitespace letter of the stored display name, uppercased.
- Applied wherever a stranger/self name is shown: sky-strip plane labels, list rows, correspondence header, per-message author label (if any).
- No schema change, no migration, no change to `stranger-names.ts` generation. (Future option, out of scope: a deterministic unique-letter helper to avoid initial collisions.)

## Out of scope / non-goals

- No change to matching, daily limits, journal-entry gate, moderation, wave eligibility, blocking, or E2EE key exchange.
- No new theme tokens (`themes.ts` untouched).
- No DB migration. No destructive changes.
- Initial-collision uniqueness deferred.
- No automated tests (per project convention — verify manually in dev across themes).

## Verification

Manual, in Docker dev, across rivendell (dark) / rose (light) / sunset (warm):
1. Compose: plain themed paper, app font, 200 counter, send ceremony, legible on all three.
2. Planes: unread float in sky; all threads appear in list; filter chips work; scroll past ~30 lazy-loads more.
3. Correspondence: plain paper, app font, you=ink/right vs them=accent/left, timestamps + ` . . . ` dividers intact, reply sends.
4. Monograms: every name shows as a single uppercase letter; pen-pal E2EE thread still encrypts/decrypts.
