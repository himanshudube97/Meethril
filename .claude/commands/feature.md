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

## 4. Gate (no-regression — must pass before "done")
Run in the **Docker container** (the host node_modules is partial — stale Prisma client, missing deps — so host runs give false failures). In order, and FIX before proceeding — never report success on a red gate:
1. `docker compose exec app npx vitest run`
2. `docker compose exec app npx tsc --noEmit` (or `/typecheck`)

The Stop hook runs both automatically in Docker when you finish (and skips cleanly if the container is down), but run them yourself here so failures surface mid-flow, not at the end. Lint is NOT a gate — the repo carries a large pre-existing `npm run lint` backlog; only fix lint on lines you touch.

## 5. Hearth review
- Dispatch the **hearth-reviewer** agent on the diff. Resolve every 🔴/🟠 finding (or justify explicitly why it's a non-issue).

## 6. Manual verify
- Bring the app up (`/restart`), log in with the `.dev-creds.local` test account (unlock with `DEV_TEST_E2EE_DAILY_KEY` so entries decrypt), and confirm the feature works on the **active theme** — and at least one contrasting theme (e.g. rivendell dark + rose light) so theme bugs surface.

## 7. Finish
- Commit (Co-Authored-By trailer). If this closes a GitHub issue, post the ✅ summary comment (change + files + commit SHA + caveats) per the project convention; leave the issue open unless told to close.

State which stage you're in as you go.
