---
description: Polish the UI of a screen — render it, screenshot on two themes, critique against Hearth's design bar, and iterate until it looks intentional. Use when a screen "looks off" and you want a focused visual pass (no full feature loop).
---

Improve the visual design of the screen/route in `$ARGUMENTS` (e.g. `/design /scrapbook` or `/design the timeline page`). This is a **screenshot-driven loop**, not a guess-from-code pass. Claude can't fix UI it never looks at — so look.

## 0. Frame the bar
- Invoke the **frontend-design** skill first — it sets Hearth's aesthetic target: calm, literary, paper-textured, Playfair-style display type, muted/dusty palette, generous breathing room. NOT a crisp SaaS dashboard, NOT default-shadcn, NOT loud.
- Recall the theme contract (CLAUDE.md "Themes System"): every colour follows the active theme via `useThemeStore` inline styles; never hardcoded `bg-[#xxxxxx]` that paints over the theme.

## 1. Render & capture (Playwright MCP)
- App serves at **http://localhost:3112** (`/restart` if it's down).
- Log in with the `.dev-creds.local` account (`DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD`); unlock E2EE with `DEV_TEST_E2EE_DAILY_KEY` so real content renders, not the `[Encrypted]` placeholder. Read `.dev-creds.local` for live values.
- Navigate to the target route.
- Screenshot on **two contrasting themes** — dark (`rivendell`) + light (`rose`) — switching via the theme/gear picker between shots. If it's a layout that differs by width (e.g. the journal spread — desktop `BookSpread` vs mobile `MobileJournalEntry` are separate), also capture a mobile viewport (`browser_resize` ~390px).
- Save PNGs under `/tmp/` with clear names (e.g. `/tmp/design-<route>-rivendell.png`).

## 2. Critique (look at your own pixels)
- `Read` each screenshot and judge it against the frontend-design bar AND the Hearth design rubric in `.claude/agents/design-reviewer.md` (theme adherence, aesthetic fit, hierarchy & rhythm, contrast, responsive integrity, state completeness).
- Write down the specific problems before touching code: "heading and body nearly same size", "card shadows too heavy / too SaaS", "secondary text ghosted on dark theme", etc.

## 3. Fix & iterate
- Make the changes (theme-aware styles via `useThemeStore`; respect dual-editor parity if relevant).
- Re-shoot the same theme(s)/widths. Compare against the previous shot. Repeat until it looks **intentional** on both themes — not a first draft.

## 4. Independent design review
- Dispatch the **design-reviewer** agent on the final screenshots (pass the paths + route + what changed). Resolve every 🔴/🟠, re-shoot to confirm.

## 5. Guard correctness
- If any fix touched logic (not just styling), run the regression gate: `docker compose exec app npx vitest run` + `docker compose exec app npx tsc --noEmit`. Pure CSS/style changes can skip it.

Report: before/after screenshots referenced by path, the findings you fixed, and the design-reviewer verdict.
