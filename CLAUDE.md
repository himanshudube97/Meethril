# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Environment

**This project runs in Docker.** Always use Docker commands for development.

### Start the app
```bash
docker compose up -d
```

### Restart after code changes
```bash
docker compose restart app
```

### View logs
```bash
docker compose logs -f app
```

### Stop everything
```bash
docker compose down
```

### Database Commands
```bash
docker compose exec app npx prisma migrate dev    # Create migration
docker compose exec app npx prisma db push        # Sync schema without migration
docker compose exec app npx prisma studio         # Browse data (opens at :5555)
docker compose exec app npx tsx prisma/seed.ts    # Seed data
```

**Important:** Never create migrations that delete data. When modifying schema, use additive changes (new columns with defaults, new optional fields). If Prisma warns about data loss, find an alternative approach.

### Installing Packages
**This project uses `npm` exclusively** (locally, in Docker, and on Vercel). Do not commit a `pnpm-lock.yaml` or `yarn.lock` — only `package-lock.json` is the source of truth.

The container has its own `node_modules` volume (separate from host). To install packages:
```bash
docker compose exec app npm install <package-name>
```
Or rebuild after adding to package.json:
```bash
docker compose up -d --build
```

### Build & Lint
```bash
npm run dev      # Turbopack dev server (use Docker instead for full stack)
npm run build    # Production build
npm run lint     # ESLint check
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 16 (App Router) with React 19
- **Database**: PostgreSQL with Prisma ORM
- **Editor**: TipTap rich text editor
- **Animations**: Framer Motion v12
- **State**: Zustand stores
- **Payments**: Dodo Payments (Merchant of Record)
- **Email**: Resend
- **Auth**: Dev JWT (local) / Supabase OAuth (production)

### Path Alias
`@/*` → `./src/*` (configured in tsconfig.json)

### Key Directories
```
src/
├── app/api/          # API routes (entries, auth, letters, billing, cron)
├── components/       # React components
├── hooks/            # useEntries (cursor pagination), useSubscription
├── lib/              # Core utilities
│   ├── auth/         # getCurrentUser(), dev-auth, supabase clients
│   ├── db.ts         # Prisma singleton
│   ├── encryption.ts # AES-256-GCM encrypt/decrypt
│   ├── themes.ts     # 10 themes with colors, particles, whispers
│   ├── dodo.ts       # Dodo Payments client, checkout, portal, webhook verify
│   ├── billing/      # is-paid-user, limits, quota (billing-anchored usage caps)
│   └── email.ts      # HTML email templates
└── store/            # Zustand: theme, auth, cursor, journal, profile
```

### Database Models (Prisma)
- **User**: Auth, profile JSON, Dodo subscription fields (`dodoCustomerId`, `dodoSubscriptionId`, `dodoProductId`, `subscriptionStatus`, `currentPeriodEnd`); legacy Lemon Squeezy columns retained but unused
- **JournalEntry**: Core model with mood (0-4), entryType (normal/letter/unsent_letter/ephemeral), encryption fields, letter-specific fields (recipientEmail, unlockDate, isSealed, isDelivered)
- **Doodle**: Strokes as JSON, linked to entries

### Authentication Flow
- `middleware.ts` protects routes, redirects unauthenticated users
- Public paths: `/`, `/login`, `/pricing`, `/api/auth/*`, `/api/webhooks/*`
- Dev mode (`USE_DEV_AUTH=true`): JWT in `hearth-auth-token` cookie
- Production: Supabase OAuth with auto user creation

### Manual Testing in the Running App
When verifying changes in the live app (http://localhost:3112), **always log in with the local test account** — credentials live in the gitignored [`.dev-creds.local`](.dev-creds.local) file at the repo root:
- **Email**: `DEV_TEST_EMAIL` (any password works in dev mode, but use `DEV_TEST_PASSWORD`)
- **E2EE daily key**: `DEV_TEST_E2EE_DAILY_KEY` — required to unlock the journal so entries decrypt and render (without it, everything shows `[Encrypted — unlock to view]`).

This account is the canonical one for visual/manual verification and already has seeded journal data. Read `.dev-creds.local` to get the current values; never hardcode or commit them.

### Encryption Pattern

**Read [`docs/encryption-strategy.md`](docs/encryption-strategy.md) before touching any encryption code.** Hearth uses three tiers (E2EE under master key, server-encrypted under `ENCRYPTION_KEY`, plaintext) — which tier applies depends on the content type. The doc explains why and gives a decision heuristic for new content.

Quick reference:
- **Journals, letters, scrapbook items, photos, doodles** → Tier 1 (E2EE under master key, AES-256-GCM, browser-only). Server cannot decrypt.
- **`User.profile` (nickname/birthday)** → Tier 2 (server-encrypted via `lib/encryption.ts` `encryptJson`/`decryptJson`). Used by the reminder cron.
- **`StrangerNote.text` / `StrangerReply.text`** → Tier 2 (server-encrypted). Permanent design: moderation requires server reads.
- **Schedules, recipient emails, status flags, IDs** → Tier 3 (plaintext).

### Photo / Image Storage Flow
Both journal entries and scrapbook photos go through the **same storage adapter** at `POST /api/photos`. Nothing else writes image bytes — never inline a `data:` URL into an entry or scrapbook item again.

The adapter is selected at startup by `PHOTO_STORAGE`:
- `PHOTO_STORAGE=local` (dev) — `LocalPostgresAdapter`: ciphertext is stored as a base64 row in the `EncryptedBlob` table. Handle = blob row id.
- `PHOTO_STORAGE=supabase` (staging/prod) — `SupabaseStorageAdapter`: ciphertext is uploaded to a private Supabase Storage bucket (`SUPABASE_STORAGE_BUCKET`). Handle = `{userId}/{uuid}.bin`.

The adapter never sees plaintext when E2EE is on — encryption happens on the client before upload. For both code paths the route returns an opaque `handle` and is read back via `GET /api/photos/{handle}` (auth + owner-scoped).

**E2EE on (master key unlocked):**
1. Client compresses → ArrayBuffer.
2. `encryptBytes(buffer, masterKey)` → ciphertext bytes.
3. `POST /api/photos` with the ciphertext bytes → `{handle}`.
4. `encryptString(JSON.stringify({handle, iv}), masterKey)` → store the result on the row as `encryptedRef` + `encryptedRefIV`. The bare handle never lands on the row.
5. Display via `usePhotoSrc` (`src/hooks/usePhotoSrc.ts`): decrypt the ref → fetch ciphertext → `decryptBytes` → blob URL.

**E2EE off:**
1. Client compresses → ArrayBuffer.
2. `POST /api/photos` with plaintext bytes → `{handle}`.
3. Store `url: '/api/photos/{handle}'` on the row.
4. Display: `usePhotoSrc` fetches and wraps as a blob URL.

Where this lives:
- Journal entries: `src/components/desk/PhotoBlock.tsx` (uploadAndAdd) + `EntryPhoto.encryptedRef` / `EntryPhoto.url`.
- Scrapbook items: `src/components/scrapbook/ScrapbookCanvas.tsx` (`uploadScrapbookPhoto`) + `PhotoItemData.encryptedRef` / `PhotoItemData.src`.

Legacy scrapbook photos that were saved as inline `data:image/...` URLs in `src` keep rendering (`usePhotoSrc` returns them as-is). Don't write new ones in that shape.

### Letters Feature
Time-delayed letters to self or friends:
- Minimum 1 week delay, stored with `unlockDate` and `isSealed=true`
- Daily cron (`/api/cron/deliver-letters`) processes due letters
- Self letters: notification email + reveal modal on app open
- Friend letters: beautiful HTML email via Resend

### API Patterns
- Entries use cursor-based pagination for scalability
- Stats endpoint provides aggregated year/month data
- Letter delivery processes 50 at a time to avoid timeouts
- All API routes use `getCurrentUser()` from `@/lib/auth` for authentication

### Themes System
10 themes in `lib/themes.ts`, each with:
- Color palette (background, text, accent)
- Particle effects (snow, fireflies, sakura, rain, stars, etc.)
- Theme-specific "whispers" (writing prompts)

**New pages must integrate with the active theme — never paint over it.** Every new route inherits the user's selected theme through three coordinated pieces, and skipping any of them is a recurring source of UI bugs (nav chrome bleeding through, hardcoded cream/brown panels that ignore the user's chosen palette, scrollbars caused by stacked backgrounds):

1. **`LayoutContent` (`src/components/LayoutContent.tsx`)** is the gatekeeper for page chrome (Navigation, Background, padding, fullscreen + gear icons). It branches on `pathname`. Any new route that needs special chrome — typically a full-bleed scene with no nav (`/onboarding`, `/letter/[token]`, future cinematic screens) — MUST be added as an explicit case here. Don't rely on the page's own `layout.tsx` to fight the global chrome.
2. **Background + theme bg colour**. The `Background` component renders the theme's particles. The body background colour is set globally by `LayoutContent`'s `useEffect` from `useThemeStore().theme.bg.primary`. New routes either render `<Background />` (preferred — particles match the theme) or rely on body bg alone (no particles). They should NEVER set their own `bg-[#xxxxxx]` on a wrapping div — that hides the theme.
3. **Theme-aware text/border colours via `useThemeStore`**. Tailwind arbitrary values like `text-[#3d342a]` are baked at build time and ignore the runtime theme. For any colour that needs to follow the theme, read it from `useThemeStore` in a client component and apply via inline style (`style={{ color: theme.text.primary }}`). Static brand colours (the dark button on the landing CTA, etc.) can stay as Tailwind literals — those are intentional brand constants, not user-themed UI.

When you create a new route, the mental checklist is: *Does this need the nav bar? Does the background need to match the theme? Will my text/borders still look right on every theme (rivendell dark, rose light, sunset, etc.)?* Walk through `LayoutContent` first, then style your components against `useThemeStore`.

### Component Patterns
- `Background.tsx`: Renders theme-specific particles/effects
- `Editor.tsx`: TipTap editor with song embed and doodle support
- `MoodPicker.tsx`: 5-level mood selector (0=Heavy → 4=Radiant)
- Zustand stores persist to localStorage for theme/cursor preferences

### Journal Entry Editing Rules (Time-Locked Autosave)
Entries are persisted via DB autosave (no Save button, no localStorage drafts):
- **First change**: typing/photo/song/doodle on the new-entry spread fires a debounced (1500ms) `POST /api/entries`, creating the entry. Subsequent changes `PUT /api/entries/[id]`.
- **Within calendar day of `createdAt`**: entry is fully editable — text, photos, song, doodle, mood can all be modified freely. The new-entry spread stays bound to the active entry until the user clicks "New Entry."
- **After calendar-day flip**: entry locks. Existing content (text, photos, song, doodle, mood) becomes **read-only**. Only empty slots remain fillable: if a photo slot is empty you can add a photo, if no song you can add one, if blank lines remain you can write there. Existing content can never be overwritten.
- **Calendar-day comparison**: client uses local `Date.toDateString()`; server uses the `X-User-TZ` IANA header (defaults to UTC). Both sides must agree.
- **v1 scope (currently shipped)**: only the new-entry spread is editable. Locked entries display read-only without empty-slot fillers (a v2 follow-up). Multi-entry-per-day works via "New Entry" in the entry selector — flushes the active entry's autosave, then starts a fresh one.

Server enforcement lives in `src/lib/entry-lock.ts` (`isEntryLocked` + `validateAppendOnlyDiff`). Client mirror in `src/lib/entry-lock-client.ts`. Autosave is the `useAutosaveEntry` hook in `src/hooks/`.

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Auth (pick one)
USE_DEV_AUTH=true
DEV_JWT_SECRET=<min-32-chars>
# OR
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Encryption
ENCRYPTION_KEY=<64 hex chars: openssl rand -hex 32>

# Payments — Dodo Payments
DODO_API_KEY=...
DODO_ENVIRONMENT=test_mode   # test_mode | live_mode
DODO_PRODUCT_MONTHLY=...      # Dodo product id for the monthly plan
DODO_PRODUCT_YEARLY=...       # Dodo product id for the yearly plan
DODO_WEBHOOK_SECRET=...       # Standard Webhooks signing secret (whsec_...)

# Email & Cron
RESEND_API_KEY=...
CRON_SECRET=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3111
```
