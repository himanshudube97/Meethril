# Letters in Hearth — Architecture & Current State

> **Snapshot:** 2026-05-16. Reflects the state of branch `feat/e2ee-onboarding` after Phase 4 (friend letters with tlock), Phase 4.1 (photo + doodle assets), and Phase 5 cleanup (legacy infrastructure removed — `LetterAccessToken`, dual-read JournalEntry fallback, `Letter` transitional columns, and 13 letter-specific columns on `JournalEntry` all dropped).
> **Read this when:** you're about to touch any code under `src/app/api/letters/*`, `src/app/api/letter/*`, `src/app/letter/*`, `src/lib/letters/*`, or the compose flow under `src/components/letters/compose/*`.

---

## 1. Three letter types, three privacy models

Letters are time-delayed messages a user writes either to themselves, to a friend by email, or anonymously to a stranger. Each has a different encryption story because the constraints are different. Out of these three, only **self** and **friend** are covered by this doc — stranger notes are a separate feature (see `docs/superpowers/specs/2026-05-03-stranger-notes-design.md`).

| Type | Crypto | Delivery | Owner of content | Server can read? |
|---|---|---|---|---|
| **Self** | Master key (E2EE) | Daily cron sends a nudge; in-app reveal on/after `scheduledFor` | Sender | Never |
| **Friend** | Random K + tlock(K) | Resend `scheduled_at` email at `scheduledFor`; 24h read window | Sender holds only a receipt (no content). Recipient can `Keep forever` → own E2EE copy. | Never |

> "E2EE" in Hearth means: the user's master key never leaves the browser. The master key is unwrapped from `User.encryptedMasterKey` using a key derived from the user's passphrase via PBKDF2 (100k iters, SHA-256). Master key lives in `useE2EEStore` (zustand) as a `CryptoKey` reference. AES-256-GCM with 96-bit random IVs is used everywhere underneath.

---

## 2. Data model (the Phase 2 + Phase 4 surface)

Three Postgres tables matter:

### `JournalEntry`
- Hosts the **draft** of a letter while the user is still composing (autosave goes here). Once sealed, the draft row is deleted.
- ~~Also hosts pre-Phase-4 legacy letters with `entryType in ('letter','unsent_letter')`.~~ Post-Phase-5 cleanup: legacy letter rows on `JournalEntry` are gone, and the 13 letter-specific columns on `JournalEntry` are dropped. `entryType` remains because the draft autosave still uses it to distinguish drafts during compose.
- Phase 7 (cleanup, future) drops all the letter-specific columns from this model.

### `Letter` (new in Phase 2, written natively in Phase 4)
- `letterType: 'self' | 'friend' | 'received-friend'`.
- `contentCiphertext`, `contentIVs` (Json: `{content: iv}`) — populated for `self` and `received-friend`. **`null` for `friend`** (the sender's receipt has no content blob).
- `recipientEmail`, `recipientName`, `senderName`, `letterLocation` — plaintext metadata. Server needs these for the Resend email and for cron jobs.
- `scheduledFor` — plaintext unlock date.
- `firstReadAt`, `savedByRecipientAt`, `bouncedAt`, `bouncedReason` — lifecycle markers.
- `sourceJournalEntryId` — set on Phase 2 backfilled rows, **null on Phase 4 native rows**. Phase 7 drops it.
- `encryptionType` — legacy field, always `'e2ee'` for Phase 4 native rows. Phase 7 drops it.
- `originalSenderId`, `originalLetterId` — populated on `received-friend` rows pointing back to the original sender's `friend` receipt.

### `LetterDelivery` (Phase 2 schema, populated in Phase 4)
- The transient vessel for **friend letters only**. Self letters never get a row here.
- `transientCiphertext`, `transientIV` — letter content (text + song + inline doodles) encrypted under a random per-letter K.
- `tlockedKey` — K time-lock-encrypted against the drand quicknet round for `scheduledFor`.
- `publicToken` — 24-byte base64url random; appears in the URL path (`/letter/<publicToken>`).
- `resendEmailId` — populated after the Resend `scheduled_at` call.
- `firstReadAt`, `transientExpiresAt` — 24h read window markers.
- Cleanup cron deletes rows past 24h post-firstRead or 60d unread. The parent `Letter` row persists. Cascade FK deletes the `LetterDeliveryAsset` rows alongside.

### `LetterDeliveryAsset` (Phase 4.1, populated for friend letters with photos)
- Out-of-band photo storage. One row per attached photo. Doodles are inlined into `LetterDelivery.transientCiphertext`, not stored here.
- `deliveryId` — FK to `LetterDelivery` with `ON DELETE CASCADE`. When the parent delivery expires, the assets go with it for free.
- `ciphertext` (text), `iv` — photo bytes encrypted under the same K as the parent delivery's transient ciphertext. Recipient already has K from the URL fragment + tlock; one fetch per asset, one decrypt per asset.
- `type` — `'photo'` (`'doodle'` reserved for future per-stroke separation).
- `position`, `spread`, `rotation`, `ordinal` — plaintext layout metadata. Server-readable because it's not sensitive (positions on a card, not content).

### `Letter.keptPhotoRefs` (Phase 4.1, populated on `received-friend` rows after Keep-forever)
- JSON column on `Letter`. Array of `{encryptedRef, encryptedRefIV, position, spread, rotation, ordinal}` — refs to the recipient's own `EncryptedBlob` rows (uploaded via `/api/photos` after re-encrypting under the recipient's master key).
- Null for self letters, friend-sender receipts, and `received-friend` letters with no photos.
- Drops in Phase 7 if we ever normalize this into a proper photo-relation on `Letter`.

---

## 3. Self-letter flow

### Write (sender, client → server)
1. User composes; `useAutosaveEntry` debounces a `POST /api/entries` then `PUT /api/entries/[id]` — the draft lives as a `JournalEntry`. The draft `entryType` is `'letter'` and is **E2EE-encrypted under the master key** by the autosave hook.
2. User taps "seal." [src/components/letters/compose/ComposeView.tsx:259-307](../src/components/letters/compose/ComposeView.tsx#L259-L307) calls `handleSeal`:
   - `autosave.flush()` — guarantees the draft row exists.
   - Asserts `masterKey` is present.
   - `buildSelfLetterPayload({ draft, unlockDate, masterKey })` — [src/lib/letters/self-letter-client.ts:23-41](../src/lib/letters/self-letter-client.ts#L23-L41) — serializes `{text, song, photos, doodles}` as JSON and `encryptString`s it under the master key. Returns `{contentCiphertext, contentIVs: {content: iv}, scheduledFor, letterLocation}`.
   - `POST /api/letters/self` with `{...payload, draftEntryId}`.
3. [src/app/api/letters/self/route.ts:46-66](../src/app/api/letters/self/route.ts#L46-L66) creates `Letter { letterType: 'self', encryptionType: 'e2ee', contentCiphertext, contentIVs, scheduledFor, isSealed: true }` and **deletes the draft `JournalEntry`** (best-effort `.catch(() => {})`).

### Delivery reminder (server-side, scheduled)
- Daily cron at [src/app/api/cron/self-letter-reminders/route.ts](../src/app/api/cron/self-letter-reminders/route.ts) finds `Letter` rows with `letterType='self' AND deliveredAt IS NULL AND scheduledFor <= now()`.
- Sends a no-content nudge email via `sendSelfLetterReminderEmail`. Marks `deliveredAt`. **Never decrypts** — the cron only `select`s metadata; `contentCiphertext` is not in the projection.
- Authenticated via `Authorization: Bearer $CRON_SECRET`.

### Reveal & decrypt (sender, in-app)

**⚠️ Currently broken** — see "Known bugs" below. No read route surfaces Phase 4 native self-letters. Intended flow:

1. Inbox displays letters where `scheduledFor <= now() AND firstReadAt IS NULL`.
2. User clicks → reveal modal fetches the row → client decrypts `contentCiphertext` with the master key (`decryptSelfLetterContent` in `self-letter-client.ts`) → renders.
3. Modal also marks `Letter.firstReadAt` so the inbox stops showing it.

### Invariants (verified by audit 2026-05-16)
- ✅ Server never sees plaintext content.
- ✅ Server never decrypts; cron projection excludes ciphertext.
- ✅ Encryption is AES-256-GCM under the user's master key, fresh 96-bit IV per letter.
- ⚠️ Draft delete is best-effort (`.catch(() => {})`) — low risk for E2EE drafts (ciphertext in DB), but fragile.

---

## 4. Friend-letter flow

### Write (sender, client)
1. `handleSeal` for `recipient.recipient === 'friend'` first fetches the draft entry (`GET /api/entries/{draftEntryId}`) to gather attached photos + doodles, then calls `buildFriendLetterPayload(...)` at [src/lib/letters/friend-letter-client.ts](../src/lib/letters/friend-letter-client.ts).
2. Inside the builder:
   - `K = crypto.getRandomValues(new Uint8Array(32))` — fresh ephemeral 256-bit key generated FIRST so it's available to bundle assets too.
   - `bundleFriendLetterAssets({photos, doodles, masterKey, K})` — [src/lib/letters/asset-bundler.ts](../src/lib/letters/asset-bundler.ts):
     - For each photo: `decryptString(encryptedRef, encryptedRefIV, masterKey)` → `{handle, iv}` → fetch `/api/photos/{handle}` → `decryptBytes(...)` with master key → re-encrypt the plaintext bytes under K via `encryptTransient`. The K-encrypted blob lands as a `LetterDeliveryAsset` row.
     - For each doodle: detect the `{encryptedStrokes, e2eeIV}` shape, decrypt with master key → plaintext strokes. **Doodles ride inline** in the transient body (small enough to embed).
   - `encryptTransient(plaintextJson, K)` — [src/lib/letters/transient-crypto.ts](../src/lib/letters/transient-crypto.ts) — AES-256-GCM with a fresh 96-bit IV over `{text, song, doodles}`. Photos do NOT ride in this blob — they ride out-of-band as asset rows.
   - `tlockEncryptKey(K, unlockDate)` — [src/lib/letters/tlock.ts](../src/lib/letters/tlock.ts) — computes the drand quicknet round number for `unlockDate` (3-second period) and passes K to `timelockEncrypt`. Returns an Age-format armored string.
   - `K.fill(0)` — best-effort memory wipe.
3. POST `/api/letters/friend` with `{transientCiphertext, transientIV, tlockedKey, recipientEmail, recipientName, scheduledFor, letterLocation, photoAssets}`. **No plaintext, no K.** `senderName` may be in the body but the server ignores it. `photoAssets` is an array of `{ciphertext, iv, type, position, spread, rotation, ordinal}` — each item is the K-encrypted bytes of one photo.

### Server-side write
[src/app/api/letters/friend/route.ts](../src/app/api/letters/friend/route.ts):
1. Validates: crypto fields present, email format, min lead time (currently 1 min in dev — see PRELAUNCH-TEST-PILLS), max 30 days, max 20 assets per letter.
2. **Derives `senderName` from the authenticated user** via `User.profile.nickname` → `User.name` → `'A friend'`. Client-supplied senderName is ignored.
3. `prisma.$transaction` creates `Letter { letterType: 'friend', contentCiphertext: null, ...metadata }` + `LetterDelivery { transientCiphertext, transientIV, tlockedKey, publicToken: randomBytes(24).toString('base64url') }` + `LetterDeliveryAsset[]` (createMany). Cascade FK on the delivery means cleanup (cron or rollback) deletes the assets automatically.
4. Calls `sendFriendLetterTransientEmail` — schedules a Resend email at `scheduledAt: scheduledFor.toISOString()`, body links to `${NEXT_PUBLIC_APP_URL}/letter/<publicToken>#k=<urlencoded-tlockedKey>`. From-address from `RESEND_FROM_LETTERS`. Stores returned `resendEmailId` on the delivery row.
5. **On Resend failure**: deletes both rows (currently as two separate `.delete()` calls — see bug #4 below).
6. Best-effort `journalEntry.deleteMany` of the draft.

### Recipient read (no auth)
[src/app/letter/[token]/page.tsx](../src/app/letter/[token]/page.tsx):
1. Client reads `tlockedKey` from `window.location.hash` (fragment never sent to the server).
2. `GET /api/letter/[token]/meta` — public, no auth — returns `{scheduledFor, senderName, recipientName, alreadyExpired, firstReadAt, assets}`. The `assets` array lists each `LetterDeliveryAsset` belonging to the delivery (just metadata: `{id, type, position, spread, rotation, ordinal}` — no ciphertext yet). If `scheduledFor` is still future → page renders "not_yet".
3. `tlockDecryptKey(tlockedKey, scheduledFor)` — fetches the drand round; throws until the round is produced (~3s after `scheduledFor`).
4. `GET /api/letter/[token]/ciphertext` — server-side:
   - Returns 404 / 425 ("not_yet") / 410 ("expired") on the obvious sad paths.
   - **Atomically claims `firstReadAt`** via `updateMany({where: {id, firstReadAt: null}, data: {firstReadAt: now, transientExpiresAt: now + 24h}})`. Only the request that finds it null wins. Mirrors `firstReadAt` onto the parent `Letter` row.
5. Client `decryptTransient(transientCiphertext, transientIV, K)` → plaintext JSON `{text, song, doodles}` → renders text + song + doodles.
6. For each asset in `meta.assets`: client fetches `GET /api/letter/[token]/asset/[assetId]` (24h gate identical to the ciphertext route, plus a path-token check to prevent asset-id grinding) → returns `{ciphertext, iv, position, spread, rotation, ordinal}` → client `decryptTransient(...)` with the same K → renders as a polaroid in [`LetterPhotos`](../src/components/letters/recipient/LetterPhotos.tsx).
7. Decrypted content + K (base64) + pre-fetched asset blobs are stashed in `sessionStorage` keyed on `publicToken` so the Keep-forever flow can pick it up across navigation.

### Keep forever (recipient → Hearth user)
[src/app/letter/[token]/save/page.tsx](../src/app/letter/[token]/save/page.tsx):
- **Logged-in recipient**: pulls cached blob (including K and the asset ciphertexts) from `sessionStorage`. For each asset: `decryptTransient(asset.ciphertext, asset.iv, K)` → plaintext bytes → `encryptBytes(bytes, masterKey)` → `POST /api/photos` (raw binary, returns `{handle}`) → pack into an `encryptedRef` (encrypted JSON of `{handle, iv}` under recipient's master key). Re-encrypts the text/song/doodles payload under the recipient's master key. `POST /api/letters/save-received` with `{publicToken, contentCiphertext, contentIVs, photoRefs}`. Server creates a `Letter { letterType: 'received-friend', contentCiphertext, contentIVs, keptPhotoRefs, ...originalIds }` and atomically mirrors `savedByRecipientAt` onto the original sender's `friend` row.
- **Logged-out recipient**: OTP signup → forced Phase 1 E2EE onboarding (passphrase + recovery key) → master key in memory → same save path. SessionStorage survives because the OTP flow stays in the same tab.

### Resend webhook
[src/app/api/webhooks/resend/route.ts](../src/app/api/webhooks/resend/route.ts) + [src/lib/letters/resend-webhook.ts](../src/lib/letters/resend-webhook.ts):
- Verifies Svix signature (HMAC-SHA256 over `svix-id.svix-timestamp.rawBody`) before any DB write. Uses `timingSafeEqual`. Secret from `RESEND_WEBHOOK_SECRET`.
- `email.sent`/`email.delivered` → `Letter.isDelivered=true, deliveredAt=now`.
- `email.bounced` → `Letter.bouncedAt=now, bouncedReason`.

### Cleanup cron
[src/app/api/cron/letter-cleanup/route.ts](../src/app/api/cron/letter-cleanup/route.ts):
- Deletes `LetterDelivery` rows where `firstReadAt < now-24h` OR (`firstReadAt IS NULL AND createdAt < now-60d`).
- Parent `Letter` rows persist with status fields intact. The receipt UI handles missing delivery gracefully ("Faded").

### Threat model (verified)
- **Server cannot read content during the wait**: tlock-encrypted K requires a drand round that doesn't exist yet.
- **Server cannot read content after delivery**: the server stored only `transientCiphertext` and `tlockedKey`. The URL fragment with `tlockedKey` was never sent to it. To recover K, you'd need access to the email itself.
- **The honest limit**: after delivery the letter is as private as the recipient's email account. If their inbox is compromised, the link → K → content is recoverable for as long as the LetterDelivery row exists (≤24h post-firstRead or ≤60d if never opened).
- **Sender holds no content**: even with full sender-account access, no content can be recovered after the LetterDelivery row is cleaned up.

---

## 5. Encryption strategy summary

```
                            ┌──────────────────────────────────────┐
                            │ Master key (CryptoKey, in-memory)   │
                            │ derived from passphrase via PBKDF2  │
                            │ 100k iters · stored wrapped in      │
                            │ User.encryptedMasterKey             │
                            └──┬─────────────────┬─────────────────┘
                               │                 │
              Self-letter ─────┤                 ├───── Received-friend
              (encrypt + decrypt by owner)       (encrypt + decrypt by recipient)
                                                        │
                                          ┌─────────────┘
                                          │
                                          │ re-encrypt after recipient read
                                          │
   ┌─────────────────┐                    │
   │ Friend letter   │                    │
   │ (sender side)   │                    │
   └────┬────────────┘                    │
        │                                  │
        │ generate K (random 32B)           │
        │ encrypt content with K (AES-GCM)  │
        │ tlock-encrypt K @ drand round     │
        │                                   │
        ▼                                   │
   ┌───────────────────────────────┐        │
   │ transientCiphertext + IV  ─── │        │
   │ tlockedKey                    │        │
   └────┬──────────────────────────┘        │
        │                                   │
        ▼                                   │
   Email (Resend scheduled_at, k= fragment)
        │
        ▼
   Recipient browser:
   1. fetch drand round (after scheduledFor)
   2. tlock-decrypt tlockedKey → K
   3. fetch ciphertext (sets server firstReadAt)
   4. AES-decrypt with K → plaintext
   5. (optional) "Keep forever" ──────────────┘
```

- **Self letters**: one encryption, one decryption, both with the owner's master key.
- **Friend letters during wait**: two layers — content encrypted with K, K time-locked to drand. Server holds the ciphertext and the tlockedKey; can't decrypt either without help from the future.
- **Friend letters at delivery**: drand round produced → anyone with `tlockedKey` (the email recipient) derives K → decrypts.
- **Friend letters post-Keep-forever**: re-encrypted under recipient's master key. Recipient owns an independent E2EE copy; the original sender still has only a receipt.

Crypto primitives in code:
- `src/lib/e2ee/crypto.ts` — master key derivation, master-key encrypt/decrypt (`encryptString`, `encryptBytes`, etc.).
- `src/lib/letters/transient-crypto.ts` — raw-key AES-GCM (for the friend-letter ephemeral K path).
- `src/lib/letters/tlock.ts` — tlock-js wrapper, drand quicknet config from `DRAND_CHAIN_HASH` + `DRAND_API_URLS`.
- `src/lib/letters/self-letter-client.ts` — self-letter compose/decompose.
- `src/lib/letters/friend-letter-client.ts` — friend-letter compose (server has no equivalent).

---

## 6. File map

### Server routes
| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/api/letters/self` | POST | session | Native self-letter write |
| `/api/letters/friend` | POST | session | Native friend-letter write + schedule Resend |
| `/api/letters/save-received` | POST | session (recipient) | Save a kept friend letter |
| `/api/letters/[id]/ask-for-copy` | POST | session (paid sender) | Email recipient asking for a copy back |
| `/api/letters/inbox` | GET | session | Receiver list. Returns `text` inline for Phase 4 native rows so the reveal modal doesn't need a second fetch. |
| `/api/letters/sent` | GET | session | Sender receipt list |
| `/api/letters/arrived`, `/mine`, `/received` | GET | session | Other read variants. Now surface native rows too (no associated photos/doodles/song for natives — they have no `EntryPhoto`/`Doodle` rows). |
| `/api/letters/[id]/peek`, `/viewed`, `/read` | various | session | Single-letter mutations |
| `/api/letter/[token]/meta` | GET | public | Drand/scheduledFor/display names — no content |
| `/api/letter/[token]/ciphertext` | GET | public | Transient blob + IV; 24h gate |
| `/api/webhooks/resend` | POST | Svix signature | Sets deliveredAt/bouncedAt |
| `/api/cron/self-letter-reminders` | GET | `CRON_SECRET` | Daily nudge for due self-letters |
| `/api/cron/letter-cleanup` | GET | `CRON_SECRET` | Daily delete of expired LetterDelivery rows |

### Client surfaces
| Path | Purpose |
|---|---|
| `src/components/letters/compose/ComposeView.tsx` | Compose UI; the `handleSeal` decides self vs friend |
| `src/components/letters/compose/SealModal.tsx` | Date-picker pills (incl. PRELAUNCH-TEST-PILLS 5m + 1h) |
| `src/app/letter/[token]/page.tsx` | Public recipient page (client-only decrypt) |
| `src/app/letter/[token]/save/page.tsx` | Keep-forever + magic-link signup |
| `src/components/letters/sent/ReceiptModal.tsx` | Sender's per-letter detail; status pill + ask-for-copy button |
| `src/components/letters/SenderReceiptStatus.tsx`, `AskForCopyButton.tsx` | Receipt UI bits |

### Libs
| Path | Purpose |
|---|---|
| `src/lib/letters/tlock.ts` | Quicknet timelock encrypt/decrypt |
| `src/lib/letters/transient-crypto.ts` | Raw-key AES-GCM |
| `src/lib/letters/self-letter-client.ts` | Self-letter payload build/decrypt |
| `src/lib/letters/friend-letter-client.ts` | Friend-letter payload build |
| `src/lib/letters/resend-webhook.ts` | Svix signature verification |
| `src/lib/letters/dual-read.ts` | Post-Phase-5: queries native `Letter` only (the JournalEntry fallback was dropped). `listLettersForRead` / `findLetterForRead` translate caller-supplied JournalEntry-shaped `where` clauses into native Letter terms. The mapper synthesizes `encryptionType: 'e2ee'` and the `e2eeIVs.text` / `e2eeIVs.content` IV alias so existing consumers keep working without changes. |
| `src/lib/email.ts` | All Resend wrappers. Phase 4 helpers: `sendFriendLetterTransientEmail`, `sendSelfLetterReminderEmail`, `sendAskForCopyEmail`. Surviving pre-Phase-4: `sendSelfLetterEmail`, `sendSelfLetterNotification` (used by the in-app reveal flow). All `from:` addresses env-driven via `RESEND_FROM_LETTERS`. |
| `src/lib/billing/is-paid-user.ts` | Lemon Squeezy status gate for ask-for-copy |

---

## 7. Environment variables

```bash
# Drand quicknet (Phase 4)
DRAND_CHAIN_HASH=52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
DRAND_API_URLS=https://api.drand.sh,https://api2.drand.sh,https://api3.drand.sh

# Resend (Phase 4 helpers use these env-driven addresses; the legacy helpers in src/lib/email.ts still hardcode 'Hearth <letters@hearth.app>' — Phase 5 cleanup)
RESEND_API_KEY=re_xxx
RESEND_FROM_LETTERS=Hearth <letters@hearth.app>
RESEND_FROM_SYSTEM=Hearth <hello@hearth.app>
RESEND_WEBHOOK_SECRET=whsec_xxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3111  # used to build /letter/<token>#k=... links
CRON_SECRET=xxx
NEXT_PUBLIC_USE_DEV_AUTH=true  # exposed for the SealModal dev-mode toggles (currently the pills are unconditional pre-launch — see PRELAUNCH-TEST-PILLS)
```

---

## 8. Known bugs (as of 2026-05-16)

> **Update 2026-05-16 (later):** Critical 1, Critical 2, Important 4, and Important 5 were fixed in commits `c17d550`, `6066142`, `792de0a`. Kept here for history with their original descriptions; cross out FIXED items when reading.

### 🔴 Critical
1. ~~**Phase 4 self-letters are unreadable.** Native `Letter` rows with `letterType='self'` are never surfaced by any read route — all routes anchor on `JournalEntry`.~~ **FIXED in `c17d550`.** `listLettersForRead` and `findLetterForRead` now also query native `Letter where letterType='self' AND sourceJournalEntryId IS NULL` and map them into the dual-read shape. The inbox route surfaces `text` (ciphertext) inline so the reveal modal decrypts without a second fetch. IV is aliased under both `e2eeIVs.text` and `e2eeIVs.content` so legacy `decryptEntryFromServer` consumers and new `decryptSelfLetterContent` consumers both find it.
2. ~~**Stored XSS in recipient page.**~~ **FIXED in `6066142`.** `src/app/letter/[token]/page.tsx` now pipes the decrypted HTML through DOMPurify with a tight allow-list (`p, br, strong, em, u, s, a, h1-3, blockquote, code, pre, ul, ol, li, span, div`; allowed attrs `href, target, rel, class, style`; URI scheme allow-list `https?|mailto`) before `dangerouslySetInnerHTML`. No `script`, no `iframe`, no `on*` attrs.

### 🟠 Important
3. ~~**Master key persisted in localStorage as raw bytes.**~~ **PARTIALLY FIXED in `972e617`.** The key now lives in `sessionStorage` only — tab close = key gone, exposure window is one session instead of seven days. User trades "type passphrase once a week" for "type passphrase once per session." A stronger mitigation (WebCrypto `wrapKey` with a non-extractable device-bound key) is still desirable longer-term but not blocking.
4. ~~**Non-atomic Resend rollback.**~~ **FIXED in `792de0a`.** Both deletes are now wrapped in `prisma.$transaction([...])`.
5. ~~**24h countdown client-computed.**~~ **FIXED in `6066142`.** `/api/letter/[token]/meta` now returns `firstReadAt`; the recipient page uses `firstReadAt + 24h` for the countdown when present.
6. ~~**E2EE photos silently dropped from friend letters.**~~ **FIXED in Phase 4.1.** At seal time the sender's browser decrypts each photo under the master key, re-encrypts under K, and uploads as a `LetterDeliveryAsset` row. Doodles are decrypted and inlined into the transient body. The recipient page fetches each asset via `GET /api/letter/[token]/asset/[id]` and decrypts with the same K it used for the letter body. Keep-forever re-uploads the photos under the recipient's master key as `Letter.keptPhotoRefs`. See section 4 for the full flow.
7. ~~**IV-shape mismatch in `/arrived` + `/mine`.**~~ **FIXED in `c17d550`** alongside Critical #1. Native rows' single `contentIVs.content` is now exposed under both `e2eeIVs.content` and `e2eeIVs.text` in the dual-read response, so legacy `decryptEntryFromServer` (looking for `e2eeIVs.text`) and the new `decryptSelfLetterContent` (looking for `contentIVs.content`) both resolve the same IV.

### 🟡 Lower priority
8. **No Svix timestamp freshness check.** Replay window is unbounded. Reject `svix-timestamp` older than ~5 min.
9. **Email subject uses unescaped `senderName`.** Not HTML-injection, but a nickname with a newline could inject SMTP headers in legacy MTAs. Strip control chars.
10. ~~**`sendFriendLetterMagicLink` is dead.**~~ **FIXED in `54360ba`** (Phase 5 Task 2). Helper deleted alongside the legacy `/api/cron/deliver-letters` cron and the `/api/letter/[token]` route.
11. ~~**CRON_SECRET only enforced when set.**~~ **FIXED in `db236db`** for the Phase 4 crons (`self-letter-reminders`, `letter-cleanup`). Both routes now return 500 in production when `CRON_SECRET` is unset. Dev keeps fail-open so local testing works. **Note:** the same pattern exists in 3 non-Phase-4 crons (`sweep-orphaned-blobs`, `expire-stranger-notes`, `send-reminders`) — out of letter-cleanup scope; consider applying the same pattern across the board.

---

## 9. Pre-launch checklist

Things you must verify or undo before going public:

- [ ] Search `git grep PRELAUNCH-TEST-PILLS src/` and follow the cleanup notes (remove `5m`/`1h` pills, restore 7-day server floor).
- [x] ~~Fix Critical #1 (self-letter inbox).~~ Done in `c17d550`.
- [x] ~~Fix Critical #2 (XSS).~~ Done in `6066142`.
- [x] ~~Important #3 minimum: localStorage → sessionStorage.~~ Done in `972e617`. (WebCrypto `wrapKey` upgrade is still a future improvement, not blocking.)
- [x] ~~Important #6 (E2EE photos silently dropped).~~ Done across Phase 4.1 (commits `265b9a2` → `42a1ee8`).
- [x] ~~Remove dead `sendFriendLetterMagicLink` and the legacy `/api/letter/[token]` + `/api/cron/deliver-letters` routes.~~ Done in Phase 5 cleanup (`e4a08f8`, `54360ba`).
- [ ] Apply the fail-closed CRON_SECRET pattern (#11) to the 3 remaining non-Phase-4 crons (`sweep-orphaned-blobs`, `expire-stranger-notes`, `send-reminders`).
- [ ] Add Svix timestamp freshness check to the Resend webhook (Lower #8) — reject `svix-timestamp` older than ~5 min.
- [ ] Strip control chars from `senderName` in the email subject line (Lower #9).
- [ ] Confirm `RESEND_WEBHOOK_SECRET` is set in production and the Resend dashboard webhook points at `${NEXT_PUBLIC_APP_URL}/api/webhooks/resend`.
- [ ] Confirm both crons are scheduled (Vercel Cron or external) — daily `self-letter-reminders` and daily `letter-cleanup`.
- [ ] Confirm `RESEND_FROM_LETTERS`, `RESEND_FROM_SYSTEM`, `DRAND_CHAIN_HASH`, `DRAND_API_URLS` are set in production.
- [ ] Pen-test a malicious sender attempting XSS in letter body to confirm the DOMPurify allow-list is tight enough.

---

## 10. Glossary

- **Master key**: AES-256 CryptoKey held in browser memory, derived from the user's passphrase. Wrapped at rest in `User.encryptedMasterKey`.
- **K (transient key)**: 32 random bytes generated client-side per friend letter. AES-encrypts the letter content. Tlock-encrypted against a future drand round.
- **tlock**: Time-lock encryption. Uses BLS pairing-based cryptography against drand's threshold beacon. Decryption is only possible after the targeted round has been produced.
- **drand quicknet**: A specific drand network (chain hash `52db9ba7…`) with 3-second rounds and G1-group signatures — the only public chain supporting timelock encryption today.
- **Receipt**: The sender's `Letter` row for a friend letter. Has metadata but no content blob.
- **Faded**: A friend letter whose `LetterDelivery` row has been cleaned up (24h post-firstRead). The receipt row persists; the content is permanently inaccessible.
- **Keep forever**: The recipient's option to save a friend letter into their own E2EE-encrypted Hearth account.
- **PRELAUNCH-TEST-PILLS**: The grep marker for the temporary 5m / 1h delay options in `SealModal` and the corresponding loosened server validation. Strip before public launch.

---

## 11. References

- Master spec: [docs/superpowers/plans/2026-05-15-e2ee-first-architecture.md](superpowers/plans/2026-05-15-e2ee-first-architecture.md)
- Phase 2 plan (shipped): [docs/superpowers/plans/2026-05-15-letter-table-extraction.md](superpowers/plans/2026-05-15-letter-table-extraction.md)
- Phase 4 spec: [docs/superpowers/specs/2026-05-16-friend-letters-tlock-design.md](superpowers/specs/2026-05-16-friend-letters-tlock-design.md)
- Phase 4 plan: [docs/superpowers/plans/2026-05-16-friend-letters-tlock.md](superpowers/plans/2026-05-16-friend-letters-tlock.md)
