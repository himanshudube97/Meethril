# Friend Letters E2EE Design (Phase 4)

**Status:** Approved design — implementation plan to follow.
**Master spec:** [`2026-05-15-e2ee-first-architecture.md`](../plans/2026-05-15-e2ee-first-architecture.md) (Phase 4 outline).
**Predecessor:** [`2026-05-15-letter-table-extraction.md`](../plans/2026-05-15-letter-table-extraction.md) (Phase 2, shipped; `Letter` and `LetterDelivery` schemas + dual-read live).
**Scope note:** This phase folds in the master spec's Phase 3 (self-letter writes through the new `Letter` model). Legacy cleanup (drop `JournalEntry` letter fields, drop dual-read, drop `LetterAccessToken`, drop the deliver-letters cron) is **out of scope** for this phase; it's a follow-up Phase 5-cleanup once Phase 4 is verified end-to-end.

---

## Why this phase exists

Today's friend-letter flow is broken for E2EE-onboarded users: the compose path encrypts content with the sender's master key, but the delivery flow at `/letter/[token]` calls `safeDecrypt` on the server — server-encrypted (Hearth-readable) only. Any letter sent by a Phase-1-onboarded user delivers as garbled ciphertext. Phase 4 fixes this by replacing the entire friend-letter pipeline with a time-lock-encrypted (tlock) delivery model that is unreadable by Hearth's servers at every lifecycle stage and is delivered without a cron, via Resend's `scheduled_at`.

Phase 4 also moves self-letter writes onto the new `Letter` model (folded-in Phase 3 of the master spec), so both letter types use the new table from this point forward and we close the write-path side of the Phase 2 migration.

## Architecture

The Phase 4 system has three independent surfaces that meet in the middle.

### Surface 1 — Sender's compose & write

Runs client-side with the master key in memory.

**Self-letter path:**
1. User composes in existing `ComposeView`, picks self-recipient, picks `unlockDate`.
2. Client encrypts content (text + photos refs + song + doodle refs serialized as JSON) with master key → AES-256-GCM ciphertext + IVs.
3. `POST /api/letters/self` with `{contentCiphertext, contentIVs, title?, titleIV?, scheduledFor, letterLocation}`.
4. Server creates a `Letter` row: `letterType='self'`, `encryptionType='e2ee'`, the ciphertext blob, scheduledFor. **No `LetterDelivery` row.** **No `JournalEntry` write.**

**Friend-letter path:**
1. Same compose flow, but recipient is a friend (recipientEmail required, delay constrained to 7–30 days inclusive — Resend's cap).
2. Client generates a random 32-byte ephemeral key `K` via `crypto.getRandomValues`.
3. Client AES-256-GCM-encrypts the letter content with `K` → `transientCiphertext` + `transientIV`.
4. Client computes the drand round number for `scheduledFor` against quicknet (3-second rounds, genesis from chain info) and calls `tlock-js`' `timelockEncrypt(K, roundNumber)` → `tlockedKey` (an Age-format armored blob).
5. `POST /api/letters/friend` with `{transientCiphertext, transientIV, tlockedKey, recipientEmail, recipientName, scheduledFor, letterLocation?, senderName?}`.
6. Server creates a `Letter` row (`letterType='friend'`, owner = sender, **no content blob**, just plaintext metadata: recipient, scheduledFor, letterLocation, senderName) + a `LetterDelivery` row (`transientCiphertext`, `transientIV`, `tlockedKey`, fresh `publicToken`).
8. Server calls Resend `scheduled_at` with `from` from env (`RESEND_FROM_LETTERS`), `to` = recipient email, body containing the link `${NEXT_PUBLIC_APP_URL}/letter/<publicToken>#k=<base64-tlockedKey>`.
9. Server stores the returned `resendEmailId` on the `LetterDelivery`.

**Server invariant:** at no point during write does the server see plaintext content or `K`. The server holds `transientCiphertext` (decryptable only with `K`) and `tlockedKey` (decryptable only after `scheduledFor` via drand). Even with full DB access, Hearth cannot read.

### Surface 2 — Recipient read

No auth required. Pure client-side.

1. Email arrives at `scheduledFor` (Resend delivers).
2. Recipient clicks the link. `/letter/[token]` is a client-only page.
3. Client reads `tlockedKey` from `window.location.hash` (the fragment is never sent to the server).
4. Client calls `GET /api/letter/[token]/meta` (public, no auth, no content) → returns `{scheduledFor, senderName, recipientName, alreadyExpired}` (sender/recipient names only if the sender included them as **plaintext** metadata; encryptedReceiptMetadata is sender-only).
5. Client uses `drand-client` to fetch the quicknet beacon for the round matching `scheduledFor`. Tlock-decrypts `tlockedKey` → `K`.
6. Client calls `GET /api/letter/[token]/ciphertext` → server checks `firstReadAt`:
   - If null → set to `now()`, return `{transientCiphertext, transientIV}`.
   - If set and `firstReadAt + 24h >= now()` → return same blob.
   - If set and `firstReadAt + 24h < now()` → return `410 Gone {reason: 'expired'}`.
7. Client AES-decrypts with `K` → renders. 24-hour countdown displayed.

### Surface 3 — Recipient save, sender receipt, ask-for-copy

**Keep forever (logged-in recipient):**
1. Recipient (already a Hearth user, master key in memory) clicks "Keep forever" within the 24h window.
2. Client re-encrypts the in-memory decrypted content under the recipient's master key → ciphertext + IVs.
3. `POST /api/letters/save-received` with `{publicToken, contentCiphertext, contentIVs}`.
4. Server creates a `Letter` row: `letterType='received-friend'`, owner = recipient, full content blob, `originalSenderId` and `originalLetterId` populated. Sets `LetterDelivery.savedByRecipientAt = now()` AND mirror onto the sender's `Letter.savedByRecipientAt` (so the sender's receipt UI can show "Saved" + the "Ask for copy" button becomes available for paid senders).

**Keep forever (non-Hearth recipient):**
1. Client persists the decrypted content blob to `sessionStorage` keyed on `publicToken`.
2. Client navigates to `/letter/[token]/save` — a new page in the same tab. **Critical**: the OTP flow is code-based (the existing `/api/auth/resend-otp` infra sends a 6-digit code that the user enters in a form, not a magic-click link). So the whole flow happens in one tab and `sessionStorage` survives.
3. `/letter/[token]/save` collects the recipient's email (pre-filled from the meta endpoint), sends OTP via the existing `resend-otp` route, user enters code → user account created.
4. New user is routed through the existing Phase 1 `E2EEOnboardingModal` (passphrase + recovery key + final confirm). This still lives in the same tab — sessionStorage persists.
5. After onboarding completes, the save page picks the decrypted blob back up from `sessionStorage`, re-encrypts under the freshly-set master key, calls `POST /api/letters/save-received`, wipes the sessionStorage entry.
6. User lands in `/me` with the kept letter visible in their inbox.
7. **Tab-close edge case**: if the user closes the tab partway through, the sessionStorage is gone. They can reopen the original `/letter/<token>` link if still within the 24h window — that re-decrypts, and they can retry "Keep forever". Past 24h, no recovery (this is documented as a tradeoff in the privacy copy).

**Sender receipt:**
- Existing "sent letters" view (`/letters/sent` API route) is already reading from `Letter` via Phase 2 dual-read; in Phase 4 it reads native `Letter` rows (sourceJournalEntryId null) with the same response shape.
- Receipt row shows: recipient name (from encryptedReceiptMetadata, decrypted client-side), scheduledFor, status timeline (Scheduled / Delivered / Opened / Saved / Faded / Bounced) sourced from `Letter.deliveredAt`, `Letter.firstReadAt`, `Letter.savedByRecipientAt`, `Letter.bouncedAt`, plus `transientExpiresAt` from the `LetterDelivery` if it still exists.
- No content shown ever — sender's row has no content blob.

**Ask for copy (paid):**
1. When a sender's `Letter.savedByRecipientAt` is set AND `isPaidUser(sender)` is true, the receipt row shows "Ask <Name> for a copy."
2. Click → `POST /api/letters/[id]/ask-for-copy` → server emails the recipient: "Sarah wants a copy of the letter you saved. Send one back?" (from = `RESEND_FROM_LETTERS`, link to `${NEXT_PUBLIC_APP_URL}/me?ask-back=<senderId>`).
3. Recipient lands in `/me` with the ask-back banner highlighting the saved letter. Click "Send a copy back" → opens compose pre-filled with the saved letter content, recipient = original sender, scheduledFor default = `now() + 1d` (configurable up to 30d).
4. From here the flow is just a new friend-letter send, going through Surface 1 → Surface 2 → Surface 3 again, in reverse.

### Crons

Two daily crons. Both authenticated by `CRON_SECRET` (existing pattern).

**`/api/cron/self-letter-reminders`** — replaces the self-letter half of the existing `/api/cron/deliver-letters` route. Finds `Letter where letterType='self' AND scheduledFor <= now() AND deliveredAt IS NULL`. Sends a no-content nudge email (from = `RESEND_FROM_LETTERS`, subject "Your letter is ready"). Sets `Letter.deliveredAt`. Content stays in Hearth's encrypted DB until the user opens the app and the in-app reveal modal decrypts client-side.

**`/api/cron/letter-cleanup`** — hygiene only, not delivery. Deletes `LetterDelivery` rows where `firstReadAt + 24h < now()` OR `(firstReadAt IS NULL AND createdAt + 60d < now())`. The backing sender's `Letter` row persists with status fields preserved. Without this cron the read endpoint already returns 410 past 24h; the cron just sweeps the dead rows out of Postgres.

**No friend-letter delivery cron exists.** Resend's `scheduled_at` is the only delivery mechanism for friend letters.

## Data model deltas

`Letter` and `LetterDelivery` schemas already exist (Phase 2). **No new schema in Phase 4 — zero migrations.** Field usage clarifications below.

- **Self letters**: `letterType='self'`, `contentCiphertext` + `contentIVs` populated (`contentIVs` is `{content: '<hex-iv>'}`), `encryptionType='e2ee'`, `scheduledFor` = unlock date, `deliveredAt` set when the reminder cron runs, `firstReadAt` set when the user opens the in-app reveal, `delivery` relation is null. **`sourceJournalEntryId` stays null for natively-created rows.**
- **Friend letters (sender's receipt)**: `letterType='friend'`, **`contentCiphertext` is null**, `title` / `titleIV` stay null in Phase 4 (no sender-set title in the current compose UI; could be added later), `recipientEmail` / `recipientName` / `senderName` / `letterLocation` / `scheduledFor` populated as plaintext (server needs them for the Resend email and for cron jobs), `encryptionType='e2ee'`.
- **Friend letters (LetterDelivery row)**: `transientCiphertext`, `transientIV`, `tlockedKey`, `publicToken`, `resendEmailId`, `firstReadAt`, `transientExpiresAt`. All fields already in the schema.
- **Received-friend (recipient's kept copy)**: `letterType='received-friend'`, full content blob under recipient's master key (`contentCiphertext` + `contentIVs`), `originalSenderId` and `originalLetterId` set. **`scheduledFor` mirrors the original** (so the recipient's inbox can show "saved on date X, originally written for date Y" if useful).

### Migration

None. The Phase 2 schema covers everything Phase 4 needs.

The transitional `e2eeIV` / `e2eeIVs` / `encryptionType` fields are not used by Phase 4 writes (those are legacy/backfill artifacts). Phase 5-cleanup drops them.

## API surface

New routes:

| Route | Method | Auth | Body / Response | Purpose |
|---|---|---|---|---|
| `/api/letters/self` | POST | yes (sender) | in: `{contentCiphertext, contentIVs, scheduledFor, letterLocation?, title?, titleIV?}` → `Letter` | Native self-letter write |
| `/api/letters/friend` | POST | yes (sender) | in: `{transientCiphertext, transientIV, tlockedKey, recipientEmail, recipientName, scheduledFor, letterLocation?, senderName?}` → `{letterId, publicToken}` | Native friend-letter write + schedule Resend |
| `/api/letter/[token]/meta` | GET | none | → `{scheduledFor, alreadyExpired, senderName?, recipientName?}` | Public metadata read |
| `/api/letter/[token]/ciphertext` | GET | none | → `{transientCiphertext, transientIV}` or `410 {reason: 'expired'\|'not_found'}` | First call sets `firstReadAt`; later calls within 24h return same blob |
| `/api/letters/save-received` | POST | yes (recipient) | in: `{publicToken, contentCiphertext, contentIVs}` → `Letter` | Re-encrypt-and-keep |
| `/api/letters/[id]/ask-for-copy` | POST | yes (sender, paid) | → `{ok: true}` | Email recipient with the ask-back prompt |
| `/api/webhooks/resend` | POST | signature-verified | Resend payload | Sets `Letter.deliveredAt` on `email.sent`; `Letter.bouncedAt` + `bouncedReason` on `email.bounced` |
| `/api/cron/self-letter-reminders` | GET | CRON_SECRET | → `{processed, errors}` | Self-letter reminder nudges |
| `/api/cron/letter-cleanup` | GET | CRON_SECRET | → `{deleted}` | Sweep expired LetterDelivery rows |

Existing routes — relationship for Phase 4:
- `/api/letters/inbox`, `/sent`, `/arrived`, `/mine`, `/received`, `/[id]/peek`, `/[id]/viewed`, `/[id]/read` — **continue to dual-read** via the Phase 2 helper. They'll see new native `Letter` rows automatically.
- `/api/letter/[token]` (old `LetterAccessToken` route) — **untouched in Phase 4**. Existing 3 test letters in dev still resolve through it; new letters go through the new `/api/letter/[token]/*` endpoints. Phase 5-cleanup drops it.
- `/api/cron/deliver-letters` — **untouched in Phase 4**. It still tries to deliver legacy `JournalEntry`-shaped friend letters via `LetterAccessToken`, but since no new letters will be written that way (compose flow switches in this phase), it just keeps running over an empty set. Phase 5-cleanup deletes it.
- `/api/entries/[id]/seal` — **untouched in Phase 4** for the same reason: nothing new writes letter-shaped JournalEntry rows.

## Client work

### Compose flow

`src/components/letters/compose/ComposeView.tsx` and `SealModal.tsx` currently call `POST /api/entries` + `POST /api/entries/[id]/seal` to create and seal a letter-shaped `JournalEntry`. Phase 4 replaces the seal-time send action with a single new call:

- On seal-and-send, branch on recipient type:
  - **Self**: serialize content → encrypt with master key → `POST /api/letters/self` → done.
  - **Friend**: generate `K` → encrypt content with `K` → tlock-encrypt `K` against quicknet round for `scheduledFor` → optionally encrypt title with master key → `POST /api/letters/friend` → done.
- The compose draft that currently lives as a `JournalEntry` row stays unchanged — drafts (pre-seal) keep working on JournalEntry, only the **seal/send** moment switches to the new Letter API. After a successful send, the draft `JournalEntry` is deleted (or marked `entryType='normal'` so it doesn't show up in inbox queries) — keeps the existing autosave flow intact, just changes the destination at send time.
- After successful send, navigate user to the existing sent-letters view (which already serves the new `Letter` rows via Phase 2 dual-read).
- The current 7-day-minimum date picker in `SealModal` stays; we add a 30-day-max ceiling for friend letters (Resend's cap). Self-letters keep no upper bound.

### Recipient page

`src/app/letter/[token]/page.tsx` replaces today's server-decrypt page with a client-only page that:
- Reads fragment → meta fetch → drand fetch → tlock-decrypt → ciphertext fetch → AES-decrypt → render.
- Shows a tasteful loading state (drand fetch is ~200ms).
- Shows the 24-hour countdown.
- Shows "Keep forever" CTA when within window.
- On click of "Keep forever": if logged in + onboarded → save inline; else → sessionStorage + navigate to `/letter/[token]/save` magic-link flow.
- On expiry: tasteful "this letter has faded" state. No content rendered.

New: `src/app/letter/[token]/save/page.tsx` for the magic-link save flow.

### Sender receipt

The existing sent-letters UI gets a small refresh — `recipientName` is already plaintext on the Letter row, so it renders directly. Status timeline is composed from existing fields (`deliveredAt`, `firstReadAt`, `savedByRecipientAt`, `bouncedAt`, and "Faded" derived client-side as `LetterDelivery is null AND firstReadAt is not null`). The "Ask for copy" button gates on `Letter.savedByRecipientAt !== null && isPaidUser(sender)`. `isPaidUser` reads `User.subscriptionStatus` (existing Lemon Squeezy field — same gate the rest of the app already uses).

## Crypto module layout

`src/lib/letters/tlock.ts` (new):
- `roundFromDate(date: Date): number` — pure helper. Computes the quicknet round number from a date given the chain genesis time and 3s period (fetched once at module init).
- `tlockEncryptKey(key: Uint8Array, unlockDate: Date): Promise<string>` — uses `tlock-js` + quicknet chain info, returns Age-format string (base64-armored).
- `tlockDecryptKey(tlocked: string, unlockDate: Date): Promise<Uint8Array>` — fetches the matching drand round via `drand-client` (with the env-provided API URLs as redundant endpoints), decrypts.
- Quicknet endpoints (`DRAND_API_URLS`) and chain hash (`DRAND_CHAIN_HASH`) come from environment. The chain info (genesis time, period, public key) is fetched once at module init from `${urls[0]}/${chainHash}/info` and memoized.

`src/lib/letters/transient-crypto.ts` (new):
- `encryptTransient(plaintext: Uint8Array, key: Uint8Array): {ciphertext, iv}` — AES-256-GCM with a fresh IV.
- `decryptTransient(ciphertext: Uint8Array, iv: Uint8Array, key: Uint8Array): Uint8Array`.
- Thin wrapper over WebCrypto — separate from `src/lib/e2ee/crypto.ts` only for clarity (master-key crypto stays where it is).

## Environment variables (added in this phase)

All new values are env-driven; nothing hardcoded.

```bash
# Resend identities (NEW — Phase 4 routes must use these; existing email.ts hardcodes get cleaned up in Phase 5)
RESEND_FROM_LETTERS=Hearth <letters@hearth.app>
RESEND_FROM_SYSTEM=Hearth <hello@hearth.app>
RESEND_WEBHOOK_SECRET=whsec_xxx  # for /api/webhooks/resend signature verification

# Drand network (NEW)
DRAND_CHAIN_HASH=52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971  # quicknet
DRAND_API_URLS=https://api.drand.sh,https://api2.drand.sh,https://api3.drand.sh

# Existing — referenced, not redefined
NEXT_PUBLIC_APP_URL  # used to build /letter/<token>#k=... links
RESEND_API_KEY
CRON_SECRET
```

Documented in `CLAUDE.md`'s env section as part of Phase 4 work.

## Dependencies

```bash
docker compose exec app npm install tlock-js drand-client
```

- `tlock-js@0.9.0` — last published March 2024, not deprecated, not actively maintained. **Task 0 of the implementation plan is a compatibility smoke test.** If it doesn't install or doesn't round-trip on the current Node 22 / Next.js 16 stack, we replan before writing any of the architecture.
- `drand-client@1.2.5` (transitively required by tlock-js; we use it directly too) — actively maintained.

## Threat model and honest claims

- **Server cannot read** during the wait window (drand round hasn't happened yet) or after delivery (server deleted nothing — it never had `K`, only `tlockedKey`).
- **Recipient's email holds the key** after delivery. If the inbox is compromised, the letter is compromised. We say so in the privacy copy.
- **24-hour read window is server-enforced**, but a determined attacker could mirror the response of the first `GET /ciphertext` call. This is acceptable because (a) the ciphertext isn't useful without `K` from the email, and (b) we don't claim the 24-hour window is a cryptographic guarantee — only a UX guarantee.
- **Sender holds only a receipt.** Even with sender DB access, no content can be recovered after the LetterDelivery row is cleaned up. The receipt-metadata blob is sender-encrypted (master key) and only contains display-data (recipient name, scheduledFor, optional title) — never letter content.
- **The "Keep forever" save** re-encrypts under the recipient's master key on the recipient's device. Hearth never sees the plaintext during the save.

## Out of scope (for Phase 4)

Belongs to Phase 5-cleanup:
- Drop `LetterAccessToken` table.
- Drop `/api/letter/[token]` (old) route and `/api/cron/deliver-letters` cron.
- Drop dual-read fallback in `/api/letters/*` routes — read native `Letter` only.
- Drop `entryType`, `unlockDate`, `isSealed`, `recipientEmail`, `recipientName`, `senderName`, `letterLocation`, `isDelivered`, `deliveredAt`, `isViewed`, `letterPeekedAt`, `isReceivedLetter`, `originalSenderId`, `originalEntryId` from `JournalEntry`.
- Drop `encryptionType` from `Letter` (always `e2ee` post-Phase-4 for native rows).
- Remove the hardcoded `from: 'Hearth <letters@hearth.app>'` in the existing `src/lib/email.ts` and switch the legacy email helpers to env-driven addresses too.

Belongs to Phase 5 (stranger notes moderation + paid tier) or Phase 6 (existing-entries re-encryption) per master spec — not touched here.

## Verification approach

Per project convention (and `~/.claude/.../feedback_skip_tests.md`), no unit tests added. Verification:

- **Task 0 smoke test**: round-trip encrypt/decrypt with `tlock-js` on a 5-second-future unlock, then a now-elapsed unlock. Both must work.
- **Schema**: `npx prisma validate`, `npx prisma migrate status`.
- **End-to-end manual smoke (final task)**:
  1. As dev user A: compose a friend letter to a dev user B's email, scheduledFor = now + 1 minute. Verify Resend `scheduled_at` accepts.
  2. Wait. Email arrives. Click link in incognito (or different dev user).
  3. Read the letter. Inspect DB: `transientCiphertext` is unrelated to plaintext even when `ENCRYPTION_KEY` is known.
  4. Click "Keep forever". Verify magic-link signup flow if recipient isn't a Hearth user.
  5. Verify recipient's `/me` shows the saved letter, encrypted under their new master key.
  6. Back in sender A's account, verify the receipt shows "Saved" and the "Ask for copy" button appears (gate behind isPaidUser stub if needed).
  7. As sender A: write a self-letter for tomorrow. Manually trigger `/api/cron/self-letter-reminders` via authenticated POST in dev. Verify nudge email arrives and `deliveredAt` is set.
  8. Open the app as sender A. In-app reveal modal shows the self-letter; decrypts client-side with master key.
- **Telemetry sanity**: no plaintext letter content ever appears in server logs.

## Open questions resolved during brainstorming (record)

1. **Cleanup phasing** → Phase 5-cleanup after Phase 4. Smaller plans, destructive migrations isolated from feature work.
2. **Self-letter reminder cron** → ship in Phase 4 (folds master spec's Phase 3 in fully).
3. **Ask-for-copy paid feature** → build full flow in Phase 4, gate the button behind `isPaidUser` (existing subscription gate). Works the day dodo-payments lands.
4. **Magic-link Keep forever** → full flow: email OTP → forced E2EE onboarding → re-encrypt → save. Primary growth lever per master spec.
5. **Friend-letter delivery cron** → none. Resend `scheduled_at` is the only delivery mechanism. Confirmed Resend supports up to 30 days.
6. **Friend-letter delay bounds** → 7 days minimum (existing SealModal rule), 30 days maximum (Resend cap). Self-letters keep no upper bound.
7. **Hardcoded `from` addresses** → all new email sends in Phase 4 use env-driven `from`. Existing hardcoded values in `src/lib/email.ts` are out-of-scope cleanup (Phase 5).
8. **tlock-js staleness** → flagged; Task 0 of the plan is a compatibility smoke test before any architecture is built.
