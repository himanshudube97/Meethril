# Friend Letters E2EE Implementation Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship E2EE friend letters with `tlock-js` time-lock encryption, Resend `scheduled_at` delivery (no friend-letter cron), URL-fragment key handoff, 24-hour read window, "Keep forever" with magic-link signup, and a paid "Ask for a copy" feature. Also folds in the master spec's Phase 3 (native self-letter writes via the new `Letter` table) so both letter types use the new model from this phase forward.

**Architecture:** Three independent surfaces — sender's compose+write (client encrypts + tlocks + posts; server schedules Resend), recipient's no-auth read (drand round → tlock-decrypt → fetch ciphertext → AES-decrypt, all in browser; server enforces 24h read window), and recipient's save / sender's receipt / ask-for-copy. Two crons: `self-letter-reminders` (replaces self-letter half of the old deliver-letters cron) and `letter-cleanup` (sweeps expired `LetterDelivery` rows). Legacy cleanup is **out of scope** — handled by a follow-up Phase 5-cleanup plan after Phase 4 is verified end-to-end.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 5 + Postgres, `tlock-js@0.9.0`, `drand-client@1.2.5`, Resend SDK v6, existing E2EE master-key WebCrypto stack (`src/lib/e2ee/crypto.ts`).

**Spec:** [`../specs/2026-05-16-friend-letters-tlock-design.md`](../specs/2026-05-16-friend-letters-tlock-design.md). Read it before starting.

---

## Phase 4 architectural decisions

These are load-bearing. If a step seems off, return here first.

1. **Task 0 is a kill switch.** `tlock-js@0.9.0` was last published in March 2024. Before any architectural code is written, Task 0 verifies it installs and round-trips on Node 22 / Next.js 16. If it fails, stop and replan. No new files are created in tasks 1+ until Task 0 passes.

2. **Zero schema migrations in this phase.** The Phase 2 `Letter` + `LetterDelivery` schemas already cover every field Phase 4 needs (`encryptedReceiptMetadata` / `receiptMetadataIV` were considered and removed during the spec self-review — `title`/`titleIV` or just plaintext metadata cover the same UX). Plan does **not** run `prisma migrate dev`.

3. **Quicknet, not mainnet.** Drand quicknet (`52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`) is the only chain hash that supports timelock encryption with G1 signatures. 3-second round period. Three redundant endpoints (`api.drand.sh`, `api2.drand.sh`, `api3.drand.sh`) consumed via env.

4. **Drafts still live on `JournalEntry`.** The autosave / drafts flow stays untouched. Only the **seal/send** moment switches destination from `POST /api/entries/[id]/seal` to the new `POST /api/letters/self` or `POST /api/letters/friend`. After a successful send, the draft `JournalEntry` is **deleted** (its content is now in the encrypted Letter — keeping the draft would leak plaintext copies for server-encrypted legacy users).

5. **No `JournalEntry` writes from Phase 4 letter sends.** Every new letter lands in `letters` + (for friend letters) `letter_deliveries`. The Phase 2 dual-read keeps existing inbox / sent / arrived routes working because they already query `letters` first.

6. **OTP-not-magic-link.** The existing `/api/auth/resend-otp` route sends a 6-digit code that the user types into a form in the same tab. The save flow keeps the decrypted blob in `sessionStorage` across the OTP submit → onboarding → save sequence. No new auth infrastructure.

7. **No tests by default.** Per `~/.claude/.../memory/feedback_skip_tests.md`. Verification is manual: each task lists what to run and what to expect.

---

## File structure

### Files to CREATE

| Path | Responsibility |
|---|---|
| `src/lib/letters/tlock.ts` | `roundFromDate`, `tlockEncryptKey`, `tlockDecryptKey`. Wraps `tlock-js` + `drand-client` against the env-configured quicknet chain. |
| `src/lib/letters/transient-crypto.ts` | `encryptTransient(bytes, key)`, `decryptTransient(ciphertext, iv, key)`. WebCrypto AES-256-GCM over the random ephemeral key K. |
| `src/lib/letters/friend-letter-client.ts` | Browser-side helper: serialize draft → generate K → encrypt transient → tlock-encrypt K → return upload payload. Pure function, no fetch. |
| `src/lib/letters/self-letter-client.ts` | Browser-side helper: serialize draft → encrypt with master key → return upload payload. Pure function, no fetch. |
| `src/lib/letters/resend-webhook.ts` | Verifies Resend's Svix-style webhook signature; parses event payload into a typed union. |
| `src/app/api/letters/self/route.ts` | `POST` native self-letter write. Authenticated. |
| `src/app/api/letters/friend/route.ts` | `POST` native friend-letter write + Resend `scheduledAt` call. Authenticated. |
| `src/app/api/letters/save-received/route.ts` | `POST` re-encrypt-and-keep. Authenticated (recipient). |
| `src/app/api/letters/[id]/ask-for-copy/route.ts` | `POST` paid sender → recipient ask-back email. |
| `src/app/api/letter/[token]/meta/route.ts` | `GET` public — `{scheduledFor, alreadyExpired, senderName, recipientName}`. |
| `src/app/api/letter/[token]/ciphertext/route.ts` | `GET` public — `{transientCiphertext, transientIV}` or 410. Sets `firstReadAt` on first call. |
| `src/app/api/webhooks/resend/route.ts` | `POST` Resend webhook handler. Sets `Letter.deliveredAt` / `bouncedAt`. |
| `src/app/api/cron/self-letter-reminders/route.ts` | `GET` daily — nudge email for self-letters whose `scheduledFor` has passed. |
| `src/app/api/cron/letter-cleanup/route.ts` | `GET` daily — delete expired `LetterDelivery` rows. |
| `src/app/letter/[token]/save/page.tsx` | Magic-link signup → onboarding handoff → re-encrypt-and-save. |
| `src/components/letters/AskForCopyButton.tsx` | Receipt-row button. Paid-gated. |
| `src/components/letters/SenderReceiptStatus.tsx` | Status pill component for receipt UI. |
| `scripts/test-tlock-roundtrip.ts` | Task 0 smoke test runner. |

### Files to MODIFY

| Path | Change |
|---|---|
| `package.json` (via npm install) | Add `tlock-js` + `drand-client`. |
| `.env.example` | Add `RESEND_FROM_LETTERS`, `RESEND_FROM_SYSTEM`, `RESEND_WEBHOOK_SECRET`, `DRAND_CHAIN_HASH`, `DRAND_API_URLS`. |
| `src/components/letters/compose/ComposeView.tsx` | Replace `handleSeal` so it routes self vs friend to the new APIs instead of `/api/entries/[id]/seal`. Delete the draft `JournalEntry` after success. |
| `src/components/letters/compose/SealModal.tsx` | No behavior change — the 7-day-min / 30-day-max friend constraint is already there. Touched only if the seal callback signature changes. |
| `src/app/letter/[token]/page.tsx` | Replace today's server-decrypt fetch with client-side drand → tlock-decrypt → ciphertext-fetch → AES-decrypt flow. Render 24h countdown + Keep forever CTA. |
| `src/lib/email.ts` | Add `sendFriendLetterTransientEmail()` (env-driven `from`, Resend `scheduledAt`, returns `id`). Add `sendSelfLetterReminderEmail()`. Add `sendAskForCopyEmail()`. The existing 3 hardcoded `from:` lines stay untouched — Phase 5-cleanup. |
| `src/app/api/letters/sent/route.ts` | Surface `Letter.savedByRecipientAt` and `Letter.bouncedAt` in the response so the receipt UI can render the new status timeline. |
| `src/components/letters/SentLetters*.tsx` (whichever renders the sent-letters list) | Surface the new status pill + the `AskForCopyButton`. |

### Files NOT touched in Phase 4 (Phase 5-cleanup will get them)

- `src/app/api/cron/deliver-letters/route.ts` — still runs but over an empty set (nothing writes legacy friend letters anymore).
- `src/app/api/letter/[token]/route.ts` (the old `LetterAccessToken` route) — still serves legacy test letters in dev.
- `src/lib/letter-tokens.ts` — still exists, no new callers.
- `LetterAccessToken` Prisma model — stays.
- `JournalEntry` letter columns (`entryType`, `unlockDate`, `isSealed`, `recipientEmail`, etc.) — stay.
- Hardcoded `from: 'Hearth <letters@hearth.app>'` lines in `src/lib/email.ts` (3 occurrences).
- Dual-read fallback in `/api/letters/{inbox,sent,arrived,mine,received,[id]/peek,[id]/viewed,[id]/read}`.

---

## Verification approach (per project convention)

No unit tests. Per task:
- Each task lists a manual verification step with the exact command to run and the expected output.
- The final task is a full end-to-end smoke test of friend letter → drand wait → recipient read → Keep forever → magic-link onboarding → re-encrypt → sender receipt → ask-for-copy.

Docker note: this worktree runs on `:3112` / `:5435` (see `docker-compose.override.yml`). Use `docker compose exec app …` for all in-container commands. The dodo-payments worktree on `:3111` / `:5434` is independent — do not touch its containers.

---

## Task 0: tlock-js compatibility smoke test (KILL SWITCH)

**Goal:** Confirm `tlock-js@0.9.0` installs cleanly and round-trips an encrypt→decrypt against quicknet on Node 22 / Next.js 16. If this fails, stop and re-evaluate the spec — do not proceed to Task 1.

**Files:**
- Create: `scripts/test-tlock-roundtrip.ts`

- [ ] **Step 1: Install both packages and capture install output**

Run:
```bash
docker compose exec app npm install tlock-js drand-client
```

Expected: clean install. No `EPEERINVALID` warnings on `@noble/curves` (tlock-js pins to `^1.4.0`). If you see `npm error` lines about peer dependencies, capture them and stop.

- [ ] **Step 2: Create the smoke test script**

Create `scripts/test-tlock-roundtrip.ts`:

```typescript
/**
 * Task 0 smoke test for Phase 4: confirm tlock-js + drand-client round-trip
 * on the current Node version. Run via: docker compose exec app npx tsx scripts/test-tlock-roundtrip.ts
 */
import { timelockEncrypt, timelockDecrypt } from 'tlock-js'
import { fetchBeacon, HttpChainClient, HttpCachingChain } from 'drand-client'

const CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
const ENDPOINT = `https://api.drand.sh/${CHAIN_HASH}`

async function main() {
  const chain = new HttpCachingChain(ENDPOINT)
  const client = new HttpChainClient(chain)
  const info = await chain.info()
  console.log('chain info:', { hash: info.hash, period: info.period, genesis: info.genesis_time })

  // 1) Encrypt for a round 10 seconds in the future. Decryption should
  //    fail immediately and succeed after the round has been produced.
  const nowSec = Math.floor(Date.now() / 1000)
  const targetRound = Math.floor((nowSec + 10 - info.genesis_time) / info.period)
  console.log('targeting round', targetRound)

  const plaintext = new TextEncoder().encode('hearth phase 4 task 0 sentinel')
  const ciphertext = await timelockEncrypt(targetRound, Buffer.from(plaintext), client)
  console.log('ciphertext (truncated):', ciphertext.slice(0, 60), '...')

  // 2) Try to decrypt immediately — should throw because the round isn't ready.
  try {
    await timelockDecrypt(ciphertext, client)
    throw new Error('SMOKE FAIL: decryption succeeded before unlock time')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('SMOKE FAIL')) throw e
    console.log('pre-unlock decryption correctly rejected:', e instanceof Error ? e.message : e)
  }

  // 3) Wait for the round and try again.
  const waitMs = (targetRound * info.period + info.genesis_time - nowSec + 5) * 1000
  console.log(`waiting ${Math.ceil(waitMs / 1000)}s for round ${targetRound}...`)
  await new Promise((r) => setTimeout(r, waitMs))

  await fetchBeacon(client, targetRound) // sanity: round is available
  const decrypted = await timelockDecrypt(ciphertext, client)
  const text = new TextDecoder().decode(decrypted)
  if (text !== 'hearth phase 4 task 0 sentinel') {
    throw new Error(`SMOKE FAIL: round-trip mismatch — got ${JSON.stringify(text)}`)
  }
  console.log('SMOKE OK: round-trip succeeded')
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e)
  process.exit(1)
})
```

- [ ] **Step 3: Run the smoke test**

```bash
docker compose exec app npx tsx scripts/test-tlock-roundtrip.ts
```

Expected output (timings vary):
```
chain info: { hash: '52db9ba...', period: 3, genesis: ... }
targeting round <some int>
ciphertext (truncated): -----BEGIN AGE ENCRYPTED FILE----- ...
pre-unlock decryption correctly rejected: <error message>
waiting 15s for round <int>...
SMOKE OK: round-trip succeeded
```

If you see `SMOKE FAIL` or an install/type error: **STOP**. Document what failed in a comment at the top of this plan file, then surface the failure to the user.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/test-tlock-roundtrip.ts
git commit -m "$(cat <<'EOF'
feat(letters): add tlock-js + drand-client + Task 0 smoke test

Phase 4 kill switch. Round-trips encrypt/decrypt against quicknet to confirm
tlock-js@0.9.0 builds and runs on Node 22 / Next.js 16 before we commit to
the architecture.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Add env vars + .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Read current .env.example header**

```bash
cat .env.example
```

Identify the section to append after (likely email / Resend section).

- [ ] **Step 2: Append the new env block**

Append to `.env.example`:

```bash
# Friend letters (Phase 4) — tlock-js + drand
DRAND_CHAIN_HASH=52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
DRAND_API_URLS=https://api.drand.sh,https://api2.drand.sh,https://api3.drand.sh

# Resend identities (Phase 4) — env-driven so we don't hardcode addresses
RESEND_FROM_LETTERS=Hearth <letters@hearth.app>
RESEND_FROM_SYSTEM=Hearth <hello@hearth.app>
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Set the same values in your local Docker env**

If you have a local `.env` or `.env.local`, mirror the values into it (the smoke test in Task 0 used hardcoded values; from Task 2 onward we read from env). Make sure the container picks them up:

```bash
docker compose restart app
docker compose logs app --tail=20
```

Expected: clean restart, no env-related warnings.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore(letters): add Phase 4 env vars to .env.example"
```

---

## Task 2: Build `src/lib/letters/tlock.ts`

**Files:**
- Create: `src/lib/letters/tlock.ts`

- [ ] **Step 1: Write the module**

```typescript
// src/lib/letters/tlock.ts
//
// Phase 4 friend letters: wrap tlock-js + drand-client against the
// env-configured quicknet chain. All helpers run in both Node and browser —
// the SDKs use globalThis.fetch.

import { timelockEncrypt, timelockDecrypt } from 'tlock-js'
import { HttpCachingChain, HttpChainClient, type ChainInfo } from 'drand-client'

const CHAIN_HASH = process.env.NEXT_PUBLIC_DRAND_CHAIN_HASH ?? process.env.DRAND_CHAIN_HASH
const API_URLS = (process.env.NEXT_PUBLIC_DRAND_API_URLS ?? process.env.DRAND_API_URLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!CHAIN_HASH) {
  throw new Error('Missing DRAND_CHAIN_HASH (or NEXT_PUBLIC_DRAND_CHAIN_HASH)')
}
if (API_URLS.length === 0) {
  throw new Error('Missing DRAND_API_URLS (or NEXT_PUBLIC_DRAND_API_URLS)')
}

let _info: ChainInfo | null = null
let _client: HttpChainClient | null = null

async function getClient(): Promise<{ client: HttpChainClient; info: ChainInfo }> {
  if (_client && _info) return { client: _client, info: _info }
  // Pick the first endpoint; HttpCachingChain handles retries internally.
  const chain = new HttpCachingChain(`${API_URLS[0]}/${CHAIN_HASH}`)
  const info = await chain.info()
  _info = info
  _client = new HttpChainClient(chain)
  return { client: _client, info }
}

/**
 * Compute the drand round number whose beacon will exist on/after the given
 * date. Rounds are deterministic: round n is produced at genesis + n*period.
 */
export async function roundFromDate(unlockDate: Date): Promise<number> {
  const { info } = await getClient()
  const targetSec = Math.floor(unlockDate.getTime() / 1000)
  const round = Math.ceil((targetSec - info.genesis_time) / info.period)
  return Math.max(1, round)
}

/**
 * Encrypt a 32-byte ephemeral key against the drand round that will exist
 * at unlockDate. Returns an Age-format armored string suitable for storage
 * in `LetterDelivery.tlockedKey`.
 */
export async function tlockEncryptKey(key: Uint8Array, unlockDate: Date): Promise<string> {
  if (key.byteLength !== 32) {
    throw new Error(`tlockEncryptKey: expected 32-byte key, got ${key.byteLength}`)
  }
  const { client } = await getClient()
  const round = await roundFromDate(unlockDate)
  // tlock-js wants a Buffer
  const buf = Buffer.from(key)
  return timelockEncrypt(round, buf, client)
}

/**
 * Decrypt a previously-tlock-encrypted key. Will throw until the drand round
 * for unlockDate has been produced (typically <3s after unlockDate).
 */
export async function tlockDecryptKey(tlocked: string, _unlockDate: Date): Promise<Uint8Array> {
  const { client } = await getClient()
  const decrypted = await timelockDecrypt(tlocked, client)
  return new Uint8Array(decrypted)
}
```

- [ ] **Step 2: Verify the import surface compiles**

```bash
docker compose exec app npx tsc --noEmit 2>&1 | grep -E "src/lib/letters/tlock" | head -10
```

Expected: no output (clean compile). If `tlock-js` doesn't expose a TypeScript type for `ChainInfo`, you may need to use `any` for `_info` — adjust and re-run.

- [ ] **Step 3: Manual smoke**

```bash
docker compose exec -e DRAND_CHAIN_HASH=52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971 \
  -e DRAND_API_URLS=https://api.drand.sh,https://api2.drand.sh,https://api3.drand.sh \
  app npx tsx -e "
  import { tlockEncryptKey, tlockDecryptKey, roundFromDate } from './src/lib/letters/tlock'
  ;(async () => {
    const k = crypto.getRandomValues(new Uint8Array(32))
    const date = new Date(Date.now() + 10_000)
    console.log('round', await roundFromDate(date))
    const ct = await tlockEncryptKey(k, date)
    console.log('ct head', ct.slice(0, 40))
  })()
"
```

Expected: prints a round number and the `-----BEGIN AGE ENCRYPTED FILE-----` ciphertext head. No exceptions.

- [ ] **Step 4: Commit**

```bash
git add src/lib/letters/tlock.ts
git commit -m "feat(letters): tlock helpers against quicknet"
```

---

## Task 3: Build `src/lib/letters/transient-crypto.ts`

**Files:**
- Create: `src/lib/letters/transient-crypto.ts`

- [ ] **Step 1: Write the helpers**

```typescript
// src/lib/letters/transient-crypto.ts
//
// AES-256-GCM under a random ephemeral key K. K is generated in
// friend-letter-client.ts, used here for transient encryption, then
// tlock-encrypted via tlock.ts. Server never sees K; only the holder of
// the URL fragment (after tlock unlocks) can decrypt.
//
// IV is base64-encoded; ciphertext is base64-encoded. The ephemeral key
// is passed as a raw 32-byte Uint8Array (imported on-the-fly here).

const ALGO = 'AES-GCM'
const IV_BYTES = 12

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

async function importTransientKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) {
    throw new Error(`transient key must be 32 bytes, got ${rawKey.byteLength}`)
  }
  return crypto.subtle.importKey('raw', rawKey as BufferSource, ALGO, false, ['encrypt', 'decrypt'])
}

export async function encryptTransient(
  plaintext: ArrayBuffer | Uint8Array,
  rawKey: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importTransientKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const pt = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv: iv as BufferSource }, key, pt as BufferSource)
  return { ciphertext: toBase64(ct), iv: toBase64(iv) }
}

export async function decryptTransient(
  ciphertextBase64: string,
  ivBase64: string,
  rawKey: Uint8Array
): Promise<Uint8Array> {
  const key = await importTransientKey(rawKey)
  const ct = fromBase64(ciphertextBase64)
  const iv = fromBase64(ivBase64)
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, ct as BufferSource)
  return new Uint8Array(pt)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
docker compose exec app npx tsc --noEmit 2>&1 | grep "transient-crypto" | head
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/lib/letters/transient-crypto.ts
git commit -m "feat(letters): transient-key AES helper for tlock payload"
```

---

## Task 4: Build `src/lib/letters/self-letter-client.ts`

**Files:**
- Create: `src/lib/letters/self-letter-client.ts`

- [ ] **Step 1: Decide the serialized shape and write the helper**

The letter "content" is a JSON shape — text + song + photo refs + doodle refs. We encrypt the whole JSON as one blob with one IV.

```typescript
// src/lib/letters/self-letter-client.ts
//
// Browser-side helper that turns a composed self-letter into the upload
// payload for POST /api/letters/self. Pure function — no fetch, no DOM.

import { encryptString } from '@/lib/e2ee/crypto'

export interface SelfLetterDraft {
  text: string
  song?: string | null
  photos?: Array<{ encryptedRef: string; encryptedRefIV: string; position: number; spread: number; rotation: number }>
  doodles?: Array<{ encryptedStrokes: string; e2eeIV: string; spread: number; positionInEntry: number }>
  letterLocation?: string | null
}

export interface SelfLetterUploadPayload {
  contentCiphertext: string
  contentIVs: { content: string }
  scheduledFor: string // ISO
  letterLocation?: string | null
}

export async function buildSelfLetterPayload(args: {
  draft: SelfLetterDraft
  unlockDate: Date
  masterKey: CryptoKey
}): Promise<SelfLetterUploadPayload> {
  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    photos: args.draft.photos ?? [],
    doodles: args.draft.doodles ?? [],
  })
  const { ciphertext, iv } = await encryptString(json, args.masterKey)
  return {
    contentCiphertext: ciphertext,
    contentIVs: { content: iv },
    scheduledFor: args.unlockDate.toISOString(),
    letterLocation: args.draft.letterLocation ?? null,
  }
}

export async function decryptSelfLetterContent(args: {
  contentCiphertext: string
  contentIVs: { content: string }
  masterKey: CryptoKey
}): Promise<SelfLetterDraft> {
  const { decryptString } = await import('@/lib/e2ee/crypto')
  const json = await decryptString(args.contentCiphertext, args.contentIVs.content, args.masterKey)
  return JSON.parse(json)
}
```

- [ ] **Step 2: Verify compile**

```bash
docker compose exec app npx tsc --noEmit 2>&1 | grep "self-letter-client" | head
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/lib/letters/self-letter-client.ts
git commit -m "feat(letters): self-letter client-side encrypt helper"
```

---

## Task 5: Build `src/lib/letters/friend-letter-client.ts`

**Files:**
- Create: `src/lib/letters/friend-letter-client.ts`

- [ ] **Step 1: Write the helper**

```typescript
// src/lib/letters/friend-letter-client.ts
//
// Browser-side helper for friend-letter writes:
//   1. Generate a random 32-byte ephemeral key K.
//   2. AES-encrypt the serialized letter content with K.
//   3. tlock-encrypt K against the drand round for unlockDate.
// Returns the upload payload for POST /api/letters/friend. The server
// never sees plaintext or K — only transientCiphertext, transientIV,
// and tlockedKey.

import { encryptTransient } from './transient-crypto'
import { tlockEncryptKey } from './tlock'

export interface FriendLetterDraft {
  text: string
  song?: string | null
  photos?: Array<{ url: string; position: number; spread: number; rotation: number }>
  doodles?: Array<{ strokes: unknown; spread: number; positionInEntry: number }>
}

export interface FriendLetterUploadPayload {
  transientCiphertext: string
  transientIV: string
  tlockedKey: string
  recipientEmail: string
  recipientName: string
  senderName: string
  scheduledFor: string
  letterLocation?: string | null
}

export async function buildFriendLetterPayload(args: {
  draft: FriendLetterDraft
  unlockDate: Date
  recipientEmail: string
  recipientName: string
  senderName: string
  letterLocation?: string | null
}): Promise<FriendLetterUploadPayload> {
  // Friend letters don't carry encrypted photo refs — photos are inlined
  // as URLs in the email render, and the in-browser read uses the same
  // URLs (already public via /api/photos). For E2EE photos, we'd need a
  // recipient-side photo-handle exchange — out of scope for v1 of friend
  // letters. Strip photos that aren't directly fetchable.
  const renderablePhotos = (args.draft.photos ?? []).filter((p) => !!p.url)

  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    photos: renderablePhotos,
    doodles: args.draft.doodles ?? [],
  })

  const plaintext = new TextEncoder().encode(json)
  const K = crypto.getRandomValues(new Uint8Array(32))
  const { ciphertext, iv } = await encryptTransient(plaintext, K)
  const tlockedKey = await tlockEncryptKey(K, args.unlockDate)
  // Best-effort: zero K from memory (JS can't guarantee this, but we try).
  K.fill(0)

  return {
    transientCiphertext: ciphertext,
    transientIV: iv,
    tlockedKey,
    recipientEmail: args.recipientEmail,
    recipientName: args.recipientName,
    senderName: args.senderName,
    scheduledFor: args.unlockDate.toISOString(),
    letterLocation: args.letterLocation ?? null,
  }
}
```

- [ ] **Step 2: Verify compile**

```bash
docker compose exec app npx tsc --noEmit 2>&1 | grep "friend-letter-client" | head
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/lib/letters/friend-letter-client.ts
git commit -m "feat(letters): friend-letter client-side encrypt+tlock helper"
```

---

## Task 6: Build `POST /api/letters/self`

**Files:**
- Create: `src/app/api/letters/self/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/letters/self/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  contentCiphertext: string
  contentIVs: { content: string }
  scheduledFor: string
  letterLocation?: string | null
  // If the compose flow had a draft JournalEntry, pass its id here so
  // the server can delete it after the Letter is written. Optional —
  // the caller may have already deleted it.
  draftEntryId?: string | null
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (!body.contentCiphertext || !body.contentIVs?.content) {
    return NextResponse.json({ error: 'missing ciphertext' }, { status: 400 })
  }
  if (!body.scheduledFor) {
    return NextResponse.json({ error: 'missing scheduledFor' }, { status: 400 })
  }
  const scheduledFor = new Date(body.scheduledFor)
  if (Number.isNaN(scheduledFor.valueOf())) {
    return NextResponse.json({ error: 'bad scheduledFor' }, { status: 400 })
  }
  // 1-week minimum (mirrors SealModal). No upper bound for self-letters.
  const minSec = 7 * 24 * 60 * 60
  if (scheduledFor.getTime() < Date.now() + minSec * 1000 - 60_000) {
    return NextResponse.json({ error: 'scheduledFor too soon' }, { status: 400 })
  }

  const letter = await prisma.letter.create({
    data: {
      userId: user.id,
      letterType: 'self',
      encryptionType: 'e2ee',
      contentCiphertext: body.contentCiphertext,
      contentIVs: body.contentIVs,
      scheduledFor,
      letterLocation: body.letterLocation ?? null,
      isSealed: true,
    },
    select: { id: true, scheduledFor: true, createdAt: true },
  })

  // Clean up the draft JournalEntry if the caller provided one and it
  // belongs to this user. Best-effort — we don't fail the write if the
  // delete throws.
  if (body.draftEntryId) {
    await prisma.journalEntry
      .deleteMany({ where: { id: body.draftEntryId, userId: user.id } })
      .catch(() => {})
  }

  return NextResponse.json({ letter })
}
```

- [ ] **Step 2: Verify compile and route mounts**

```bash
docker compose restart app
docker compose logs app --tail=30
```

Expected: clean restart, "Ready in ..." line, no compile errors mentioning `api/letters/self`.

- [ ] **Step 3: Smoke-test with curl (dev auth)**

Get an auth cookie first by logging into dev mode in the browser, then copy `hearth-auth-token` cookie value into env var `$TOK`:

```bash
docker compose exec app sh -c "curl -s -X POST http://localhost:3111/api/letters/self \
  -H 'content-type: application/json' \
  -H \"cookie: hearth-auth-token=$TOK\" \
  -d '{\"contentCiphertext\":\"abc\",\"contentIVs\":{\"content\":\"def\"},\"scheduledFor\":\"$(date -u -d '+8 days' +%Y-%m-%dT%H:%M:%SZ)\"}'"
```

Expected: JSON with `{letter: {id, scheduledFor, createdAt}}`. In Postgres, a new row in `letters` with `letterType='self'`, `encryptionType='e2ee'`, `contentCiphertext='abc'`.

```bash
docker compose exec db psql -U postgres hearth -c "select id, letter_type, encryption_type, scheduled_for from letters order by created_at desc limit 1"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/letters/self/route.ts
git commit -m "feat(letters): POST /api/letters/self — native self-letter write"
```

---

## Task 7: Build `POST /api/letters/friend`

**Files:**
- Create: `src/app/api/letters/friend/route.ts`
- Modify: `src/lib/email.ts` (add `sendFriendLetterTransientEmail` helper)

- [ ] **Step 1: Add the email helper to `src/lib/email.ts`**

Append to the bottom of `src/lib/email.ts` (preserve existing exports):

```typescript
/**
 * Phase 4 friend-letter transient delivery. Schedules a Resend email at
 * unlockDate with the magic URL. Returns Resend's email id so the
 * webhook can correlate later.
 */
export async function sendFriendLetterTransientEmail(args: {
  to: string
  recipientName: string | null
  senderName: string
  scheduledFor: Date
  publicToken: string
  tlockedKey: string
}): Promise<{ id: string }> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const url = `${appUrl}/letter/${args.publicToken}#k=${encodeURIComponent(args.tlockedKey)}`
  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>${args.senderName} wrote you a letter and asked us to deliver it today.</p>
      <p>
        <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #3d342a; color: #f6efe2; text-decoration: none; border-radius: 999px;">
          Open your letter
        </a>
      </p>
      <p style="font-size: 13px; opacity: 0.7;">
        The letter is yours for 24 hours after you open it, then it fades.
        Only you can read it — even Hearth's servers cannot.
      </p>
    </div>
  `
  const r = await getResend().emails.send({
    from,
    to: args.to,
    subject: `${args.senderName} sent you a letter`,
    html,
    scheduledAt: args.scheduledFor.toISOString(),
  })
  if (r.error) throw new Error(`Resend error: ${r.error.message}`)
  if (!r.data?.id) throw new Error('Resend returned no email id')
  return { id: r.data.id }
}
```

- [ ] **Step 2: Write the route**

Create `src/app/api/letters/friend/route.ts`:

```typescript
// src/app/api/letters/friend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { sendFriendLetterTransientEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

interface Body {
  transientCiphertext: string
  transientIV: string
  tlockedKey: string
  recipientEmail: string
  recipientName: string
  senderName: string
  scheduledFor: string
  letterLocation?: string | null
  draftEntryId?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function newPublicToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.transientCiphertext || !body.transientIV || !body.tlockedKey) {
    return NextResponse.json({ error: 'missing crypto fields' }, { status: 400 })
  }
  if (!EMAIL_RE.test(body.recipientEmail ?? '')) {
    return NextResponse.json({ error: 'bad recipientEmail' }, { status: 400 })
  }
  const scheduledFor = new Date(body.scheduledFor)
  if (Number.isNaN(scheduledFor.valueOf())) {
    return NextResponse.json({ error: 'bad scheduledFor' }, { status: 400 })
  }
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  if (scheduledFor.getTime() < Date.now() + sevenDaysMs - 60_000) {
    return NextResponse.json({ error: 'scheduledFor too soon (min 7 days)' }, { status: 400 })
  }
  if (scheduledFor.getTime() > Date.now() + thirtyDaysMs + 60_000) {
    return NextResponse.json({ error: 'scheduledFor too late (max 30 days)' }, { status: 400 })
  }

  // Create the Letter (receipt, no content) + LetterDelivery in one transaction,
  // then call Resend. If Resend fails, we delete the rows to avoid orphans.
  const publicToken = newPublicToken()
  const created = await prisma.$transaction(async (tx) => {
    const letter = await tx.letter.create({
      data: {
        userId: user.id,
        letterType: 'friend',
        encryptionType: 'e2ee',
        contentCiphertext: null,
        scheduledFor,
        recipientEmail: body.recipientEmail,
        recipientName: body.recipientName,
        senderName: body.senderName,
        letterLocation: body.letterLocation ?? null,
        isSealed: true,
      },
      select: { id: true },
    })
    const delivery = await tx.letterDelivery.create({
      data: {
        letterId: letter.id,
        transientCiphertext: body.transientCiphertext,
        transientIV: body.transientIV,
        tlockedKey: body.tlockedKey,
        publicToken,
      },
      select: { id: true, publicToken: true },
    })
    return { letterId: letter.id, delivery }
  })

  try {
    const { id } = await sendFriendLetterTransientEmail({
      to: body.recipientEmail,
      recipientName: body.recipientName,
      senderName: body.senderName,
      scheduledFor,
      publicToken,
      tlockedKey: body.tlockedKey,
    })
    await prisma.letterDelivery.update({
      where: { id: created.delivery.id },
      data: { resendEmailId: id },
    })
  } catch (e) {
    // Rollback rather than leave orphan crypto on disk.
    await prisma.letterDelivery.delete({ where: { id: created.delivery.id } }).catch(() => {})
    await prisma.letter.delete({ where: { id: created.letterId } }).catch(() => {})
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'resend failed' },
      { status: 502 }
    )
  }

  if (body.draftEntryId) {
    await prisma.journalEntry
      .deleteMany({ where: { id: body.draftEntryId, userId: user.id } })
      .catch(() => {})
  }

  return NextResponse.json({ letterId: created.letterId, publicToken })
}
```

- [ ] **Step 3: Smoke-test (dev auth, real Resend call to your test inbox)**

```bash
docker compose restart app
```

Then in the browser, log in as a dev user, open the network tab, and POST a friend letter via your normal compose UI (or curl with a real-looking payload). Verify:
1. A row appears in `letters` with `letter_type='friend'`, `content_ciphertext` is NULL, `recipient_email` set.
2. A row appears in `letter_deliveries` with `transient_ciphertext`, `tlocked_key`, `public_token`, and (after the Resend call) `resend_email_id`.
3. Resend's dashboard shows a "Scheduled" email to your recipient address.

```bash
docker compose exec db psql -U postgres hearth -c "
  select l.id, l.letter_type, l.recipient_email, l.scheduled_for, d.public_token, d.resend_email_id
  from letters l left join letter_deliveries d on d.letter_id = l.id
  where l.letter_type = 'friend' order by l.created_at desc limit 3;
"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/letters/friend/route.ts src/lib/email.ts
git commit -m "feat(letters): POST /api/letters/friend — write + tlock + Resend scheduledAt"
```

---

## Task 8: Refactor `ComposeView.handleSeal` to route through new APIs

**Files:**
- Modify: `src/components/letters/compose/ComposeView.tsx`

- [ ] **Step 1: Read current handleSeal**

Lines 256-290 (approximately):

```bash
docker compose exec app sed -n '255,290p' src/components/letters/compose/ComposeView.tsx
```

You'll see the current implementation calling `/api/entries/[id]/seal`. We're replacing that.

- [ ] **Step 2: Read the rest of ComposeView to learn the data shape**

You need to identify in the component:
- Where `recipient.recipient` ('self' | 'friend') comes from
- Where `bodyFront`, `bodyBack` (the text) come from
- Where `song`, photos, doodles, and `senderName` (sender's own name from profile) are sourced

```bash
docker compose exec app grep -nE "song|photos|doodles|senderName|profile" src/components/letters/compose/ComposeView.tsx | head -40
```

- [ ] **Step 3: Replace `handleSeal`**

In `src/components/letters/compose/ComposeView.tsx`, replace the existing `handleSeal` (around lines 256-290) with the version below. The new function:
1. Reads the master key from the e2ee store.
2. Branches on `recipient.recipient`.
3. Builds the right payload via the helpers from Tasks 4 and 5.
4. Calls the new API.
5. On success, deletes the draft JournalEntry (the server also tries via `draftEntryId`, this is belt-and-braces) and navigates to `/letters/sent`.

```typescript
import { useE2EEStore } from '@/store/e2ee'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import { buildFriendLetterPayload } from '@/lib/letters/friend-letter-client'

// ... inside the component, near useProfileStore():
const masterKey = useE2EEStore((s) => s.masterKey)
const userName = useProfileStore((s) => s.profile?.name ?? 'A friend')

async function handleSeal({
  unlockDate,
  recipientEmail,
}: {
  unlockDate: Date
  recipientEmail?: string
}) {
  await autosave.flush()
  const draftId = autosave.entryId
  if (!draftId) {
    throw new Error('Draft has not been saved yet — please add some text.')
  }
  if (!masterKey) {
    throw new Error('Unlock Hearth first — your master key is required to seal letters.')
  }

  const combinedText = [bodyFront, bodyBack].filter(Boolean).join('\n\n')

  if (recipient.recipient === 'self') {
    const payload = await buildSelfLetterPayload({
      draft: {
        text: combinedText,
        song,
        photos: [], // self letters reuse the existing photo storage — photo refs are encrypted via /api/photos already and stored on the draft entry; we don't duplicate them onto the letter for v1.
        doodles: [],
        letterLocation: null,
      },
      unlockDate,
      masterKey,
    })
    const res = await fetch('/api/letters/self', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, draftEntryId: draftId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? 'Could not save self letter.')
    }
    return
  }

  if (recipient.recipient === 'friend') {
    if (!recipientEmail) throw new Error('Recipient email missing.')
    const payload = await buildFriendLetterPayload({
      draft: {
        text: combinedText,
        song,
        photos: [],
        doodles: [],
      },
      unlockDate,
      recipientEmail,
      recipientName: recipient.name ?? 'Friend',
      senderName: userName,
      letterLocation: null,
    })
    const res = await fetch('/api/letters/friend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, draftEntryId: draftId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? 'Could not send friend letter.')
    }
    return
  }

  throw new Error(`Unknown recipient type: ${recipient.recipient}`)
}
```

**Note on photos and doodles:** v1 of Phase 4 ships **without** photos/doodles inside friend or self letters' encrypted bodies. The user can still attach them to the draft entry, but they won't carry across into the encrypted letter. This is a deliberate scope cut — photo storage is already E2EE via `/api/photos`, but cross-account decryption for "Keep forever" requires recipient-side photo-handle exchange that's out of v1 scope. Add it back in a follow-up if needed.

- [ ] **Step 4: Restart and smoke-test in the browser**

```bash
docker compose restart app
```

Open the compose flow → write something → seal as a self letter for 1 week out → check Postgres: a `letters` row appears, the draft `journal_entries` row is gone.

Repeat for a friend letter: seal for 7 days out, verify the `letters` + `letter_deliveries` rows + the Resend dashboard scheduled email.

- [ ] **Step 5: Commit**

```bash
git add src/components/letters/compose/ComposeView.tsx
git commit -m "feat(letters): route compose seal through new self/friend APIs"
```

---

## Task 9: Build `GET /api/letter/[token]/meta`

**Files:**
- Create: `src/app/api/letter/[token]/meta/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/letter/[token]/meta/route.ts
//
// Public, no-auth metadata for a friend letter delivery. Returns the
// scheduledFor (so the client can compute the drand round to fetch),
// sender/recipient display names (plaintext on the row), and a flag
// indicating whether the 24h read window is already used up.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: {
      firstReadAt: true,
      letter: {
        select: {
          scheduledFor: true,
          recipientName: true,
          senderName: true,
        },
      },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  const alreadyExpired =
    delivery.firstReadAt !== null &&
    delivery.firstReadAt.getTime() + 24 * 60 * 60 * 1000 < Date.now()

  return NextResponse.json({
    scheduledFor: delivery.letter.scheduledFor?.toISOString() ?? null,
    senderName: delivery.letter.senderName ?? null,
    recipientName: delivery.letter.recipientName ?? null,
    alreadyExpired,
  })
}
```

- [ ] **Step 2: Smoke-test**

```bash
docker compose restart app
# Use a publicToken from a row you created in Task 7:
TOKEN=$(docker compose exec db psql -U postgres hearth -At -c "select public_token from letter_deliveries order by created_at desc limit 1")
docker compose exec app sh -c "curl -s http://localhost:3111/api/letter/$TOKEN/meta"
```

Expected: JSON `{scheduledFor, senderName, recipientName, alreadyExpired: false}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/letter/[token]/meta/route.ts
git commit -m "feat(letters): GET /api/letter/[token]/meta — public delivery metadata"
```

---

## Task 10: Build `GET /api/letter/[token]/ciphertext`

**Files:**
- Create: `src/app/api/letter/[token]/ciphertext/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/letter/[token]/ciphertext/route.ts
//
// Returns the transient ciphertext + IV for a friend letter delivery.
// First call sets `firstReadAt` (starts the 24h read window). Calls
// after 24h return 410. No auth — the URL fragment K is the auth.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const READ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      transientCiphertext: true,
      transientIV: true,
      firstReadAt: true,
      transientExpiresAt: true,
      letter: { select: { id: true, scheduledFor: true } },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  // If unlock date hasn't passed, the client shouldn't be calling this yet —
  // they couldn't have derived K. Still, defend against it.
  if (delivery.letter.scheduledFor && delivery.letter.scheduledFor.getTime() > Date.now()) {
    return NextResponse.json({ reason: 'not_yet' }, { status: 425 })
  }

  // 24h check
  if (delivery.firstReadAt) {
    const expired = delivery.firstReadAt.getTime() + READ_WINDOW_MS < Date.now()
    if (expired) {
      return NextResponse.json({ reason: 'expired' }, { status: 410 })
    }
  } else {
    // First read — set firstReadAt and transientExpiresAt, mirror onto Letter
    const firstReadAt = new Date()
    const transientExpiresAt = new Date(firstReadAt.getTime() + READ_WINDOW_MS)
    await prisma.$transaction([
      prisma.letterDelivery.update({
        where: { id: delivery.id },
        data: { firstReadAt, transientExpiresAt },
      }),
      prisma.letter.update({
        where: { id: delivery.letter.id },
        data: { firstReadAt },
      }),
    ])
  }

  return NextResponse.json({
    transientCiphertext: delivery.transientCiphertext,
    transientIV: delivery.transientIV,
  })
}
```

- [ ] **Step 2: Smoke-test (use a token whose scheduledFor has passed)**

For a quick smoke, temporarily seed a `letter_deliveries` row whose backing letter has `scheduledFor` in the past, or wait for Resend to deliver one from Task 7. Then:

```bash
docker compose exec app sh -c "curl -si http://localhost:3111/api/letter/$TOKEN/ciphertext"
```

Expected on first call: `200` with `{transientCiphertext, transientIV}`. Expected on next call within 24h: same body. After 24h: `410 {reason: 'expired'}`.

```bash
docker compose exec db psql -U postgres hearth -c "select id, first_read_at, transient_expires_at from letter_deliveries where public_token='$TOKEN'"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/letter/[token]/ciphertext/route.ts
git commit -m "feat(letters): GET /api/letter/[token]/ciphertext with 24h window"
```

---

## Task 11: Rewrite `src/app/letter/[token]/page.tsx` for client-side decrypt

**Files:**
- Modify: `src/app/letter/[token]/page.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```typescript
// src/app/letter/[token]/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { tlockDecryptKey } from '@/lib/letters/tlock'
import { decryptTransient } from '@/lib/letters/transient-crypto'

type LetterContent = {
  text: string
  song: string | null
  photos: Array<{ url: string; position: number; spread: number; rotation: number }>
  doodles: unknown[]
}

type State =
  | { kind: 'loading'; stage: string }
  | { kind: 'not_yet'; scheduledFor: string }
  | { kind: 'expired' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: LetterContent; senderName: string; recipientName: string; expiresAt: Date }

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

export default function LetterPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading', stage: 'reading link' })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function run() {
      try {
        // 1) URL fragment carries the tlocked key
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        const m = hash.match(/(?:^#|&)k=([^&]+)/)
        if (!m) {
          setState({ kind: 'error', message: 'Missing key in URL. The letter link is incomplete.' })
          return
        }
        const tlockedKey = decodeURIComponent(m[1])

        // 2) Meta
        setState({ kind: 'loading', stage: 'fetching letter info' })
        const metaRes = await fetch(`/api/letter/${params.token}/meta`)
        if (metaRes.status === 404) return setState({ kind: 'not_found' })
        if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`)
        const meta = (await metaRes.json()) as {
          scheduledFor: string | null
          senderName: string | null
          recipientName: string | null
          alreadyExpired: boolean
        }
        if (meta.alreadyExpired) return setState({ kind: 'expired' })
        if (!meta.scheduledFor) throw new Error('letter has no scheduledFor')
        const scheduledFor = new Date(meta.scheduledFor)
        if (scheduledFor.getTime() > Date.now()) {
          return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        }

        // 3) Tlock-decrypt K (drand round must be available)
        setState({ kind: 'loading', stage: 'fetching time-lock beacon' })
        const K = await tlockDecryptKey(tlockedKey, scheduledFor)

        // 4) Fetch ciphertext (sets firstReadAt server-side)
        setState({ kind: 'loading', stage: 'fetching ciphertext' })
        const ctRes = await fetch(`/api/letter/${params.token}/ciphertext`)
        if (ctRes.status === 410) return setState({ kind: 'expired' })
        if (ctRes.status === 425) return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        if (ctRes.status === 404) return setState({ kind: 'not_found' })
        if (!ctRes.ok) throw new Error(`ciphertext ${ctRes.status}`)
        const { transientCiphertext, transientIV } = await ctRes.json()

        // 5) AES-decrypt with K
        setState({ kind: 'loading', stage: 'decrypting' })
        const plaintextBytes = await decryptTransient(transientCiphertext, transientIV, K)
        const json = new TextDecoder().decode(plaintextBytes)
        const data: LetterContent = JSON.parse(json)

        // Cache decrypted content for the Keep-forever flow (sessionStorage,
        // tab-scoped). Cleared after save.
        try {
          sessionStorage.setItem(
            `${SESSION_KEY_PREFIX}${params.token}`,
            JSON.stringify({
              content: data,
              senderName: meta.senderName ?? 'Someone special',
              recipientName: meta.recipientName ?? 'Friend',
              scheduledFor: meta.scheduledFor,
            })
          )
        } catch {
          /* sessionStorage might be disabled; not fatal */
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        setState({
          kind: 'ok',
          data,
          senderName: meta.senderName ?? 'Someone special',
          recipientName: meta.recipientName ?? 'Friend',
          expiresAt,
        })
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    }
    run()
  }, [params.token])

  if (state.kind === 'loading') {
    return <CenteredMessage title="Reading your letter" sub={state.stage} />
  }
  if (state.kind === 'not_yet') {
    return (
      <CenteredMessage
        title="This letter isn't ready yet."
        sub={`It will unlock on ${new Date(state.scheduledFor).toLocaleString()}.`}
      />
    )
  }
  if (state.kind === 'expired') {
    return <CenteredMessage title="This letter has faded." sub="It was yours for 24 hours after you opened it. We don't keep copies." />
  }
  if (state.kind === 'not_found') {
    return <CenteredMessage title="We couldn't find this letter." sub="The link may be incorrect, or the letter was deleted." />
  }
  if (state.kind === 'error') {
    return <CenteredMessage title="Something went wrong." sub={state.message} />
  }

  // OK — render the letter
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f6efe2',
        color: '#3d342a',
        padding: '40px 24px',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ opacity: 0.6, fontSize: 14, marginBottom: 24 }}>
          From <strong>{state.senderName}</strong> · For <strong>{state.recipientName}</strong>
        </div>
        <Countdown expiresAt={state.expiresAt} />
        <article
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 18 }}
          dangerouslySetInnerHTML={{ __html: state.data.text }}
        />
        {state.data.song && (
          <p style={{ marginTop: 32, fontSize: 14, opacity: 0.7 }}>
            Song they sent: <a href={state.data.song}>{state.data.song}</a>
          </p>
        )}
        <KeepForeverCTA token={params.token} router={router} />
      </div>
    </div>
  )
}

function CenteredMessage({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6efe2',
        color: '#3d342a',
        padding: 24,
        fontFamily: 'Georgia, serif',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>{title}</h1>
        {sub && <p style={{ opacity: 0.7 }}>{sub}</p>}
      </div>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: Date }) {
  const [remaining, setRemaining] = useState(expiresAt.getTime() - Date.now())
  useEffect(() => {
    const id = setInterval(() => setRemaining(expiresAt.getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  if (remaining <= 0) return null
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  return (
    <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>
      This letter fades in {h}h {m}m.
    </p>
  )
}

function KeepForeverCTA({ token, router }: { token: string; router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function onSave() {
    setBusy(true); setErr(null)
    try {
      // Check whether the recipient is logged in. /api/auth/me returns 401 if not.
      const meRes = await fetch('/api/auth/me')
      if (meRes.ok) {
        // Logged in — drive the save inline (Task 13).
        router.push(`/letter/${token}/save?logged_in=1`)
      } else {
        // Not logged in — magic-link signup flow (Task 14).
        router.push(`/letter/${token}/save`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
      setBusy(false)
    }
  }
  return (
    <div style={{ marginTop: 48 }}>
      <button
        disabled={busy}
        onClick={onSave}
        style={{
          padding: '12px 24px',
          background: '#3d342a',
          color: '#f6efe2',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'inherit',
          fontSize: 15,
          cursor: 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? 'Just a moment...' : 'Keep this letter forever'}
      </button>
      {err && <p style={{ color: '#a00', marginTop: 12 }}>{err}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Restart and smoke-test**

```bash
docker compose restart app
```

Open the magic link from a Resend-delivered email (or construct one manually with a token whose `scheduledFor` is in the past — back-date a `letter_deliveries` row in the DB for testing):

```bash
docker compose exec db psql -U postgres hearth -c "update letters set scheduled_for = now() - interval '1 minute' where id = (select letter_id from letter_deliveries where public_token = '$TOKEN')"
```

Visit `http://localhost:3112/letter/<TOKEN>#k=<TLOCKEDKEY>` (URL-encode the tlockedKey if it has special chars). Expected sequence: "Reading your letter" → "fetching letter info" → "fetching time-lock beacon" (a few seconds) → "decrypting" → rendered letter. The 24h countdown shows. The "Keep this letter forever" button is visible.

Refresh the page: same letter renders (ciphertext re-fetches; still within 24h).

- [ ] **Step 3: Commit**

```bash
git add src/app/letter/[token]/page.tsx
git commit -m "feat(letters): client-side tlock-decrypt page with 24h countdown"
```

---

## Task 12: Build `POST /api/letters/save-received`

**Files:**
- Create: `src/app/api/letters/save-received/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/letters/save-received/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface Body {
  publicToken: string
  contentCiphertext: string
  contentIVs: { content: string }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.publicToken || !body.contentCiphertext || !body.contentIVs?.content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: body.publicToken },
    select: {
      id: true,
      firstReadAt: true,
      letter: {
        select: {
          id: true,
          userId: true, // original sender
          senderName: true,
          recipientName: true,
          letterLocation: true,
          scheduledFor: true,
          savedByRecipientAt: true,
        },
      },
    },
  })
  if (!delivery) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Must have been read at least once (otherwise client doesn't have the
  // plaintext to re-encrypt). Outside the 24h window we still allow the
  // save because the client already decrypted — but the LetterDelivery
  // ciphertext fetch would have already returned 410 anyway, so this is
  // a belt-and-braces check.
  if (!delivery.firstReadAt) {
    return NextResponse.json({ error: 'letter not opened yet' }, { status: 409 })
  }
  if (delivery.letter.savedByRecipientAt) {
    return NextResponse.json({ error: 'already saved' }, { status: 409 })
  }

  const savedAt = new Date()
  const [letter] = await prisma.$transaction([
    prisma.letter.create({
      data: {
        userId: user.id,
        letterType: 'received-friend',
        encryptionType: 'e2ee',
        contentCiphertext: body.contentCiphertext,
        contentIVs: body.contentIVs,
        scheduledFor: delivery.letter.scheduledFor,
        senderName: delivery.letter.senderName,
        recipientName: delivery.letter.recipientName,
        letterLocation: delivery.letter.letterLocation,
        originalSenderId: delivery.letter.userId,
        originalLetterId: delivery.letter.id,
        isSealed: true,
        isReceivedLetter: true,
        savedByRecipientAt: savedAt,
      },
      select: { id: true },
    }),
    prisma.letter.update({
      where: { id: delivery.letter.id },
      data: { savedByRecipientAt: savedAt },
    }),
    prisma.letterDelivery.update({
      where: { id: delivery.id },
      data: { firstReadAt: delivery.firstReadAt }, // no-op; force write to invalidate any caches
    }),
  ])

  return NextResponse.json({ letterId: letter.id })
}
```

- [ ] **Step 2: Restart**

```bash
docker compose restart app
```

(Smoke test happens in Task 13 + Task 14 when the client wires it up.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/letters/save-received/route.ts
git commit -m "feat(letters): POST /api/letters/save-received — recipient keeps"
```

---

## Task 13: `Keep forever` (logged-in path) — wire `/letter/[token]/save?logged_in=1`

**Files:**
- Create: `src/app/letter/[token]/save/page.tsx`

- [ ] **Step 1: Write the save page (logged-in branch first; Task 14 adds the OTP branch)**

```typescript
// src/app/letter/[token]/save/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useE2EEStore } from '@/store/e2ee'
import { encryptString } from '@/lib/e2ee/crypto'

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

interface CachedLetter {
  content: { text: string; song: string | null; photos: unknown[]; doodles: unknown[] }
  senderName: string
  recipientName: string
  scheduledFor: string
}

export default function SavePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const loggedInHint = search.get('logged_in') === '1'

  const masterKey = useE2EEStore((s) => s.masterKey)
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'need_otp' }
    | { kind: 'saving' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Pull cached decrypted content from sessionStorage
      const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${params.token}`)
      if (!raw) {
        setState({
          kind: 'error',
          message: 'We lost the decrypted letter. Please reopen the original link to try again.',
        })
        return
      }
      const cached: CachedLetter = JSON.parse(raw)

      // Branch 1: already logged in + unlocked
      if (loggedInHint && masterKey) {
        setState({ kind: 'saving' })
        const { ciphertext, iv } = await encryptString(
          JSON.stringify(cached.content),
          masterKey
        )
        const res = await fetch('/api/letters/save-received', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            publicToken: params.token,
            contentCiphertext: ciphertext,
            contentIVs: { content: iv },
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          if (!cancelled) setState({ kind: 'error', message: j.error ?? 'Save failed.' })
          return
        }
        sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${params.token}`)
        if (!cancelled) setState({ kind: 'done' })
        setTimeout(() => router.push('/me'), 1200)
        return
      }

      // Branch 2: not logged in → OTP flow (Task 14 fills this in)
      if (!cancelled) setState({ kind: 'need_otp' })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [params.token, masterKey, loggedInHint, router])

  if (state.kind === 'loading') {
    return <Centered title="Saving your letter..." />
  }
  if (state.kind === 'saving') {
    return <Centered title="Encrypting and saving..." sub="Just a few seconds." />
  }
  if (state.kind === 'done') {
    return <Centered title="Saved." sub="Your letter is in your Hearth account." />
  }
  if (state.kind === 'error') {
    return <Centered title="We couldn't save the letter." sub={state.message} />
  }
  if (state.kind === 'need_otp') {
    return <OtpFlow token={params.token} />
  }
  return null
}

function Centered({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6efe2',
        color: '#3d342a',
        padding: 24,
        fontFamily: 'Georgia, serif',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>{title}</h1>
        {sub && <p style={{ opacity: 0.7 }}>{sub}</p>}
      </div>
    </div>
  )
}

// Task 14 implements this component.
function OtpFlow({ token: _ }: { token: string }) {
  return <Centered title="Sign in to keep this letter" sub="(OTP flow not yet wired — Task 14)" />
}
```

- [ ] **Step 2: Smoke-test the logged-in branch**

1. Sign in to dev mode as user A.
2. Send a friend letter from A → A's email (your own email, to keep it local).
3. Wait for Resend to deliver.
4. Open the link in the same browser tab (still signed in as A).
5. Read the letter. Click "Keep this letter forever."
6. The save page should immediately go through `loading → saving → done` and redirect to `/me`.
7. Verify in DB:

```bash
docker compose exec db psql -U postgres hearth -c "
  select id, letter_type, original_sender_id, original_letter_id, saved_by_recipient_at
  from letters where letter_type = 'received-friend' order by created_at desc limit 1;
"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/letter/[token]/save/page.tsx
git commit -m "feat(letters): Keep forever — logged-in branch"
```

---

## Task 14: `Keep forever` (OTP signup branch) — wire OtpFlow

**Files:**
- Modify: `src/app/letter/[token]/save/page.tsx`

This task replaces the stub `OtpFlow` from Task 13. It collects the recipient's email, sends an OTP, verifies, signs the user in, triggers onboarding, then re-runs the save with the freshly-set master key.

- [ ] **Step 1: Read the existing OTP send/verify routes**

```bash
docker compose exec app cat src/app/api/auth/resend-otp/route.ts
docker compose exec app grep -n "verify_otp\|email_signup" src/app/api/auth/login/route.ts | head
```

You'll see `/api/auth/resend-otp` (POST `{email}`) and `/api/auth/login` (POST with `action: 'verify_otp'`). Use these.

- [ ] **Step 2: Replace the `OtpFlow` stub with a real implementation**

In `src/app/letter/[token]/save/page.tsx`, replace the entire `OtpFlow` function with the version below. The `useE2EEStore` and `encryptString` imports already exist at the top of the file from Task 13 — do **not** re-import; just use them:

```typescript
function OtpFlow({ token }: { token: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<'email' | 'code' | 'onboarding' | 'saving' | 'done' | 'error'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const masterKey = useE2EEStore((s) => s.masterKey)
  const showSetupModal = useE2EEStore((s) => s.showSetupModal)
  const setShowSetupModal = useE2EEStore((s) => s.setShowSetupModal)

  async function sendCode() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Could not send code.')
      }
      setStage('code')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
    } finally { setBusy(false) }
  }

  async function verifyCode() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', email, token: code }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Invalid code.')
      }
      // Force E2EE onboarding modal — the new user has no master key yet.
      setShowSetupModal(true)
      setStage('onboarding')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
    } finally { setBusy(false) }
  }

  // When onboarding completes, the e2ee store sets masterKey. Watch for it
  // and trigger the save automatically.
  useEffect(() => {
    if (stage !== 'onboarding') return
    if (!masterKey) return
    if (showSetupModal) return // user hasn't finished yet
    ;(async () => {
      setStage('saving')
      try {
        const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${token}`)
        if (!raw) throw new Error('Lost the decrypted letter — try reopening the original link.')
        const cached: CachedLetter = JSON.parse(raw)
        const { ciphertext, iv } = await encryptString(JSON.stringify(cached.content), masterKey)
        const r = await fetch('/api/letters/save-received', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            publicToken: token,
            contentCiphertext: ciphertext,
            contentIVs: { content: iv },
          }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error ?? 'Save failed.')
        }
        sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${token}`)
        setStage('done')
        setTimeout(() => router.push('/me'), 1200)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'unknown error')
        setStage('error')
      }
    })()
  }, [stage, masterKey, showSetupModal, token, router])

  // Render
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6efe2',
        color: '#3d342a',
        padding: 24,
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%' }}>
        {stage === 'email' && (
          <>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Sign up to keep this letter</h1>
            <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 15 }}>
              We'll email you a 6-digit code. Saving the letter takes one minute.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              style={{ width: '100%', padding: '12px 16px', fontSize: 16, borderRadius: 8, border: '1px solid #3d342a33', background: '#fff' }}
            />
            <button onClick={sendCode} disabled={busy || !email} style={primaryBtn}>Send code</button>
          </>
        )}
        {stage === 'code' && (
          <>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Check your inbox.</h1>
            <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 15 }}>
              We sent a 6-digit code to {email}.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
              style={{ width: '100%', padding: '12px 16px', fontSize: 16, borderRadius: 8, border: '1px solid #3d342a33', background: '#fff' }}
            />
            <button onClick={verifyCode} disabled={busy || code.length < 4} style={primaryBtn}>Verify</button>
          </>
        )}
        {stage === 'onboarding' && (
          <Centered title="Set up your account..." sub="Pick a passphrase to encrypt your new letter." />
        )}
        {stage === 'saving' && <Centered title="Encrypting and saving..." />}
        {stage === 'done' && <Centered title="Saved." sub="Heading to your Hearth..." />}
        {stage === 'error' && <Centered title="Something went wrong." sub={err ?? ''} />}
        {err && stage !== 'error' && <p style={{ color: '#a00', marginTop: 12 }}>{err}</p>}
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '12px 24px',
  background: '#3d342a',
  color: '#f6efe2',
  border: 'none',
  borderRadius: 999,
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
}
```

- [ ] **Step 3: Verify the E2EE setup modal works when triggered outside its usual context**

The Phase 1 `E2EEOnboardingModal` is rendered globally via `LayoutContent` based on the e2ee store's `showSetupModal` flag. Once `setShowSetupModal(true)` runs, the modal should appear and drive the user through passphrase + recovery key + confirm. If it doesn't, audit `src/components/LayoutContent.tsx` for the `showSetupModal` branch and confirm it isn't gated on a specific pathname.

```bash
docker compose exec app grep -n "showSetupModal\|E2EEOnboardingModal" src/components/LayoutContent.tsx src/app/layout.tsx 2>/dev/null
```

If `LayoutContent` gates the modal on `pathname !== '/letter/'`, add `/letter/[token]/save` to the allowlist explicitly.

- [ ] **Step 4: Smoke-test the full magic-link path**

1. Open the magic link in an **incognito tab** so you're a logged-out user.
2. Read the letter, click "Keep this letter forever."
3. Land on `/letter/[token]/save`, OTP flow appears.
4. Enter your email → submit. (In dev mode `isDevAuth=true`, the route returns `{success: true, message: 'Dev auth — no OTP needed'}` — in that case the form just immediately verifies. In Supabase mode, real OTP email arrives.)
5. Enter code → onboarding modal appears.
6. Set passphrase → save recovery key → confirm. Master key lands in zustand store.
7. The `useEffect` watching `masterKey` triggers the save automatically.
8. Land on `/me` with the kept letter.

Verify in DB the new `letters` row owned by the new user, with `letter_type='received-friend'`.

- [ ] **Step 5: Commit**

```bash
git add src/app/letter/[token]/save/page.tsx
git commit -m "feat(letters): Keep forever — OTP signup → onboarding → save"
```

---

## Task 15: Resend webhook handler

**Files:**
- Create: `src/lib/letters/resend-webhook.ts`
- Create: `src/app/api/webhooks/resend/route.ts`

- [ ] **Step 1: Write the signature verifier**

Resend uses Svix-style HMAC signatures. The header is `svix-id`, `svix-timestamp`, `svix-signature`. Implement verification:

```typescript
// src/lib/letters/resend-webhook.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ResendEventEnvelope {
  type: string
  data: Record<string, unknown>
}

export function verifyResendSignature(args: {
  rawBody: string
  svixId: string
  svixTimestamp: string
  svixSignature: string
  secret: string
}): boolean {
  // secret comes in like "whsec_xxx"; the Svix verification uses the part
  // after the underscore base64-decoded.
  const secretBase64 = args.secret.startsWith('whsec_') ? args.secret.slice('whsec_'.length) : args.secret
  const secretBytes = Buffer.from(secretBase64, 'base64')
  const signed = `${args.svixId}.${args.svixTimestamp}.${args.rawBody}`
  const expected = createHmac('sha256', secretBytes).update(signed).digest('base64')
  // svix-signature can carry multiple comma-separated "v1,<sig>" entries
  const sigs = args.svixSignature.split(' ').flatMap((s) => s.split(','))
  for (const sig of sigs) {
    const m = sig.match(/^v1,(.+)$/)
    if (!m) continue
    const got = Buffer.from(m[1], 'base64')
    const want = Buffer.from(expected, 'base64')
    if (got.length === want.length && timingSafeEqual(got, want)) return true
  }
  return false
}
```

- [ ] **Step 2: Write the route**

```typescript
// src/app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyResendSignature } from '@/lib/letters/resend-webhook'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })

  const svixId = request.headers.get('svix-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? ''
  const rawBody = await request.text()

  if (!verifyResendSignature({ rawBody, svixId, svixTimestamp, svixSignature, secret })) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { email_id?: string; reason?: string } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const emailId = event.data?.email_id
  if (!emailId) {
    return NextResponse.json({ ignored: true })
  }

  const delivery = await prisma.letterDelivery.findFirst({
    where: { resendEmailId: emailId },
    select: { id: true, letterId: true },
  })
  if (!delivery) return NextResponse.json({ ignored: 'unknown email id' })

  switch (event.type) {
    case 'email.sent':
    case 'email.delivered':
      await prisma.letter.update({
        where: { id: delivery.letterId },
        data: { isDelivered: true, deliveredAt: new Date() },
      })
      break
    case 'email.bounced':
      await prisma.letter.update({
        where: { id: delivery.letterId },
        data: { bouncedAt: new Date(), bouncedReason: event.data?.reason ?? 'bounced' },
      })
      break
    default:
      // ignore opened/clicked/etc.
      break
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Configure the webhook in Resend dashboard (out-of-band)**

In Resend's dashboard, add a webhook endpoint pointing at `${NEXT_PUBLIC_APP_URL}/api/webhooks/resend` (for prod) and copy the signing secret into `RESEND_WEBHOOK_SECRET` in your env.

For local dev, you can use `resend events` CLI or skip webhook testing locally — `Letter.deliveredAt` won't be set in dev, but that's fine for v1.

- [ ] **Step 4: Smoke-test (optional in dev)**

If you have webhook forwarding set up, send a friend letter with `scheduledFor` = now + 1 minute, wait. Resend delivers, fires `email.sent`, your local server receives it, `Letter.isDelivered` flips to true.

- [ ] **Step 5: Commit**

```bash
git add src/lib/letters/resend-webhook.ts src/app/api/webhooks/resend/route.ts
git commit -m "feat(letters): Resend webhook handler for delivery / bounce"
```

---

## Task 16: `GET /api/cron/self-letter-reminders`

**Files:**
- Create: `src/app/api/cron/self-letter-reminders/route.ts`
- Modify: `src/lib/email.ts` (add `sendSelfLetterReminderEmail`)

- [ ] **Step 1: Add the email helper**

Append to `src/lib/email.ts`:

```typescript
export async function sendSelfLetterReminderEmail(args: {
  to: string
  recipientName: string | null
  writtenOn: Date
}): Promise<void> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const writtenStr = args.writtenOn.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>A letter you wrote to yourself on ${writtenStr} is ready to be read.</p>
      <p><a href="${appUrl}/letters" style="display:inline-block;padding:12px 24px;background:#3d342a;color:#f6efe2;text-decoration:none;border-radius:999px;">Open Hearth</a></p>
      <p style="font-size: 13px; opacity: 0.7;">Open the app to unlock and read it — your phrase is the key.</p>
    </div>
  `
  const r = await getResend().emails.send({ from, to: args.to, subject: 'Your letter is ready', html })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
}
```

- [ ] **Step 2: Write the cron route**

```typescript
// src/app/api/cron/self-letter-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendSelfLetterReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const due = await prisma.letter.findMany({
    where: {
      letterType: 'self',
      deliveredAt: null,
      scheduledFor: { lte: now },
    },
    select: {
      id: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
    take: 100,
  })

  const errors: string[] = []
  let processed = 0
  for (const l of due) {
    try {
      await sendSelfLetterReminderEmail({
        to: l.user.email,
        recipientName: l.user.name ?? null,
        writtenOn: l.createdAt,
      })
      await prisma.letter.update({ where: { id: l.id }, data: { deliveredAt: new Date(), isDelivered: true } })
      processed++
    } catch (e) {
      errors.push(`${l.id}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ processed, errors })
}
```

- [ ] **Step 3: Smoke-test**

Seed a self-letter due now:

```bash
docker compose exec db psql -U postgres hearth -c "
  update letters set scheduled_for = now() - interval '1 minute', delivered_at = null
  where letter_type = 'self' order by created_at desc limit 1;
"
```

Run the cron:

```bash
docker compose exec app sh -c "curl -s -H 'authorization: Bearer $CRON_SECRET' http://localhost:3111/api/cron/self-letter-reminders"
```

Expected: `{processed: 1, errors: []}`, the reminder email arrives in your inbox, the letter's `delivered_at` is set.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/self-letter-reminders/route.ts src/lib/email.ts
git commit -m "feat(letters): self-letter reminder cron"
```

---

## Task 17: `GET /api/cron/letter-cleanup`

**Files:**
- Create: `src/app/api/cron/letter-cleanup/route.ts`

- [ ] **Step 1: Write the cron**

```typescript
// src/app/api/cron/letter-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const twentyFourHrAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const result = await prisma.letterDelivery.deleteMany({
    where: {
      OR: [
        { firstReadAt: { lt: twentyFourHrAgo } },
        { AND: [{ firstReadAt: null }, { createdAt: { lt: sixtyDaysAgo } }] },
      ],
    },
  })

  return NextResponse.json({ deleted: result.count })
}
```

- [ ] **Step 2: Smoke-test**

Back-date a delivery row to simulate expiry:

```bash
docker compose exec db psql -U postgres hearth -c "
  update letter_deliveries set first_read_at = now() - interval '25 hours'
  where id = (select id from letter_deliveries order by created_at desc limit 1);
"
docker compose exec app sh -c "curl -s -H 'authorization: Bearer $CRON_SECRET' http://localhost:3111/api/cron/letter-cleanup"
```

Expected: `{deleted: 1}`. The matching row is gone from `letter_deliveries`; its sibling `letters` row persists.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/letter-cleanup/route.ts
git commit -m "feat(letters): letter-cleanup cron (24h expiry + 60d unread)"
```

---

## Task 18: `POST /api/letters/[id]/ask-for-copy`

**Files:**
- Create: `src/app/api/letters/[id]/ask-for-copy/route.ts`
- Modify: `src/lib/email.ts` (add `sendAskForCopyEmail`)
- Create: `src/lib/billing/is-paid-user.ts`

- [ ] **Step 1: Build the paid-user helper**

```typescript
// src/lib/billing/is-paid-user.ts
export function isPaidUser(user: {
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
}): boolean {
  if (!user.subscriptionStatus) return false
  if (!['active', 'on_trial'].includes(user.subscriptionStatus)) return false
  if (user.currentPeriodEnd && user.currentPeriodEnd.getTime() < Date.now()) return false
  return true
}
```

- [ ] **Step 2: Add the email helper**

Append to `src/lib/email.ts`:

```typescript
export async function sendAskForCopyEmail(args: {
  to: string
  recipientName: string | null
  senderName: string
}): Promise<void> {
  const from = process.env.RESEND_FROM_LETTERS
  if (!from) throw new Error('RESEND_FROM_LETTERS not set')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL not set')

  const greeting = args.recipientName ? `Hi ${args.recipientName},` : 'Hello,'
  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.6; color: #3d342a;">
      <p>${greeting}</p>
      <p>${args.senderName} has been thinking about the letter you saved and would love to read it again.</p>
      <p>If you'd like to send a copy back to them, open Hearth and find the letter in your kept letters.</p>
      <p><a href="${appUrl}/me" style="display:inline-block;padding:12px 24px;background:#3d342a;color:#f6efe2;text-decoration:none;border-radius:999px;">Open Hearth</a></p>
    </div>
  `
  const r = await getResend().emails.send({
    from,
    to: args.to,
    subject: `${args.senderName} is asking about a letter`,
    html,
  })
  if (r.error) throw new Error(`Resend: ${r.error.message}`)
}
```

- [ ] **Step 3: Write the route**

```typescript
// src/app/api/letters/[id]/ask-for-copy/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { isPaidUser } from '@/lib/billing/is-paid-user'
import { sendAskForCopyEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, subscriptionStatus: true, currentPeriodEnd: true },
  })
  if (!dbUser) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isPaidUser(dbUser)) {
    return NextResponse.json({ error: 'paid feature' }, { status: 402 })
  }

  const { id } = await params
  const letter = await prisma.letter.findFirst({
    where: { id, userId: user.id, letterType: 'friend' },
    select: { recipientEmail: true, recipientName: true, savedByRecipientAt: true },
  })
  if (!letter) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!letter.savedByRecipientAt) {
    return NextResponse.json({ error: 'recipient has not saved this letter' }, { status: 409 })
  }
  if (!letter.recipientEmail) {
    return NextResponse.json({ error: 'no recipient email' }, { status: 409 })
  }

  await sendAskForCopyEmail({
    to: letter.recipientEmail,
    recipientName: letter.recipientName ?? null,
    senderName: dbUser.name ?? 'A friend',
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Smoke-test**

Seed a paid user (set `subscriptionStatus='active'` on your dev row) and a friend letter with `savedByRecipientAt` set. POST to `/api/letters/<id>/ask-for-copy`. Expected: `{ok: true}` and the email lands in the recipient's inbox.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/letters/[id]/ask-for-copy/route.ts src/lib/billing/is-paid-user.ts src/lib/email.ts
git commit -m "feat(letters): paid ask-for-copy endpoint + helper"
```

---

## Task 19: Surface "Ask for copy" and status timeline in sender receipt UI

**Files:**
- Modify: `src/app/api/letters/sent/route.ts` (add new status fields)
- Create: `src/components/letters/AskForCopyButton.tsx`
- Create: `src/components/letters/SenderReceiptStatus.tsx`
- Modify: whichever component renders the sent-letters list (find via grep)

- [ ] **Step 1: Find the sent-letters component**

```bash
docker compose exec app grep -rln "stamps\|fromSent\|sentLetters\|SentLetter" src/components/letters src/app/letters 2>/dev/null | head
```

Likely candidates: `src/components/letters/SentLettersJar.tsx` or similar — open the one that renders the list of sent letters.

- [ ] **Step 2: Update the sent route response**

In `src/app/api/letters/sent/route.ts`, expand the `SentStamp` type and the `result` mapping to include the Phase 4 status fields. The Phase 2 dual-read helper sources state from JournalEntry for backfilled rows; for native Letter rows, we read directly. Update `listLettersForRead` (or read native Letter rows directly here):

Open `src/lib/letters/dual-read.ts` to see what's returned. We need: `savedByRecipientAt`, `bouncedAt`, `bouncedReason`, `firstReadAt`. If the dual-read returns them, just expose; if not, add them.

```bash
docker compose exec app grep -n "savedByRecipientAt\|bouncedAt\|firstReadAt" src/lib/letters/dual-read.ts
```

If they're not there, modify `dual-read.ts` to surface them from the Letter row (they're already on the schema).

Then in `src/app/api/letters/sent/route.ts`, replace the `SentStamp` type and result mapping:

```typescript
interface SentStamp {
  id: string
  recipientName: string | null
  sealedAt: string
  unlockDate: string | null
  isDelivered: boolean
  letterPeekedAt: string | null
  firstReadAt: string | null
  savedByRecipientAt: string | null
  bouncedAt: string | null
  bouncedReason: string | null
  encryptionType: string
  e2eeIVs: unknown
}

// ... in the map():
const result: SentStamp[] = letters.map((l) => ({
  id: l.id,
  recipientName: l.recipientName, // already plaintext for native rows; legacy may still be safeDecrypt — keep that conditional
  sealedAt: l.createdAt.toISOString(),
  unlockDate: l.unlockDate ? l.unlockDate.toISOString() : null,
  isDelivered: l.isDelivered,
  letterPeekedAt: l.letterPeekedAt ? l.letterPeekedAt.toISOString() : null,
  firstReadAt: l.firstReadAt ? l.firstReadAt.toISOString() : null,
  savedByRecipientAt: l.savedByRecipientAt ? l.savedByRecipientAt.toISOString() : null,
  bouncedAt: l.bouncedAt ? l.bouncedAt.toISOString() : null,
  bouncedReason: l.bouncedReason,
  encryptionType: l.encryptionType,
  e2eeIVs: l.e2eeIVs,
}))
```

- [ ] **Step 3: Build the status pill component**

```typescript
// src/components/letters/SenderReceiptStatus.tsx
'use client'

interface Props {
  unlockDate: string | null
  isDelivered: boolean
  firstReadAt: string | null
  savedByRecipientAt: string | null
  bouncedAt: string | null
  // Whether the LetterDelivery row still exists. Derived client-side as
  // (firstReadAt is set AND now - firstReadAt > 24h) OR you have backend
  // info that the row is gone. For v1 we use the simple time math.
}

export function SenderReceiptStatus(props: Props) {
  const status = resolve(props)
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        background: status.bg,
        color: status.fg,
      }}
    >
      {status.label}
    </span>
  )
}

function resolve(p: Props): { label: string; bg: string; fg: string } {
  if (p.bouncedAt) return { label: 'Bounced', bg: '#fce8e6', fg: '#a03323' }
  if (p.savedByRecipientAt) return { label: 'Saved by recipient', bg: '#e8f4ea', fg: '#1e6a2a' }
  if (p.firstReadAt) {
    const expired = Date.now() - new Date(p.firstReadAt).getTime() > 24 * 60 * 60 * 1000
    return expired
      ? { label: 'Faded', bg: '#eeeae0', fg: '#7a6a55' }
      : { label: 'Opened', bg: '#e1ecf7', fg: '#1c4773' }
  }
  if (p.isDelivered) return { label: 'Delivered', bg: '#fef2db', fg: '#876124' }
  return { label: 'Scheduled', bg: '#ece9e2', fg: '#5a4f3e' }
}
```

- [ ] **Step 4: Build the Ask-for-copy button**

```typescript
// src/components/letters/AskForCopyButton.tsx
'use client'
import { useState } from 'react'

export function AskForCopyButton({
  letterId,
  recipientName,
}: {
  letterId: string
  recipientName: string | null
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)

  async function onClick() {
    setState('sending'); setErr(null)
    const res = await fetch(`/api/letters/${letterId}/ask-for-copy`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Could not send.')
      setState('error')
      return
    }
    setState('sent')
  }

  if (state === 'sent') return <span style={{ fontSize: 12, opacity: 0.6 }}>Asked.</span>
  return (
    <button
      onClick={onClick}
      disabled={state === 'sending'}
      style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid #3d342a33',
        background: 'transparent',
        color: '#3d342a',
        cursor: 'pointer',
        opacity: state === 'sending' ? 0.5 : 1,
      }}
    >
      Ask {recipientName ?? 'them'} for a copy
      {err && <span style={{ marginLeft: 8, color: '#a00' }}>{err}</span>}
    </button>
  )
}
```

- [ ] **Step 5: Surface them in the sent-letters list**

Open the sent-letters component (located in Step 1). For each `stamp` in the list:
- Add `<SenderReceiptStatus ...>` somewhere near the unlock date.
- When `stamp.savedByRecipientAt` is non-null AND the current user is paid (fetch `/api/auth/me` once and check `subscriptionStatus`), render `<AskForCopyButton letterId={stamp.id} recipientName={stamp.recipientName} />`.

A simple paid check pattern:

```typescript
import useSWR from 'swr'
const { data: me } = useSWR('/api/auth/me', (u) => fetch(u).then((r) => r.json()))
const isPaid = me?.user?.subscriptionStatus === 'active' || me?.user?.subscriptionStatus === 'on_trial'
```

(Or use the existing pattern Hearth already uses for paid gating — search for `subscriptionStatus` in the codebase.)

- [ ] **Step 6: Smoke-test**

1. Set your dev user's `subscriptionStatus='active'` in the DB.
2. Manually mark one of your sent letters' `savedByRecipientAt` to `now()`.
3. Reload the sent-letters view → see the "Saved by recipient" pill + the "Ask for copy" button.
4. Click → email lands in your test recipient inbox.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/letters/sent/route.ts src/components/letters/AskForCopyButton.tsx src/components/letters/SenderReceiptStatus.tsx src/components/letters/SentLetters*.tsx src/lib/letters/dual-read.ts
git commit -m "feat(letters): receipt status pill + paid ask-for-copy button"
```

---

## Task 20: End-to-end smoke test

This is verification, not new code. Run through the full user journey to catch integration bugs the per-task smoke tests miss.

- [ ] **Step 1: Cold restart**

```bash
docker compose down
docker compose up -d --build
docker compose logs -f app --tail=100
```

Wait for "Ready in ..." and no compile errors.

- [ ] **Step 2: Happy path — friend letter, logged-in recipient**

1. Sign in to dev mode as user A (e.g., `support+a@dalgo.org`).
2. Compose a friend letter to user B (`support+b@dalgo.org`). Set unlockDate = now + 7 days (use the "1w" pill).
3. Force-deliver by back-dating in the DB:
   ```bash
   docker compose exec db psql -U postgres hearth -c "update letters set scheduled_for = now() - interval '1 minute' where letter_type = 'friend' order by created_at desc limit 1; update letter_deliveries set first_read_at = null where id = (select id from letter_deliveries order by created_at desc limit 1);"
   ```
4. Grab the `public_token` and the `tlocked_key` from the DB. Construct URL `${NEXT_PUBLIC_APP_URL}/letter/<token>#k=<urlEncodedTlockedKey>`.

   ⚠️ For this E2E test, you also need to manually decrypt via the page since Resend isn't actually scheduled to deliver this minute. In real usage Resend sends the URL — here you assemble it from DB rows.

5. Open the URL in a **second browser** signed in as user B. Verify decrypt: stages "fetching letter info" → "fetching time-lock beacon" → "decrypting" → letter renders. 24h countdown is visible.
6. Click "Keep this letter forever." Land on save page; immediately progresses to "Saved." and redirects to `/me`.
7. In B's account `/me`, the new kept letter appears in inbox.
8. Back in user A's account, open `/letters/sent`. The receipt shows status "Saved by recipient" (or "Opened" if status isn't updating — check Task 19 wiring).
9. If A's `subscriptionStatus` is `'active'`, the "Ask for a copy" button is visible. Click → email lands in B's inbox.

- [ ] **Step 3: Happy path — friend letter, magic-link recipient**

Repeat steps 1-5 from Step 2, but in step 5 open the URL in an **incognito window** (logged out).
1. Letter renders the same.
2. Click "Keep this letter forever." Land on `/letter/<token>/save`.
3. Enter an email (in dev mode this skips real OTP; in Supabase mode a real code is sent).
4. Complete onboarding (passphrase + recovery key + confirm).
5. Watch the page automatically progress through "Encrypting and saving..." → "Saved." → redirect to `/me`.
6. In the new account's `/me`, the kept letter appears.

- [ ] **Step 4: Self-letter happy path**

1. As user A, compose a self letter for 8 days out.
2. Back-date: `update letters set scheduled_for = now() - interval '1 minute', delivered_at = null where letter_type = 'self' order by created_at desc limit 1;`
3. Fire the cron: `curl -H "authorization: Bearer $CRON_SECRET" http://localhost:3112/api/cron/self-letter-reminders`
4. Expected: `{processed: 1, errors: []}`. Reminder email lands. Letter's `delivered_at` is set.
5. Open the app — your sealed-letters area should surface the new letter for reveal. (If a reveal modal already exists from prior phases it should pick this up; if not, you can decrypt manually in DB inspection to verify the ciphertext is sane.)

- [ ] **Step 5: Sad paths**

- Open `/letter/<token>#k=garbage` → "Something went wrong" with a tlock decryption error.
- Open `/letter/<unknown-token>` → "We couldn't find this letter."
- Open a valid letter, refresh the page **after 24h+1 minute** (back-date `first_read_at` to simulate) → "This letter has faded."
- Open a friend letter whose `scheduled_for` is in the future → "This letter isn't ready yet."

- [ ] **Step 6: DB sanity check (server can't decrypt anything)**

```bash
docker compose exec db psql -U postgres hearth -c "
  select l.id, l.letter_type, l.content_ciphertext is not null as has_content, d.transient_ciphertext is not null as has_transient, d.tlocked_key is not null as has_tlocked
  from letters l left join letter_deliveries d on d.letter_id = l.id
  where l.created_at > now() - interval '1 day';
"
```

Spot check: for `letter_type='friend'`, `has_content=false`, `has_transient=true`, `has_tlocked=true`. For `letter_type='self'`, `has_content=true`, no delivery row. Confirm with the project's `ENCRYPTION_KEY` env value loaded — you cannot manually decrypt `transient_ciphertext` (it's under K), and you cannot manually decrypt `content_ciphertext` of a self letter without the user's master key.

- [ ] **Step 7: Tag the working state**

```bash
git tag friend-letters-tlock-shipped
```

- [ ] **Step 8: Final commit (none needed) — just confirm clean tree**

```bash
git status
```

Expected: clean working tree, all Phase 4 tasks committed.

---

**Phase 4 complete.**

Next step is the Phase 5-cleanup plan: drop `LetterAccessToken`, drop dual-read fallbacks, drop the deliver-letters cron, drop the legacy `/api/letter/[token]` route, drop JournalEntry letter columns, drop `encryptionType` from Letter, switch the existing 3 hardcoded `from:` lines in `src/lib/email.ts` to env-driven addresses. That's a separate plan written **after** Phase 4 has been smoke-tested in dev for at least a day.
