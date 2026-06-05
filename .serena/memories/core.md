# Core

Hearth (public brand: **Meethril**) — a journaling/letters web app. Next.js 16 App Router + React 19, Postgres via Prisma, runs in **Docker** (see `mem:suggested_commands`).

`CLAUDE.md` at repo root is the authoritative project guide — read it; it overrides defaults.

## Source map (`src/`, alias `@/*` → `./src/*`)
- `app/api/` — route handlers: entries, auth, letters, billing, cron, photos, webhooks
- `components/` — React UI (desk/, scrapbook/, Editor, Background, MoodPicker, LayoutContent, Navigation)
- `hooks/` — useEntries (cursor pagination), useSubscription, useAutosaveEntry, usePhotoSrc
- `lib/` — auth/ (getCurrentUser, dev-auth, supabase), db.ts (Prisma singleton), encryption.ts (AES-256-GCM), themes.ts, dodo.ts, billing/ (is-paid-user, limits, quota), email.ts, entry-lock.ts
- `store/` — Zustand (theme, auth, cursor, journal, profile), persisted to localStorage

## Project-wide invariants
- **Encryption tiers** matter — read `docs/encryption-strategy.md` before touching crypto. See `mem:conventions`.
- **All image bytes** flow through `POST /api/photos` adapter only. Never inline `data:` URLs.
- **Themes**: new routes must integrate the active theme via LayoutContent + Background + useThemeStore. Details in `mem:conventions`.
- **Migrations are additive-only** — never delete data. See `mem:conventions`.
- Auth via `getCurrentUser()` (`@/lib/auth`) in every API route. Dev JWT locally / Supabase OAuth in prod.

Domain detail: tech `mem:tech_stack`, commands `mem:suggested_commands`, conventions `mem:conventions`, done-checks `mem:task_completion`.
