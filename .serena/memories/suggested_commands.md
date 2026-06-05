# Suggested Commands

**Runs in Docker** — prefer docker compose for the full stack.

## App lifecycle
- `docker compose up -d` — start
- `docker compose restart app` — restart after code changes
- `docker compose logs -f app` — tail logs
- `docker compose down` — stop

## Database (inside container)
- `docker compose exec app npx prisma migrate dev` — create migration (additive-only!)
- `docker compose exec app npx prisma db push` — sync schema without migration
- `docker compose exec app npx prisma studio` — browse data (:5555)
- `docker compose exec app npx tsx prisma/seed.ts` — seed

## Install packages (container has its own node_modules volume)
- `docker compose exec app npm install <pkg>`  (or `docker compose up -d --build`)

## Build / lint / test (npm scripts)
- `npm run dev` (Turbopack — Docker preferred), `npm run build`, `npm run lint` (eslint)
- `npm run test` (vitest run) — but see test convention in `mem:conventions`
- `npm run db:push`, `npm run db:studio`, `npm run db:seed`

## Platform: Darwin (macOS)
- BSD coreutils — `sed -i ''` needs the empty backup arg; prefer dedicated edit tools over sed/awk.
