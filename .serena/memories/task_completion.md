# Task Completion Checks

When a coding task is done:
1. `npm run lint` (eslint) — must pass.
2. Typecheck — `docker compose exec app npx tsc --noEmit` (or the `typecheck` skill). Build also typechecks: `npm run build`.
3. **Manual verification in dev** is the primary QA here — restart (`docker compose restart app`) and check behavior in the running app. Formal unit tests are skipped by convention (see `mem:conventions`); only run `npm run test` if tests already cover the area or the user asks.
4. Schema changes: ensure migration is **additive-only** (`mem:conventions`); apply via `docker compose exec app npx prisma migrate dev` / `db push`.

No automatic commits/pushes — only when the user asks.
