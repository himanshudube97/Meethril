#!/usr/bin/env bash
# Stop-hook regression gate for Hearth.
#
# Fires when the main agent finishes a turn. Goal: never let a turn end "done"
# while the critical-path tests or the type-checker are red.
#
# Design notes:
#   - Only runs when TS/TSX under src/ actually changed this working tree, so
#     conversational / config-only turns are silent and instant.
#   - Both Vitest AND tsc run INSIDE THE DOCKER CONTAINER. The host node_modules
#     is partial (stale Prisma client, missing @sentry/nextjs), so host runs
#     produce false failures for anything touching Prisma or Next. Docker is the
#     canonical env (see CLAUDE.md).
#   - If the container is down we SKIP the gate with a soft note rather than
#     blocking — the user simply isn't in a dev session.
#   - Exit 2 + stderr -> blocks the stop and feeds the failure back to Claude.
#   - Exit 0          -> turn ends normally.
#   - Honors stop_hook_active to avoid an infinite re-block loop.

set -uo pipefail

PROJECT_DIR="/Users/himanshut4d/Documents/Personal_projects/feel_good/hearth"
cd "$PROJECT_DIR" || exit 0

# --- read hook input; bail out of any re-entrant invocation -----------------
input="$(cat)"
if [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

# --- only gate when TS/TSX under src/ changed -------------------------------
if ! git status --porcelain -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null | grep -q .; then
  exit 0
fi

# --- skip cleanly if the dev container is not running -----------------------
if ! docker compose exec -T app true >/dev/null 2>&1; then
  printf '(note: app container down — regression gate skipped; bring it up with /restart and run /typecheck + vitest before committing)\n' >&2
  exit 0
fi

fail=0
report=""

# --- 1. Vitest (in Docker) --------------------------------------------------
vitest_out="$(docker compose exec -T app npx vitest run 2>&1)"
if [ $? -ne 0 ]; then
  fail=1
  report+=$'\n=== Vitest FAILED ===\n'
  report+="$(printf '%s\n' "$vitest_out" | tail -30)"
fi

# --- 2. tsc (in Docker) -----------------------------------------------------
tsc_out="$(docker compose exec -T app npx tsc --noEmit 2>&1)"
if [ $? -ne 0 ]; then
  fail=1
  report+=$'\n=== Typecheck FAILED ===\n'
  report+="$(printf '%s\n' "$tsc_out" | grep -E 'error TS' | head -15)"
fi

if [ "$fail" -eq 1 ]; then
  printf 'Regression gate failed — fix before finishing:\n%s\n' "$report" >&2
  exit 2
fi
exit 0
