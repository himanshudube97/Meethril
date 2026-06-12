---
description: Drive a Hearth feature end-to-end (context → spec → plan → implement → gate → review) with the no-regression gates baked in
---

Build the feature described in `$ARGUMENTS` end-to-end, with full context and no regressions. Follow this loop in order. Do NOT skip stages because the feature "looks small" — the gates are cheap and the regressions they catch are not.

## 0. Gather context (full-context requirement)
- Read `CLAUDE.md` and any relevant `docs/` (always `docs/encryption-strategy.md` if the feature touches journals/letters/scrapbook/photos/doodles/profile).
- Use the **feature-dev:code-explorer** agent (or `cavecrew-investigator`) to map the existing feature area before designing. Don't guess at structure.
- Recall: which of Hearth's invariants does this feature touch? (dual editor, E2EE tier, entry-lock, theme, photo adapter, migrations — see `.claude/agents/hearth-reviewer.md`).

## 1. Brainstorm → spec
- Invoke the **superpowers:brainstorming** skill. Explore intent, constraints, success criteria. Present a design, get approval, write the spec to `docs/superpowers/specs/`.

## 2. Plan
- Invoke **superpowers:writing-plans** to turn the approved spec into a step-by-step implementation plan.

## 3. Implement (test-first on critical paths)
- For changes to **encryption, entry-lock, billing/quota, or any pure data-rule logic**: write the Vitest test FIRST (see `src/__tests__/` for the house style), then implement. UI is exempt from tests (manual verify instead).
- Respect the invariants as you go. If you touch one editor, touch the other.
- Schema change? Use the `/migrate` command (additive-only).
- **Building UI?** Invoke the **frontend-design** skill while writing components — it pushes toward Hearth's calm, literary, theme-driven aesthetic and away from generic default-AI layouts. Style against `useThemeStore`, never hardcoded colours.

## 4. Gate (no-regression — must pass before "done")
Run in the **Docker container** (the host node_modules is partial — stale Prisma client, missing deps — so host runs give false failures). In order, and FIX before proceeding — never report success on a red gate:
1. `docker compose exec app npx vitest run`
2. `docker compose exec app npx tsc --noEmit` (or `/typecheck`)

The Stop hook runs both automatically in Docker when you finish (and skips cleanly if the container is down), but run them yourself here so failures surface mid-flow, not at the end. Lint is NOT a gate — the repo carries a large pre-existing `npm run lint` backlog; only fix lint on lines you touch.

## 5. Hearth review
- Dispatch the **hearth-reviewer** agent on the diff. Resolve every 🔴/🟠 finding (or justify explicitly why it's a non-issue).

## 6. Visual gate (only if the feature has UI — skip for pure backend/logic)
Don't ship UI you never looked at. Render it, screenshot it, judge it, fix it — before claiming done.

1. Bring the app up (`/restart`). App serves at **http://localhost:3112**.
2. Log in via Playwright MCP with the `.dev-creds.local` account (`DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD`), and unlock E2EE with `DEV_TEST_E2EE_DAILY_KEY` so real content decrypts (not `[Encrypted — unlock to view]`). Read `.dev-creds.local` for the live values.
3. Navigate to the new/changed route. Screenshot it on **two contrasting themes** — one dark (`rivendell`) + one light (`rose`) — switching theme via the gear/theme picker between shots. If the feature touches the journal spread, capture **both desktop and a mobile viewport** (`browser_resize` to ~390px), since the two editors are separate. Save the PNGs (e.g. under `/tmp/`).
4. **Look at your own screenshots** (Read them) against the **frontend-design** skill's bar. Fix spacing/hierarchy/contrast/theme issues yourself, re-shoot, iterate until it actually looks intentional — not default-AI.
5. Dispatch the **design-reviewer** agent on the saved screenshots (pass the paths + route + what changed). Resolve every 🔴/🟠 finding, re-shoot to confirm. Re-run the correctness gate (step 4) if any fix touched logic.

The goal: the iteration happens here, inside the turn, so the human sees a finished screen — not a first draft.

## 7. Finish
- Commit (Co-Authored-By trailer). If this closes a GitHub issue, post the ✅ summary comment (change + files + commit SHA + caveats) per the project convention; leave the issue open unless told to close.

State which stage you're in as you go.
