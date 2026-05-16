# Letters in Hearth — Architecture & Current State

> **Snapshot:** 2026-05-16. Reflects the state of branch `feat/e2ee-onboarding` after Phase 4 (friend letters with tlock + self-letter native writes).
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
- Also hosts **pre-Phase-4 legacy letters** with `entryType in ('letter','unsent_letter')`. These are read via the Phase 2 dual-read helper.
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
- `transientCiphertext`, `transientIV` — letter content encrypted under a random per-letter K.
- `tlockedKey` — K time-lock-encrypted against the drand quicknet round for `scheduledFor`.
- `publicToken` — 24-byte base64url random; appears in the URL path (`/letter/<publicToken>`).
- `resendEmailId` — populated after the Resend `scheduled_at` call.
- `firstReadAt`, `transientExpiresAt` — 24h read window markers.
- Cleanup cron deletes rows past 24h post-firstRead or 60d unread. The parent `Letter` row persists.

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
1. `handleSeal` for `recipient.recipient === 'friend'` → `buildFriendLetterPayload(...)` at [src/lib/letters/friend-letter-client.ts:32-71](../src/lib/letters/friend-letter-client.ts#L32-L71).
2. Inside the builder:
   - `K = crypto.getRandomValues(new Uint8Array(32))` — fresh ephemeral 256-bit key.
   - `encryptTransient(plaintextJson, K)` — [src/lib/letters/transient-crypto.ts](../src/lib/letters/transient-crypto.ts) — AES-256-GCM with a fresh 96-bit IV. Returns `{ciphertext, iv}` both base64.
   - `tlockEncryptKey(K, unlockDate)` — [src/lib/letters/tlock.ts](../src/lib/letters/tlock.ts) — computes the drand quicknet round number for `unlockDate` (3-second period) and passes K to `timelockEncrypt`. Returns an Age-format armored string.
   - `K.fill(0)` — best-effort memory wipe.
3. POST `/api/letters/friend` with `{transientCiphertext, transientIV, tlockedKey, recipientEmail, recipientName, scheduledFor, letterLocation}`. **No plaintext, no K.** `senderName` may be in the body but the server ignores it.

### Server-side write
[src/app/api/letters/friend/route.ts](../src/app/api/letters/friend/route.ts):
1. Validates: crypto fields present, email format, min lead time (currently 1 min in dev — see PRELAUNCH-TEST-PILLS), max 30 days.
2. **Derives `senderName` from the authenticated user** via `User.profile.nickname` → `User.name` → `'A friend'`. Client-supplied senderName is ignored.
3. `prisma.$transaction` creates `Letter { letterType: 'friend', contentCiphertext: null, ...metadata }` + `LetterDelivery { transientCiphertext, transientIV, tlockedKey, publicToken: randomBytes(24).toString('base64url') }`.
4. Calls `sendFriendLetterTransientEmail` — schedules a Resend email at `scheduledAt: scheduledFor.toISOString()`, body links to `${NEXT_PUBLIC_APP_URL}/letter/<publicToken>#k=<urlencoded-tlockedKey>`. From-address from `RESEND_FROM_LETTERS`. Stores returned `resendEmailId` on the delivery row.
5. **On Resend failure**: deletes both rows (currently as two separate `.delete()` calls — see bug #4 below).
6. Best-effort `journalEntry.deleteMany` of the draft.

### Recipient read (no auth)
[src/app/letter/[token]/page.tsx](../src/app/letter/[token]/page.tsx):
1. Client reads `tlockedKey` from `window.location.hash` (fragment never sent to the server).
2. `GET /api/letter/[token]/meta` — public, no auth — returns `{scheduledFor, senderName, recipientName, alreadyExpired}`. If `scheduledFor` is still future → page renders "not_yet".
3. `tlockDecryptKey(tlockedKey, scheduledFor)` — fetches the drand round; throws until the round is produced (~3s after `scheduledFor`).
4. `GET /api/letter/[token]/ciphertext` — server-side:
   - Returns 404 / 425 ("not_yet") / 410 ("expired") on the obvious sad paths.
   - **Atomically claims `firstReadAt`** via `updateMany({where: {id, firstReadAt: null}, data: {firstReadAt: now, transientExpiresAt: now + 24h}})`. Only the request that finds it null wins. Mirrors `firstReadAt` onto the parent `Letter` row.
5. Client `decryptTransient(transientCiphertext, transientIV, K)` → plaintext JSON → renders.
6. Decrypted content is stashed in `sessionStorage` keyed on `publicToken` so the Keep-forever flow can pick it up across navigation.

### Keep forever (recipient → Hearth user)
[src/app/letter/[token]/save/page.tsx](../src/app/letter/[token]/save/page.tsx):
- **Logged-in recipient**: pulls cached blob from `sessionStorage`, re-encrypts under `useE2EEStore.masterKey`, `POST /api/letters/save-received`. Server creates a `Letter { letterType: 'received-friend', ... }` and atomically mirrors `savedByRecipientAt` onto the original sender's `friend` row.
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
| `/api/letters/inbox` | GET | session | Receiver list — **does not yet surface Phase 4 self-letters** |
| `/api/letters/sent` | GET | session | Sender receipt list |
| `/api/letters/arrived`, `/mine`, `/received` | GET | session | Other read variants — all anchor on JournalEntry |
| `/api/letters/[id]/peek`, `/viewed`, `/read` | various | session | Single-letter mutations |
| `/api/letter/[token]/meta` | GET | public | Drand/scheduledFor/display names — no content |
| `/api/letter/[token]/ciphertext` | GET | public | Transient blob + IV; 24h gate |
| `/api/letter/[token]` (legacy) | GET | public | Pre-Phase-4 `LetterAccessToken` route; **untouched, kept for legacy test letters** |
| `/api/webhooks/resend` | POST | Svix signature | Sets deliveredAt/bouncedAt |
| `/api/cron/self-letter-reminders` | GET | `CRON_SECRET` | Daily nudge for due self-letters |
| `/api/cron/letter-cleanup` | GET | `CRON_SECRET` | Daily delete of expired LetterDelivery rows |
| `/api/cron/deliver-letters` (legacy) | GET | `CRON_SECRET` | **Untouched, runs over empty set post-Phase-4** |

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
| `src/lib/letters/dual-read.ts` | Phase 2 dual-read helper. Anchors on `JournalEntry`; merges `Letter` via `sourceJournalEntryId`. |
| `src/lib/letter-tokens.ts` (legacy) | Pre-Phase-4 `LetterAccessToken` — still used by the legacy route |
| `src/lib/email.ts` | All Resend wrappers. Phase 4 helpers: `sendFriendLetterTransientEmail`, `sendSelfLetterReminderEmail`, `sendAskForCopyEmail`. Pre-Phase-4: `sendFriendLetterMagicLink` (now dead code), `sendSelfLetterEmail`, `sendSelfLetterNotification` |
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

### 🔴 Critical
1. **Phase 4 self-letters are unreadable.** Native `Letter` rows with `letterType='self'` are never surfaced by any read route — all routes anchor on `JournalEntry`. The cron correctly stamps `Letter.deliveredAt`, but the inbox UI queries `JournalEntry.unlockDate`/`isDelivered`. Fix: add a Phase-4-aware inbox query path that unions `JournalEntry`-shaped legacy letters with native `Letter where letterType='self' AND scheduledFor <= now()`. Likely needs a new dedicated route plus an `InboxView` update.
2. **Stored XSS in recipient page.** [src/app/letter/[token]/page.tsx:154](../src/app/letter/[token]/page.tsx#L154) renders `state.data.text` via `dangerouslySetInnerHTML`. The text is sender-authored HTML, encrypted, so the server can't sanitize. Fix: sanitize on the client right before render with DOMPurify (`npm i dompurify @types/dompurify`).

### 🟠 Important
3. **Master key persisted in localStorage as raw bytes.** `storeMasterKeyLocally` in `src/lib/e2ee/crypto.ts`. XSS → full account compromise. Mitigation: switch to `sessionStorage` or wrap with a device-bound key via WebCrypto `wrapKey`. (Cross-Phase concern; not Phase 4 specific.)
4. **Non-atomic Resend rollback.** [src/app/api/letters/friend/route.ts:124-125](../src/app/api/letters/friend/route.ts#L124-L125). Two separate `.delete().catch(()=>{})` calls. Fix: `prisma.$transaction([...])`.
5. **24h countdown client-computed.** [src/app/letter/[token]/page.tsx:100](../src/app/letter/[token]/page.tsx#L100). Reopening the page restarts the countdown visually (server math is still correct). Fix: return `firstReadAt` from `/meta` and base the countdown on `firstReadAt + 24h`.
6. **E2EE photos silently dropped from friend letters.** [src/lib/letters/friend-letter-client.ts:45](../src/lib/letters/friend-letter-client.ts#L45) filters out photos without a plain `url`. Sender sees photos at compose; recipient doesn't. Fix: warn at seal time in `SealModal`.
7. **IV-shape mismatch in `/arrived` + `/mine`.** These routes return `e2eeIVs` (JournalEntry shape: per-field `{text, textPreview, …}`) but `decryptSelfLetterContent` expects `contentIVs: {content: iv}`. Masked today because of #1 (no Phase 4 self-letter reaches these routes), but unblocks the moment #1 is fixed.

### 🟡 Lower priority
8. **No Svix timestamp freshness check.** Replay window is unbounded. Reject `svix-timestamp` older than ~5 min.
9. **Email subject uses unescaped `senderName`.** Not HTML-injection, but a nickname with a newline could inject SMTP headers in legacy MTAs. Strip control chars.
10. **`sendFriendLetterMagicLink` is dead.** Phase 3 legacy helper. Phase 5 cleanup.
11. **CRON_SECRET only enforced when set.** `if (secret && auth !== ...)`. Make `require(secret)` explicit if production should fail-closed.

---

## 9. Pre-launch checklist

Things you must verify or undo before going public:

- [ ] Search `git grep PRELAUNCH-TEST-PILLS src/` and follow the cleanup notes (remove `5m`/`1h` pills, restore 7-day server floor).
- [ ] Fix Critical #1 (self-letter inbox) — without it, the self-letter feature is non-functional.
- [ ] Fix Critical #2 (XSS) — single-route fix, low effort.
- [ ] Decide on Important #3 (localStorage master key) — minimum: sessionStorage. Recommended: WebCrypto wrapKey.
- [ ] Remove dead `sendFriendLetterMagicLink` and the legacy `/api/letter/[token]` + `/api/cron/deliver-letters` routes — Phase 5-cleanup work.
- [ ] Confirm `RESEND_WEBHOOK_SECRET` is set in production and the Resend dashboard webhook points at `${NEXT_PUBLIC_APP_URL}/api/webhooks/resend`.
- [ ] Confirm both crons are scheduled (Vercel Cron or external) — daily `self-letter-reminders` and daily `letter-cleanup`.
- [ ] Confirm `RESEND_FROM_LETTERS`, `RESEND_FROM_SYSTEM`, `DRAND_CHAIN_HASH`, `DRAND_API_URLS` are set in production.
- [ ] Pen-test a malicious sender attempting XSS in letter body once the DOMPurify fix is in.

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
