# Conventions

## Encryption (read `docs/encryption-strategy.md` before touching crypto)
Three tiers, choose by content type:
- **Tier 1 E2EE** (browser-only, master key, AES-256-GCM, server can't decrypt): journals, letters, scrapbook items, photos, doodles.
- **Tier 2 server-encrypted** (`lib/encryption.ts` `encryptJson`/`decryptJson` under `ENCRYPTION_KEY`): `User.profile` (nickname/birthday — needed by reminder cron), `StrangerNote.text`/`StrangerReply.text` (moderation needs server reads).
- **Tier 3 plaintext**: schedules, recipient emails, status flags, IDs.

## Photos / images
All image bytes go through `POST /api/photos` ONLY. Read back via `GET /api/photos/{handle}` (auth + owner-scoped). Display via `usePhotoSrc`. Never inline `data:` URLs into entries/scrapbook. E2EE-on stores encrypted `{handle,iv}` ref on the row, never the bare handle. Code: `components/desk/PhotoBlock.tsx`, `components/scrapbook/ScrapbookCanvas.tsx`.

## Themes (10 in `lib/themes.ts`)
New routes MUST integrate the active theme via 3 pieces:
1. `components/LayoutContent.tsx` — gatekeeper for nav/Background/padding; branches on pathname. Full-bleed/no-nav routes need an explicit case here.
2. Background + body bg from `useThemeStore().theme.bg.primary`. Never set own `bg-[#xxxxxx]` on a wrapper — hides the theme.
3. Theme-aware colors via `useThemeStore` + inline `style={{color: theme.text.primary}}`. Tailwind arbitrary `text-[#...]` is build-baked, ignores runtime theme (ok only for brand constants).

## Migrations
**Additive-only.** Never delete data/columns. New cols with defaults / optional fields. If Prisma warns of data loss, find another way.

## Entry editing (time-locked autosave)
DB autosave, no Save button. Debounced 1500ms POST creates entry, then PUT. Editable within calendar day of `createdAt`; after day-flip entry locks (existing content read-only, only empty slots fillable). Enforcement: `lib/entry-lock.ts` (`isEntryLocked`, `validateAppendOnlyDiff`); client mirror `lib/entry-lock-client.ts`; hook `useAutosaveEntry`. Calendar-day: client `Date.toDateString()`, server `X-User-TZ` header (default UTC) — must agree.

## React 19 gotcha
Never pass text as JSX children inside a contentEditable div — causes cursor reset. Let useEffect + ref.innerText own DOM content.

## Workflow prefs (user)
- Skip formal/unit tests by default; implement directly, verify manually in dev. (`npm run test` exists but isn't the norm.)
- Match scope tightly for visual changes — narrowest delta, no bundled cleanups.
- Public-facing copy says **Meethril**, never Hearth.
