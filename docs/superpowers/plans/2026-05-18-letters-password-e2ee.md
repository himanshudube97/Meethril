# Friend Letters — Password+Question E2EE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tlock/drand crypto for friend letters with password+question+Argon2id e2ee — server stays blind, no external dependency.

**Architecture:** Sender writes a question + answer at seal time. The answer is normalized (NFKD, lowercase, strip whitespace+punctuation) and stretched through Argon2id with a per-letter salt → 32-byte AES-256-GCM key. Body and photo assets are encrypted client-side under that key. Server stores ciphertext + salt + question (plaintext) + scheduledFor. Recipient gets a magic-link email at the unlock date, sees the question, types the answer, decrypts locally. No drand, no time-locked crypto. Time-lock = email delivery time.

**Tech Stack:** Next.js 16 App Router, Prisma, PostgreSQL, `hash-wasm` (new — Argon2id WASM), WebCrypto (AES-GCM), TypeScript, Docker for dev.

**Test discipline:** Per the project's standing preference (no formal unit tests on Hearth), each task ends with a manual dev-mode verification step rather than written test code. Type-check after every code task via the `typecheck` skill.

**Spec:** [docs/superpowers/specs/2026-05-18-letters-password-e2ee-design.md](../specs/2026-05-18-letters-password-e2ee-design.md)

---

## File Map

### Files to create

| Path | Purpose |
|---|---|
| `src/lib/letters/answer-crypto.ts` | New crypto module: `normalizeAnswer`, `generateSalt`, `deriveLetterKey` (Argon2id via `hash-wasm`), `encryptWithLetterKey`, `decryptWithLetterKey` (AES-256-GCM mirroring the old transient-crypto API). |
| `src/app/api/letter/[token]/opened/route.ts` | New `POST` endpoint. Atomically claims `firstReadAt` + sets `transientExpiresAt = firstReadAt + 24h`. Idempotent. |
| `prisma/migrations/<timestamp>_letters_password_e2ee/migration.sql` | Drops `tlockedKey`, adds `salt` and `question` columns on `letter_deliveries`. |

### Files to modify

| Path | What changes |
|---|---|
| `prisma/schema.prisma` | `LetterDelivery`: drop `tlockedKey`, add `salt String` + `question String @db.Text`. Update comments on `transientCiphertext` + `LetterDeliveryAsset`. |
| `src/lib/letters/friend-letter-client.ts` | Replace tlock + random K path with answer-derived key path. New signature: `{draft, unlockDate, recipientEmail, recipientName, letterLocation, masterKey, question, answer}` → `{salt, question, transientCiphertext, transientIV, recipientEmail, recipientName, scheduledFor, letterLocation, photoAssets}`. |
| `src/lib/letters/asset-bundler.ts` | `K: Uint8Array` parameter → `letterKey: Uint8Array` parameter. Internal `encryptTransient` call → `encryptWithLetterKey`. |
| `src/app/api/letters/friend/route.ts` | Body schema: drop `tlockedKey`, add `salt` + `question`. Insert into `LetterDelivery.create`. Drop `tlockedKey` from `sendFriendLetterTransientEmail` call. |
| `src/app/api/letter/[token]/meta/route.ts` | Add `salt` + `question` to select + response. |
| `src/app/api/letter/[token]/ciphertext/route.ts` | Remove the first-read claim block (moved to new `/opened` route). Keep the 24h expiry check + `not_yet` gate. |
| `src/app/letter/[token]/page.tsx` | Major rewrite: sealed-envelope scene, question card, answer input, Argon2 derive with tremor animation, AES-GCM decrypt, POST `/opened` on success, wax-crack reveal. sessionStorage cache renames `K` → `letterKey`. |
| `src/app/letter/[token]/save/page.tsx` | sessionStorage shape: `K` field renamed to `letterKey`. Internal `decryptTransient` call → `decryptWithLetterKey`. |
| `src/components/letters/compose/SealModal.tsx` | Add **question** + **answer** inputs for `recipient === 'friend'`. Examples popover. Low-entropy nudge. Extend `onSeal` callback signature to include `{question, answer}` for friend letters. |
| `src/components/letters/compose/ComposeView.tsx` | `handleSeal` accepts + threads `question` + `answer` into `buildFriendLetterPayload`. |
| `src/lib/email.ts` | `sendFriendLetterTransientEmail`: drop `tlockedKey` arg. URL becomes `${appUrl}/letter/${publicToken}` (no fragment). |
| `package.json` | Add `hash-wasm`. Remove `tlock-js`. |
| `docs/letters-architecture.md` | Rewrite friend-letter section. |
| `docs/encryption-strategy.md` | Update tier matrix row for friend letters. |
| `docs/e2ee-architecture.md` | Add paragraph distinguishing friend-letter answer-key path. |
| `docs/superpowers/plans/2026-05-16-friend-letters-tlock.md` | Add superseded-by header. |

### Files to delete

| Path | Reason |
|---|---|
| `src/lib/letters/tlock.ts` | tlock/drand helpers — no longer used. |
| `src/lib/letters/transient-crypto.ts` | Folded into `answer-crypto.ts`. |

### Files explicitly NOT touched

- `src/lib/letters/dual-read.ts` (Phase 5 helper, unrelated to tlock — stays as-is)
- `src/lib/letters/self-letter-client.ts` (self-letters keep master-key encryption)
- `src/lib/letters/draft-decrypt.ts` (drafts still master-key encrypted)
- `src/lib/letters/resend-webhook.ts` (delivery webhook unchanged)
- Self-letter routes under `src/app/api/letters/self/`
- Stranger-note routes

---

## Task 1: Add `hash-wasm`, remove `tlock-js`

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)

- [ ] **Step 1: Install `hash-wasm` in the running container**

Run:
```bash
docker compose exec app npm install hash-wasm
```

Expected: `hash-wasm` added to dependencies, `package-lock.json` updated.

- [ ] **Step 2: Remove `tlock-js`**

Run:
```bash
docker compose exec app npm uninstall tlock-js
```

Expected: `tlock-js` removed from `package.json` and `package-lock.json`.

- [ ] **Step 3: Verify no remaining `tlock-js` imports compile-blocked yet**

Run:
```bash
docker compose exec app grep -rn "from 'tlock-js'" src/ || echo "no imports left"
```

Expected output: imports still exist in `src/lib/letters/tlock.ts` and `src/app/letter/[token]/page.tsx`. These will fail typecheck until Tasks 3+10 land. **This is expected** — we accept a temporarily broken typecheck across tasks 1-5; it gets fixed by Task 5.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(letters): swap tlock-js for hash-wasm

Adds Argon2id WASM for the upcoming password-based friend-letter e2ee.
tlock/drand removal in follow-up tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_letters_password_e2ee/migration.sql` (auto-generated by Prisma)

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Locate the `LetterDelivery` model (around line 176). Replace its body with:

```prisma
model LetterDelivery {
  id       String @id @default(cuid())
  letterId String @unique
  letter   Letter @relation(fields: [letterId], references: [id], onDelete: Cascade)

  // Friend letters: AES-256-GCM ciphertext of body_json. Encrypted with
  // letterKey = Argon2id(normalize(answer), salt). Neither the answer nor
  // letterKey ever reach the server.
  transientCiphertext String @db.Text
  transientIV         String

  // Argon2id salt, 16 random bytes base64. Not secret.
  salt String

  // Plaintext: shown to the recipient on the unlock page so they know what
  // answer to type. Visible to anyone with DB access — metadata leak by
  // design (the magic-link recipient has no account, so we have no
  // pre-shared key to encrypt this under).
  question String @db.Text

  // Public token in the URL path. No fragment.
  publicToken String @unique

  resendEmailId String?

  firstReadAt        DateTime?
  transientExpiresAt DateTime?

  createdAt DateTime @default(now())

  assets LetterDeliveryAsset[]

  @@index([transientExpiresAt])
  @@map("letter_deliveries")
}
```

Then locate the `LetterDeliveryAsset` model (around line 207). Update the comment block above `ciphertext`:

```prisma
  // letterKey-encrypted asset bytes (base64). Recipient derives letterKey
  // from their typed answer + LetterDelivery.salt and decrypts to recover
  // the original photo bytes.
  ciphertext String @db.Text
```

- [ ] **Step 2: Generate migration**

Run:
```bash
docker compose exec app npx prisma migrate dev --name letters_password_e2ee
```

Expected: Prisma prompts about data loss (dropping `tlockedKey`). **Accept it** — confirmed safe per the spec ("no users yet"). New columns `salt` and `question` get created as `NOT NULL` with no default. Migration applies cleanly to the local DB.

If Prisma complains about non-null defaults during migration creation, edit the generated `migration.sql` to:
```sql
ALTER TABLE "letter_deliveries" DROP COLUMN "tlockedKey";
DELETE FROM "letter_deliveries"; -- empty pre-prod table; remove if data needs preserving
ALTER TABLE "letter_deliveries" ADD COLUMN "salt" TEXT NOT NULL;
ALTER TABLE "letter_deliveries" ADD COLUMN "question" TEXT NOT NULL;
```
Then re-run `npx prisma migrate dev`.

- [ ] **Step 3: Regenerate Prisma client**

Run:
```bash
docker compose exec app npx prisma generate
```

Expected: `@prisma/client` regenerates. `LetterDelivery` TypeScript type now has `salt` and `question`, no `tlockedKey`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "$(cat <<'EOF'
feat(letters)!: schema for password+question e2ee

Drops tlockedKey, adds salt + question on letter_deliveries. Clean
migration — pre-production, no users to preserve.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `answer-crypto.ts`

**Files:**
- Create: `src/lib/letters/answer-crypto.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/letters/answer-crypto.ts`:

```typescript
// src/lib/letters/answer-crypto.ts
//
// Friend-letter crypto module. The sender writes a question + an answer
// at seal time. The answer is normalized and stretched through Argon2id
// with a per-letter salt to produce a 256-bit AES-GCM key. That key
// encrypts the letter body and every photo asset. The server never sees
// the answer or the derived key.
//
// API mirrors the old transient-crypto.ts (encrypt / decrypt taking raw
// 32-byte keys) so the rest of the code path looks unchanged.

import { argon2id } from 'hash-wasm'

const ALGO = 'AES-GCM'
const IV_BYTES = 12
const SALT_BYTES = 16
const KEY_BYTES = 32

// OWASP-recommended minimum for Argon2id, mobile-safe.
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456, // KiB (~19MB)
  hashLength: KEY_BYTES,
}

// ---------- base64 helpers (kept local; tight surface) ----------

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

// ---------- normalization ----------

/**
 * Normalize a typed answer so case, spacing, punctuation, and diacritic
 * variations all collapse to the same string before key derivation.
 * Must produce byte-identical output on sender and recipient.
 *
 * Pipeline:
 *   1. Unicode NFKD normalize
 *   2. Strip combining marks (so "é" → "e")
 *   3. Lowercase
 *   4. Strip all whitespace
 *   5. Strip all punctuation/symbol characters
 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
}

// ---------- salt ----------

/** 16 random bytes, base64-encoded. */
export function generateSalt(): string {
  const s = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return toBase64(s)
}

// ---------- key derivation ----------

/**
 * Argon2id(normalize(answer), salt) → 32-byte raw key.
 * Returns the raw bytes; encrypt/decrypt below take this shape.
 *
 * Latency: ~300ms desktop, ~1s mid-range mobile, ~1.5–2s low-end mobile.
 */
export async function deriveLetterKey(answer: string, saltBase64: string): Promise<Uint8Array> {
  const normalized = normalizeAnswer(answer)
  if (normalized.length === 0) {
    throw new Error('answer is empty after normalization')
  }
  const salt = fromBase64(saltBase64)
  const hex = await argon2id({
    password: normalized,
    salt,
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    hashLength: ARGON2.hashLength,
    outputType: 'hex',
  })
  const out = new Uint8Array(KEY_BYTES)
  for (let i = 0; i < KEY_BYTES; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// ---------- AES-GCM helpers ----------

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== KEY_BYTES) {
    throw new Error(`letter key must be ${KEY_BYTES} bytes, got ${rawKey.byteLength}`)
  }
  return crypto.subtle.importKey('raw', rawKey as BufferSource, ALGO, false, ['encrypt', 'decrypt'])
}

export async function encryptWithLetterKey(
  plaintext: ArrayBuffer | Uint8Array,
  rawKey: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const pt = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv: iv as BufferSource }, key, pt as BufferSource)
  return { ciphertext: toBase64(ct), iv: toBase64(iv) }
}

export async function decryptWithLetterKey(
  ciphertextBase64: string,
  ivBase64: string,
  rawKey: Uint8Array
): Promise<Uint8Array> {
  const key = await importAesKey(rawKey)
  const ct = fromBase64(ciphertextBase64)
  const iv = fromBase64(ivBase64)
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, ct as BufferSource)
  return new Uint8Array(pt)
}

// ---------- raw key (de)serialization (for sessionStorage on Keep-forever) ----------

export function rawKeyToBase64(rawKey: Uint8Array): string {
  return toBase64(rawKey)
}

export function rawKeyFromBase64(b64: string): Uint8Array {
  const k = fromBase64(b64)
  if (k.byteLength !== KEY_BYTES) {
    throw new Error(`letter key must decode to ${KEY_BYTES} bytes, got ${k.byteLength}`)
  }
  return k
}
```

- [ ] **Step 2: Typecheck**

Run the `typecheck` skill, or:
```bash
docker compose exec app npx tsc --noEmit
```

Expected: `answer-crypto.ts` compiles cleanly. Pre-existing tlock errors still present; ignore those.

- [ ] **Step 3: Sanity-check normalization**

In a browser dev console on any Hearth page, paste:
```javascript
const { normalizeAnswer } = await import('/src/lib/letters/answer-crypto.ts')
console.log(normalizeAnswer('Café Lumière'))   // → "cafelumiere"
console.log(normalizeAnswer('1995-07-12'))     // → "19950712"
console.log(normalizeAnswer('  Hello,  World! ')) // → "helloworld"
```

If `import` from `.ts` fails in the running browser (likely — Next bundles), skip this and rely on the seal/unlock E2E test in Task 15 to validate normalization.

- [ ] **Step 4: Commit**

```bash
git add src/lib/letters/answer-crypto.ts
git commit -m "$(cat <<'EOF'
feat(letters): answer-crypto module for password e2ee

Argon2id-derived letter key + AES-GCM encrypt/decrypt + normalization
+ raw-key (de)serialization for sessionStorage. Wires up in next tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update `asset-bundler.ts` to accept a derived letterKey

**Files:**
- Modify: `src/lib/letters/asset-bundler.ts`

- [ ] **Step 1: Update imports and types**

In `src/lib/letters/asset-bundler.ts`, replace the import:
```diff
-import { encryptTransient } from './transient-crypto'
+import { encryptWithLetterKey } from './answer-crypto'
```

- [ ] **Step 2: Update the function signature and body**

Replace the `bundleFriendLetterAssets` function (around line 106-152):

```typescript
/**
 * Bundle every photo and doodle on a friend-letter draft for delivery.
 *
 * For each photo: decrypt-with-master-key → re-encrypt-with-letterKey →
 * return the upload payload. The letterKey-encrypted blob will land in a
 * LetterDeliveryAsset row.
 *
 * For each doodle: decrypt-with-master-key → return plaintext strokes.
 * The recipient page reads them inline from the transient JSON.
 */
export async function bundleFriendLetterAssets(args: {
  photos: DraftPhoto[]
  doodles: DraftDoodle[]
  masterKey: CryptoKey
  letterKey: Uint8Array
}): Promise<AssetBundle> {
  const photoAssets: BundledPhotoAsset[] = []
  for (const p of args.photos) {
    let plaintextBytes: ArrayBuffer | null = null

    if (p.encryptedRef && p.encryptedRefIV) {
      plaintextBytes = await fetchAndDecryptPhoto(p.encryptedRef, p.encryptedRefIV, args.masterKey)
    } else if (p.url) {
      const res = await fetch(p.url)
      if (!res.ok) throw new Error(`photo url fetch ${res.status}: ${p.url}`)
      plaintextBytes = await res.arrayBuffer()
    } else {
      continue
    }

    const { ciphertext, iv } = await encryptWithLetterKey(plaintextBytes, args.letterKey)
    photoAssets.push({
      ciphertext,
      iv,
      type: 'photo',
      position: p.position,
      spread: p.spread,
      rotation: p.rotation,
      ordinal: p.ordinal,
    })
  }

  const inlineDoodles: BundledDoodle[] = []
  for (const d of args.doodles) {
    const strokes = await decryptDoodleStrokes(d.strokes, args.masterKey)
    inlineDoodles.push({
      strokes,
      spread: d.spread,
      positionInEntry: d.positionInEntry,
    })
  }

  return { photoAssets, inlineDoodles }
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
docker compose exec app npx tsc --noEmit 2>&1 | grep -E "asset-bundler|friend-letter-client"
```

Expected: `asset-bundler.ts` compiles. `friend-letter-client.ts` errors because it still passes `K` — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/letters/asset-bundler.ts
git commit -m "$(cat <<'EOF'
refactor(letters): asset-bundler takes letterKey instead of K

Bundler now uses answer-crypto's encryptWithLetterKey. Caller refactor
in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewrite `friend-letter-client.ts`

**Files:**
- Modify: `src/lib/letters/friend-letter-client.ts`

- [ ] **Step 1: Replace the file**

Overwrite `src/lib/letters/friend-letter-client.ts` with:

```typescript
// src/lib/letters/friend-letter-client.ts
//
// Browser-side helper for friend-letter writes:
//   1. Generate per-letter salt.
//   2. Derive letterKey = Argon2id(normalize(answer), salt).
//   3. Decrypt every photo/doodle on the draft (master key); re-encrypt
//      photos under letterKey; decrypt doodles inline.
//   4. AES-256-GCM-encrypt the serialized letter body (text + song +
//      inline doodles) under letterKey.
// Returns the upload payload for POST /api/letters/friend. The server
// only sees ciphertext + salt + question + scheduledFor + recipient
// email — never the answer or the derived key.

import {
  generateSalt,
  deriveLetterKey,
  encryptWithLetterKey,
} from './answer-crypto'
import {
  bundleFriendLetterAssets,
  type DraftPhoto,
  type DraftDoodle,
  type BundledPhotoAsset,
} from './asset-bundler'

export interface FriendLetterDraft {
  text: string
  song?: string | null
  photos?: DraftPhoto[]
  doodles?: DraftDoodle[]
}

export interface FriendLetterUploadPayload {
  transientCiphertext: string
  transientIV: string
  salt: string
  question: string
  recipientEmail: string
  recipientName: string
  scheduledFor: string
  letterLocation?: string | null
  photoAssets: BundledPhotoAsset[]
}

export async function buildFriendLetterPayload(args: {
  draft: FriendLetterDraft
  unlockDate: Date
  recipientEmail: string
  recipientName: string
  letterLocation?: string | null
  masterKey: CryptoKey
  question: string
  answer: string
}): Promise<FriendLetterUploadPayload> {
  const salt = generateSalt()
  const letterKey = await deriveLetterKey(args.answer, salt)

  try {
    const { photoAssets, inlineDoodles } = await bundleFriendLetterAssets({
      photos: args.draft.photos ?? [],
      doodles: args.draft.doodles ?? [],
      masterKey: args.masterKey,
      letterKey,
    })

    const json = JSON.stringify({
      text: args.draft.text,
      song: args.draft.song ?? null,
      doodles: inlineDoodles,
    })

    const plaintext = new TextEncoder().encode(json)
    const { ciphertext: transientCiphertext, iv: transientIV } =
      await encryptWithLetterKey(plaintext, letterKey)

    return {
      transientCiphertext,
      transientIV,
      salt,
      question: args.question,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      scheduledFor: args.unlockDate.toISOString(),
      letterLocation: args.letterLocation ?? null,
      photoAssets,
    }
  } finally {
    letterKey.fill(0)
  }
}
```

- [ ] **Step 2: Typecheck**

Run the `typecheck` skill. Expected remaining errors: callers of `buildFriendLetterPayload` (ComposeView), and any reference to `tlockedKey` in the route, page, email, and tlock.ts itself. These get fixed in Tasks 6-11.

- [ ] **Step 3: Commit**

```bash
git add src/lib/letters/friend-letter-client.ts
git commit -m "$(cat <<'EOF'
refactor(letters): rewrite friend-letter-client for password e2ee

Drops tlock + random K. Derives letterKey from {question, answer} via
Argon2id, encrypts under that. Returns {salt, question, ciphertext}.
Callers fixed in next tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `POST /api/letters/friend` route

**Files:**
- Modify: `src/app/api/letters/friend/route.ts`

- [ ] **Step 1: Update the `Body` interface**

In `src/app/api/letters/friend/route.ts`, replace the `Body` interface (lines 11-37):

```typescript
interface Body {
  transientCiphertext: string
  transientIV: string
  salt: string
  question: string
  recipientEmail: string
  recipientName: string
  // senderName from client is ignored — server derives it from the
  // authenticated user's profile.nickname / User.name so a sender can't
  // spoof their display name in the delivery email.
  scheduledFor: string
  letterLocation?: string | null
  draftLetterId?: string | null
  photoAssets?: Array<{
    ciphertext: string
    iv: string
    type: 'photo' | 'doodle'
    position: number
    spread: number
    rotation: number
    ordinal: number
  }>
}
```

- [ ] **Step 2: Update the validation block**

Replace the missing-fields check (around line 55):

```typescript
  if (
    !body.transientCiphertext ||
    !body.transientIV ||
    !body.salt ||
    !body.question ||
    !body.question.trim()
  ) {
    return NextResponse.json({ error: 'missing crypto fields' }, { status: 400 })
  }
```

- [ ] **Step 3: Update the `letterDelivery.create` call**

Replace the `tx.letterDelivery.create` call (around line 154):

```typescript
    const delivery = await tx.letterDelivery.create({
      data: {
        letterId,
        transientCiphertext: body.transientCiphertext,
        transientIV: body.transientIV,
        salt: body.salt,
        question: body.question.trim(),
        publicToken,
      },
      select: { id: true, publicToken: true },
    })
```

- [ ] **Step 4: Update the email call**

Replace the `sendFriendLetterTransientEmail` call (around line 191):

```typescript
    const { id } = await sendFriendLetterTransientEmail({
      to: body.recipientEmail,
      recipientName: body.recipientName,
      senderName,
      scheduledFor,
      publicToken,
    })
```

- [ ] **Step 5: Typecheck**

Run the `typecheck` skill. The friend route should now compile; `sendFriendLetterTransientEmail` still expects `tlockedKey` — fixed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/letters/friend/route.ts
git commit -m "$(cat <<'EOF'
feat(letters): friend POST accepts salt+question payload

Drops tlockedKey from request body and from LetterDelivery insert. Email
call updated; sendFriendLetterTransientEmail signature change in Task 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update `GET /api/letter/[token]/meta` route

**Files:**
- Modify: `src/app/api/letter/[token]/meta/route.ts`

- [ ] **Step 1: Update select and response**

Overwrite `src/app/api/letter/[token]/meta/route.ts`:

```typescript
// src/app/api/letter/[token]/meta/route.ts
//
// Public, no-auth metadata for a friend letter delivery. Returns the
// scheduledFor, sender/recipient display names, the Argon2 salt + the
// plaintext question (so the recipient can derive their letterKey from
// the answer they type), and a flag for whether the 24h read window is
// already used up.

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
      salt: true,
      question: true,
      letter: {
        select: {
          scheduledFor: true,
          recipientName: true,
          senderName: true,
        },
      },
      assets: {
        select: {
          id: true,
          type: true,
          position: true,
          spread: true,
          rotation: true,
          ordinal: true,
        },
        orderBy: { ordinal: 'asc' },
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
    firstReadAt: delivery.firstReadAt?.toISOString() ?? null,
    salt: delivery.salt,
    question: delivery.question,
    assets: delivery.assets,
  })
}
```

- [ ] **Step 2: Typecheck**

Run the `typecheck` skill. Expected: meta route compiles.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/letter/[token]/meta/route.ts
git commit -m "$(cat <<'EOF'
feat(letters): meta endpoint returns salt + question

Recipient unlock page reads these to derive the letterKey client-side.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Split `firstReadAt` claim — modify ciphertext route + add `/opened`

**Files:**
- Modify: `src/app/api/letter/[token]/ciphertext/route.ts`
- Create: `src/app/api/letter/[token]/opened/route.ts`

- [ ] **Step 1: Strip the first-read claim from the ciphertext route**

Overwrite `src/app/api/letter/[token]/ciphertext/route.ts`:

```typescript
// src/app/api/letter/[token]/ciphertext/route.ts
//
// Returns the transient ciphertext + IV for a friend letter delivery.
// Idempotent — does NOT claim firstReadAt. (The recipient may fetch
// ciphertext and then fail to decrypt because they typed the wrong
// answer; we don't want to burn the 24h read window on that.) The
// client calls POST /api/letter/[token]/opened after a successful
// client-side decrypt to start the 24h clock.
//
// Calls after the 24h window expires still return 410.

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
      transientCiphertext: true,
      transientIV: true,
      firstReadAt: true,
      letter: { select: { scheduledFor: true } },
    },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  if (delivery.letter.scheduledFor && delivery.letter.scheduledFor.getTime() > Date.now()) {
    return NextResponse.json({ reason: 'not_yet' }, { status: 425 })
  }

  if (
    delivery.firstReadAt &&
    delivery.firstReadAt.getTime() + READ_WINDOW_MS < Date.now()
  ) {
    return NextResponse.json({ reason: 'expired' }, { status: 410 })
  }

  return NextResponse.json({
    transientCiphertext: delivery.transientCiphertext,
    transientIV: delivery.transientIV,
  })
}
```

- [ ] **Step 2: Create `/opened` route**

Create `src/app/api/letter/[token]/opened/route.ts`:

```typescript
// src/app/api/letter/[token]/opened/route.ts
//
// Recipient client calls this after a successful AES-GCM decrypt of the
// letter body. Atomically claims firstReadAt + sets transientExpiresAt
// = firstReadAt + 24h. Idempotent — repeated calls are no-ops because
// the updateMany guard requires firstReadAt: null.
//
// Splitting this from the ciphertext fetch matters because a wrong-
// answer attempt would otherwise burn the 24h window with no way to
// undo it.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const READ_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const delivery = await prisma.letterDelivery.findUnique({
    where: { publicToken: token },
    select: { id: true, firstReadAt: true, letter: { select: { id: true } } },
  })

  if (!delivery) {
    return NextResponse.json({ reason: 'not_found' }, { status: 404 })
  }

  // Already claimed (this is the idempotent path) — succeed.
  if (delivery.firstReadAt) {
    return NextResponse.json({ ok: true, firstReadAt: delivery.firstReadAt.toISOString() })
  }

  const firstReadAt = new Date()
  const transientExpiresAt = new Date(firstReadAt.getTime() + READ_WINDOW_MS)

  // Race guard: only the request that finds firstReadAt still null
  // actually writes. Losers are harmless — they would have written
  // ~the same timestamp anyway.
  const claim = await prisma.letterDelivery.updateMany({
    where: { id: delivery.id, firstReadAt: null },
    data: { firstReadAt, transientExpiresAt },
  })

  if (claim.count > 0) {
    await prisma.letter.update({
      where: { id: delivery.letter.id },
      data: { firstReadAt },
    })
  }

  return NextResponse.json({ ok: true, firstReadAt: firstReadAt.toISOString() })
}
```

- [ ] **Step 3: Typecheck**

Run the `typecheck` skill.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/letter/[token]/ciphertext/route.ts src/app/api/letter/[token]/opened/route.ts
git commit -m "$(cat <<'EOF'
feat(letters): split first-read claim into /opened endpoint

Ciphertext fetch is now idempotent; client calls /opened only after a
successful client-side decrypt. Stops wrong-answer attempts from
burning the 24h read window.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Add question + answer UI to `SealModal`

**Files:**
- Modify: `src/components/letters/compose/SealModal.tsx`

- [ ] **Step 1: Update prop types**

In `src/components/letters/compose/SealModal.tsx`, locate the component signature (around line 64). Update the `onSeal` callback shape:

```typescript
export function SealModal({
  recipient,
  onClose,
  onSealed,
  onSeal,
}: {
  recipient: 'self' | 'friend'
  onClose: () => void
  onSealed: () => void
  onSeal: (data: {
    unlockDate: Date
    recipientEmail?: string
    question?: string
    answer?: string
  }) => Promise<void>
}) {
```

- [ ] **Step 2: Add question + answer state**

In the component body, near the other `useState` hooks (around line 80-86), add:

```typescript
  const [question, setQuestion] = useState<string>('')
  const [answer, setAnswer] = useState<string>('')
  const [showExamples, setShowExamples] = useState(false)
```

Also add a small helper near `EMAIL_REGEX` at the top of the file (around line 36):

```typescript
function normalizeForLengthCheck(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
}
```

This duplicates the normalization rule from `answer-crypto.ts` only because the modal is shared with `recipient='self'` which doesn't import answer-crypto. It's used solely for the entropy nudge; the real key derivation happens in `friend-letter-client.ts`.

- [ ] **Step 3: Add validation in `handleConfirm`**

Inside the `if (recipient === 'friend')` block (around line 125), after the email validation, add:

```typescript
      if (!question.trim()) {
        setError('Add a question only you both know the answer to.')
        return
      }
      if (normalizeForLengthCheck(answer).length === 0) {
        setError('Add the answer your friend will type.')
        return
      }
```

- [ ] **Step 4: Pass new fields to `onSeal`**

Update the `onSeal` call (around line 138):

```typescript
      await onSeal({
        unlockDate: date,
        recipientEmail: recipient === 'friend' ? email.trim() : undefined,
        question: recipient === 'friend' ? question.trim() : undefined,
        answer: recipient === 'friend' ? answer : undefined,
      })
```

- [ ] **Step 5: Add the UI inputs**

Inside the friend block (after the email input, before the time pills, around line 208 — right before the `<div className="flex flex-wrap gap-2 mb-3">` for time pills), add:

```tsx
              {recipient === 'friend' && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <label
                      className="block text-xs uppercase tracking-wider"
                      style={{ color: theme.text.muted }}
                    >
                      A question only you both know
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowExamples((v) => !v)}
                      className="text-xs italic"
                      style={{ color: theme.text.muted, opacity: 0.7 }}
                      aria-label="See example questions"
                    >
                      {showExamples ? 'hide examples' : 'examples?'}
                    </button>
                  </div>
                  {showExamples && (
                    <ul
                      className="text-xs italic mb-3 list-disc list-inside"
                      style={{ color: theme.text.muted, opacity: 0.8 }}
                    >
                      <li>Where did we meet?</li>
                      <li>Your birthday in DDMMYYYY</li>
                      <li>The nickname only you call me</li>
                      <li>The book we both cried over</li>
                    </ul>
                  )}
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="What's the name of our favorite cafe?"
                    className="w-full px-4 py-3 mb-3 rounded-xl outline-none"
                    style={{
                      border: `1px solid ${theme.text.primary}33`,
                      backgroundColor: `${theme.bg.primary}b3`,
                      color: theme.text.primary,
                    }}
                  />

                  <label
                    className="block text-xs uppercase tracking-wider mb-2"
                    style={{ color: theme.text.muted }}
                  >
                    The answer
                  </label>
                  <input
                    type="password"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="they'll type this to unlock"
                    className="w-full px-4 py-3 mb-1 rounded-xl outline-none"
                    style={{
                      border: `1px solid ${theme.text.primary}33`,
                      backgroundColor: `${theme.bg.primary}b3`,
                      color: theme.text.primary,
                    }}
                  />
                  <p
                    className="text-xs italic mb-4"
                    style={{ color: theme.text.muted, opacity: 0.7 }}
                  >
                    Type it exactly the way they will. Capitalization, spaces, and punctuation are ignored.
                  </p>
                  {answer && (() => {
                    const n = normalizeForLengthCheck(answer)
                    const tooShort = n.length < 4
                    const tooNumeric = /^\d+$/.test(n) && n.length <= 6
                    if (tooShort || tooNumeric) {
                      return (
                        <p
                          className="text-xs italic mb-4"
                          style={{ color: '#b91c1c', opacity: 0.85 }}
                        >
                          That might be too easy to guess. Try something only the two of you would know.
                        </p>
                      )
                    }
                    return null
                  })()}
                </>
              )}
```

- [ ] **Step 6: Typecheck**

Run the `typecheck` skill. Expected: `SealModal.tsx` compiles. `ComposeView.tsx` errors because its `handleSeal` callback signature doesn't yet accept `question`/`answer` — fixed in next task.

- [ ] **Step 7: Restart the app and visually inspect (no E2E yet)**

Run:
```bash
docker compose restart app
```

Then open `http://localhost:3111/letters`, start composing a friend letter, click seal. The modal should now show: email input → question input with "examples?" toggle → answer input with normalization helper text. Don't submit yet — `ComposeView` still passes the old payload shape.

- [ ] **Step 8: Commit**

```bash
git add src/components/letters/compose/SealModal.tsx
git commit -m "$(cat <<'EOF'
feat(letters): SealModal collects question + answer for friend letters

Adds question/answer inputs, examples popover, and low-entropy nudge.
ComposeView hookup follows in next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire `ComposeView.handleSeal` and update the email template

**Files:**
- Modify: `src/components/letters/compose/ComposeView.tsx`
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Update `handleSeal` signature**

In `src/components/letters/compose/ComposeView.tsx`, locate `handleSeal` (around line 263). Update its parameter destructuring:

```typescript
  async function handleSeal({
    unlockDate,
    recipientEmail,
    question,
    answer,
  }: {
    unlockDate: Date
    recipientEmail?: string
    question?: string
    answer?: string
  }) {
```

- [ ] **Step 2: Pass through to `buildFriendLetterPayload`**

Inside the `recipient.recipient === 'friend'` branch, before the `buildFriendLetterPayload` call (around line 311), add validation:

```typescript
      if (!recipientEmail) throw new Error('Recipient email missing.')
      if (!question || !question.trim()) {
        throw new Error('Question missing.')
      }
      if (!answer) {
        throw new Error('Answer missing.')
      }
```

Then update the `buildFriendLetterPayload` call (around line 342):

```typescript
      const payload = await buildFriendLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: draftPhotos,
          doodles: draftDoodles,
        },
        unlockDate,
        recipientEmail,
        recipientName: recipient.label ?? '',
        letterLocation: null,
        masterKey,
        question: question.trim(),
        answer,
      })
```

Note: the previous code passed `senderName: 'A friend'` or similar — the new payload doesn't include `senderName` because the server derives it from the authenticated user's profile. Remove that line if present.

- [ ] **Step 3: Update the email function in `lib/email.ts`**

In `src/lib/email.ts`, locate `sendFriendLetterTransientEmail` (around line 350). Update the function signature and URL:

```typescript
export async function sendFriendLetterTransientEmail(args: {
  to: string
  recipientName: string
  senderName: string
  scheduledFor: Date
  publicToken: string
}): Promise<{ id: string }> {
```

(Drop the `tlockedKey: string` line.)

Then update the URL construction (around line 363). Replace:
```typescript
  const url = `${appUrl}/letter/${args.publicToken}#k=${encodeURIComponent(args.tlockedKey)}`
```

with:
```typescript
  const url = `${appUrl}/letter/${args.publicToken}`
```

- [ ] **Step 4: Typecheck**

Run the `typecheck` skill. Expected: ComposeView and email both compile. Recipient unlock page (`src/app/letter/[token]/page.tsx`) still has tlock imports — fixed in next task.

- [ ] **Step 5: Commit**

```bash
git add src/components/letters/compose/ComposeView.tsx src/lib/email.ts
git commit -m "$(cat <<'EOF'
feat(letters): wire question/answer through compose; drop tlock from email

ComposeView threads question/answer into buildFriendLetterPayload. Email
URL no longer carries a tlockedKey fragment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Rewrite recipient unlock page (sealed-envelope scene)

**Files:**
- Modify: `src/app/letter/[token]/page.tsx`

- [ ] **Step 1: Replace the page**

Overwrite `src/app/letter/[token]/page.tsx`:

```typescript
// src/app/letter/[token]/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  deriveLetterKey,
  decryptWithLetterKey,
  rawKeyToBase64,
} from '@/lib/letters/answer-crypto'
import DOMPurify from 'dompurify'
import { LetterPhotos } from '@/components/letters/recipient/LetterPhotos'
import { LetterDoodles } from '@/components/letters/recipient/LetterDoodles'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li', 'span', 'div'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
}

function sanitizeLetter(html: string): string {
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string
}

type LetterContent = {
  text: string
  song: string | null
  doodles: Array<{ strokes: unknown; spread: number; positionInEntry: number }>
}

type AssetMeta = {
  id: string
  type: string
  position: number
  spread: number
  rotation: number
  ordinal: number
}

type Meta = {
  scheduledFor: string | null
  senderName: string | null
  recipientName: string | null
  alreadyExpired: boolean
  firstReadAt: string | null
  salt: string
  question: string
  assets: AssetMeta[]
}

type State =
  | { kind: 'loading_meta' }
  | { kind: 'not_yet'; scheduledFor: string }
  | { kind: 'expired' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'sealed'; meta: Meta; attempts: number; attempting: boolean; error: string | null }
  | { kind: 'unlocked'; data: LetterContent; meta: Meta; expiresAt: Date; letterKey: Uint8Array }

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

export default function LetterPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading_meta' })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    async function loadMeta() {
      try {
        const metaRes = await fetch(`/api/letter/${params.token}/meta`)
        if (metaRes.status === 404) return setState({ kind: 'not_found' })
        if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`)
        const meta = (await metaRes.json()) as Meta
        if (meta.alreadyExpired) return setState({ kind: 'expired' })
        if (!meta.scheduledFor) throw new Error('letter has no scheduledFor')
        const scheduledFor = new Date(meta.scheduledFor)
        if (scheduledFor.getTime() > Date.now()) {
          return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        }
        setState({ kind: 'sealed', meta, attempts: 0, attempting: false, error: null })
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    }
    loadMeta()
  }, [params.token])

  async function tryUnlock(answer: string) {
    if (state.kind !== 'sealed') return
    const meta = state.meta
    setState({ ...state, attempting: true, error: null })

    try {
      const letterKey = await deriveLetterKey(answer, meta.salt)

      const ctRes = await fetch(`/api/letter/${params.token}/ciphertext`)
      if (ctRes.status === 410) return setState({ kind: 'expired' })
      if (ctRes.status === 425) {
        return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor ?? '' })
      }
      if (ctRes.status === 404) return setState({ kind: 'not_found' })
      if (!ctRes.ok) throw new Error(`ciphertext ${ctRes.status}`)
      const { transientCiphertext, transientIV } = await ctRes.json()

      let plaintextBytes: Uint8Array
      try {
        plaintextBytes = await decryptWithLetterKey(transientCiphertext, transientIV, letterKey)
      } catch {
        setState({
          kind: 'sealed',
          meta,
          attempts: state.attempts + 1,
          attempting: false,
          error: 'the seal holds. try again?',
        })
        return
      }

      const data: LetterContent = JSON.parse(new TextDecoder().decode(plaintextBytes))

      await fetch(`/api/letter/${params.token}/opened`, { method: 'POST' }).catch(() => {})

      try {
        const cachedAssets: Array<{
          id: string
          type: string
          position: number
          spread: number
          rotation: number
          ordinal: number
          ciphertext: string
          iv: string
        }> = []
        for (const a of meta.assets ?? []) {
          try {
            const r = await fetch(`/api/letter/${params.token}/asset/${a.id}`)
            if (!r.ok) continue
            const j = (await r.json()) as { ciphertext: string; iv: string }
            cachedAssets.push({
              id: a.id,
              type: a.type,
              position: a.position,
              spread: a.spread,
              rotation: a.rotation,
              ordinal: a.ordinal,
              ciphertext: j.ciphertext,
              iv: j.iv,
            })
          } catch {
            /* skip — Save flow can still proceed without this asset */
          }
        }

        sessionStorage.setItem(
          `${SESSION_KEY_PREFIX}${params.token}`,
          JSON.stringify({
            content: data,
            senderName: meta.senderName ?? 'Someone special',
            recipientName: meta.recipientName ?? 'Friend',
            scheduledFor: meta.scheduledFor,
            letterKey: rawKeyToBase64(letterKey),
            assets: cachedAssets,
          })
        )
      } catch {
        /* sessionStorage might be disabled; not fatal */
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      setState({ kind: 'unlocked', data, meta, expiresAt, letterKey })
    } catch (e) {
      setState({
        kind: 'sealed',
        meta,
        attempts: state.attempts + 1,
        attempting: false,
        error: e instanceof Error ? e.message : 'Something went wrong.',
      })
    }
  }

  if (state.kind === 'loading_meta') {
    return <CenteredMessage title="Reading your letter" sub="just a moment" />
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
  if (state.kind === 'sealed') {
    return <SealedScene state={state} onSubmit={tryUnlock} />
  }

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
          From <strong>{state.meta.senderName ?? 'Someone special'}</strong> · For <strong>{state.meta.recipientName ?? 'Friend'}</strong>
        </div>
        <Countdown expiresAt={state.expiresAt} />
        <article
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 18 }}
          dangerouslySetInnerHTML={{ __html: sanitizeLetter(state.data.text) }}
        />
        {state.data.song && (
          <p style={{ marginTop: 32, fontSize: 14, opacity: 0.7 }}>
            Song they sent: <a href={state.data.song}>{state.data.song}</a>
          </p>
        )}
        <LetterPhotos token={params.token} assets={state.meta.assets ?? []} K={state.letterKey} />
        <LetterDoodles doodles={state.data.doodles as never} />
        <KeepForeverCTA token={params.token} router={router} />
      </div>
    </div>
  )
}

function SealedScene({
  state,
  onSubmit,
}: {
  state: Extract<State, { kind: 'sealed' }>
  onSubmit: (answer: string) => void
}) {
  const [value, setValue] = useState('')

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
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 8 }}>
          {state.meta.senderName ?? 'Someone'} left you something
        </p>
        {state.meta.scheduledFor && (
          <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 32 }}>
            sealed for {new Date(state.meta.scheduledFor).toLocaleDateString()}
          </p>
        )}

        <div
          aria-hidden
          style={{
            fontSize: 96,
            lineHeight: 1,
            marginBottom: 24,
            animation: state.attempting ? 'hearth-tremor 1.2s ease-in-out infinite' : undefined,
          }}
        >
          ✉
        </div>

        <p
          style={{
            fontStyle: 'italic',
            fontSize: 22,
            marginBottom: 16,
            opacity: 0.85,
          }}
        >
          {state.meta.question}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (state.attempting || !value.trim()) return
            onSubmit(value)
            setValue('')
          }}
        >
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="whisper the answer…"
            autoFocus
            disabled={state.attempting}
            style={{
              width: '100%',
              padding: '12px 0',
              fontSize: 18,
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #3d342a55',
              color: '#3d342a',
              outline: 'none',
              textAlign: 'center',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={state.attempting || !value.trim()}
            style={{
              marginTop: 24,
              padding: '10px 24px',
              background: '#3d342a',
              color: '#f6efe2',
              border: 'none',
              borderRadius: 999,
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: state.attempting ? 'wait' : 'pointer',
              opacity: state.attempting ? 0.6 : 1,
            }}
          >
            {state.attempting ? 'trying to break the seal…' : 'break the seal'}
          </button>
        </form>

        {state.error && (
          <p style={{ marginTop: 20, fontSize: 14, opacity: 0.7, fontStyle: 'italic' }}>
            {state.error}
          </p>
        )}

        {state.attempts >= 3 && state.meta.senderName && (
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.55, fontStyle: 'italic' }}>
            Stuck? You could ask {state.meta.senderName} for a hint — but they might not remember either.
          </p>
        )}

        <style>{`
          @keyframes hearth-tremor {
            0%, 100% { transform: translateX(0) rotate(0); }
            25% { transform: translateX(-2px) rotate(-1deg); }
            75% { transform: translateX(2px) rotate(1deg); }
          }
        `}</style>
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
      const meRes = await fetch('/api/auth/me')
      if (meRes.ok) {
        router.push(`/letter/${token}/save?logged_in=1`)
      } else {
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

Note: `<LetterPhotos>`'s `K` prop type is `Uint8Array`. The raw `letterKey` from `deriveLetterKey` is exactly that, so the existing component contract still holds — no changes needed there.

- [ ] **Step 2: Typecheck**

Run the `typecheck` skill. Expected: `page.tsx` compiles. `save/page.tsx` may still have stale `K` references — fixed next.

- [ ] **Step 3: Commit**

```bash
git add src/app/letter/[token]/page.tsx
git commit -m "$(cat <<'EOF'
feat(letters): sealed-envelope unlock scene with question + answer

Replaces tlock-based unlock with Argon2 derive from a typed answer.
Wrong answers no longer burn the 24h window (handled by /opened
endpoint). Tremor animation while deriving; 'try again' on bad answer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update Keep-forever save flow sessionStorage shape

**Files:**
- Modify: `src/app/letter/[token]/save/page.tsx`

- [ ] **Step 1: Update import**

In `src/app/letter/[token]/save/page.tsx`, replace the transient-crypto import:

```diff
-import { decryptTransient } from '@/lib/letters/transient-crypto'
+import { decryptWithLetterKey, rawKeyFromBase64 } from '@/lib/letters/answer-crypto'
```

- [ ] **Step 2: Update the cache interface**

Rename the `K` field on `CachedLetter` interface (around lines 11-29):

```typescript
interface CachedLetter {
  content: { text: string; song: string | null; doodles: unknown[] }
  senderName: string
  recipientName: string
  scheduledFor: string
  letterKey?: string // base64-encoded raw 32-byte AES-GCM key
  assets?: Array<{
    id: string
    type: string
    position: number
    spread: number
    rotation: number
    ordinal: number
    ciphertext: string
    iv: string
  }>
}
```

- [ ] **Step 3: Update internal call sites**

In the same file, search for every reference to `K` from the cached payload and rename to `letterKey`. Each call to `decryptTransient(ciphertext, iv, K)` becomes `decryptWithLetterKey(ciphertext, iv, rawKeyFromBase64(letterKey))` — or, since `K` is consumed multiple times in a loop, decode once at the top:

```typescript
  const rawKey = cached.letterKey ? rawKeyFromBase64(cached.letterKey) : null
  if (rawKey && cached.assets && cached.assets.length > 0) {
    // ... loop over assets ...
    const plaintextBytes = await decryptWithLetterKey(asset.ciphertext, asset.iv, rawKey)
  }
```

Replace every `decryptTransient(` call with `decryptWithLetterKey(`. The argument shape is identical (ciphertextBase64, ivBase64, rawKey) — just the function name changes.

If there are passages that explicitly construct a `Uint8Array` from a `K` base64 string, replace them with `rawKeyFromBase64(letterKey)`.

- [ ] **Step 4: Typecheck**

Run the `typecheck` skill. Expected: save page compiles. Remaining errors only inside `tlock.ts` and `transient-crypto.ts` — those files are deleted in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/app/letter/[token]/save/page.tsx
git commit -m "$(cat <<'EOF'
refactor(letters): Keep-forever uses letterKey from sessionStorage

Renames K → letterKey in the cached payload. decryptTransient is
replaced by decryptWithLetterKey. Same shape, new name.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Delete `tlock.ts` and `transient-crypto.ts`

**Files:**
- Delete: `src/lib/letters/tlock.ts`
- Delete: `src/lib/letters/transient-crypto.ts`

- [ ] **Step 1: Remove the files**

Run:
```bash
rm src/lib/letters/tlock.ts src/lib/letters/transient-crypto.ts
```

- [ ] **Step 2: Verify no stragglers**

Run:
```bash
docker compose exec app grep -rn "tlock\|transient-crypto\|tlockedKey\|drand" src/ --include="*.ts" --include="*.tsx" || echo "clean"
```

Expected: a few residual hits in `src/lib/letters/dual-read.ts` comments (irrelevant context — keep) and possibly in comments elsewhere. **No live imports.** If there are live imports, fix them now.

- [ ] **Step 3: Full typecheck**

Run the `typecheck` skill.

Expected: project typechecks cleanly. If anything still fails, it's likely a stale reference — find and remove.

- [ ] **Step 4: Restart the app and check it boots**

Run:
```bash
docker compose restart app
docker compose logs -f app --tail 50
```

Expected: server starts without errors. No Prisma client errors about missing fields. Hit Ctrl-C to leave the log tail.

- [ ] **Step 5: Commit**

```bash
git add -u src/lib/letters/
git commit -m "$(cat <<'EOF'
chore(letters): remove tlock + transient-crypto modules

tlock.ts and transient-crypto.ts are now obsolete — superseded by
answer-crypto.ts. Project typechecks cleanly with these gone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Update docs + mark old plan superseded

**Files:**
- Modify: `docs/letters-architecture.md`
- Modify: `docs/encryption-strategy.md`
- Modify: `docs/e2ee-architecture.md`
- Modify: `docs/superpowers/plans/2026-05-16-friend-letters-tlock.md`

- [ ] **Step 1: Update `docs/letters-architecture.md`**

Open the file. Find the friend-letter section (likely titled "Friend Letters" or "Phase 4 — Friend Letters"). Replace the section describing the **tlock + random K + drand** flow with:

```markdown
## Friend letters

Friend letters use **password+question+Argon2id e2ee**. The sender writes a question and an answer at seal time; the recipient sees the question on the unlock page and types the answer to decrypt.

### Crypto
- **Key derivation:** `letterKey = Argon2id(normalize(answer), salt, m=19MB, t=2, p=1)` → 32 bytes
- **Normalization** (must be byte-identical on both sides): NFKD → strip combining marks → lowercase → strip whitespace → strip punctuation/symbols
- **Body and photos:** AES-256-GCM under `letterKey`. Body lives in `LetterDelivery.transientCiphertext`. Photos live in `LetterDeliveryAsset` rows.
- **Server stores:** ciphertext, salt, question (plaintext), scheduledFor, recipient email. Never the answer or letterKey.

### Flow
1. Sender composes → SealModal collects question + answer + scheduledFor + recipient email.
2. Browser generates salt → derives letterKey → encrypts body + photo bytes.
3. `POST /api/letters/friend` writes the `Letter` + `LetterDelivery` + `LetterDeliveryAsset` rows.
4. Resend is scheduled to deliver `/letter/<publicToken>` at `scheduledFor`.
5. Recipient lands on the magic-link page → sees question → types answer → Argon2 derives → AES-GCM decrypts.
6. On successful decrypt the client `POST /api/letter/<token>/opened` to start the 24h read window.
7. Asset endpoints return ciphertext for each photo; the client decrypts with `letterKey`.

### Time lock
Email arrives at `scheduledFor` (Resend scheduling). The ciphertext endpoint also returns `425 not_yet` if hit before `scheduledFor`. No crypto-level time lock.

### Read window
First successful decrypt starts a 24h server-side clock (`firstReadAt` + `transientExpiresAt`). After that, the ciphertext endpoint returns `410 expired`. Unread for 60 days → cleanup cron drops the delivery and assets.

### Keep-forever
Recipient page caches `letterKey` (base64) + decrypted body + asset ciphertexts in `sessionStorage` so the save page can re-encrypt under the recipient's master key without re-fetching the magic link.
```

If the file has an older "tlock", "drand", or "Phase 4" section, delete those paragraphs entirely.

- [ ] **Step 2: Update `docs/encryption-strategy.md`**

Open the file. Find the tier-matrix row for friend letters. Update it:

| Content | Tier | Notes |
|---|---|---|
| Friend letter body + photos | Tier 1 (e2ee) | Key derived from sender's chosen answer via Argon2id. Salt + question stored server-side plaintext. Server cannot decrypt. |

(If the doc uses a different format, adapt — the substance is "still Tier 1 e2ee; key source changes from random+tlock to answer-derived.")

- [ ] **Step 3: Update `docs/e2ee-architecture.md`**

Open the file. Add a short paragraph distinguishing friend-letter crypto from journal crypto:

```markdown
### Friend letters — answer-derived key

Friend letters use a separate key path from journals and self-letters. While journals and self-letters are encrypted under the user's **master key** (PBKDF2 from the user's passphrase), friend letters are encrypted under a **letterKey** derived per-letter from a sender-chosen answer via Argon2id. This lets the recipient — who has no Hearth account or master key — decrypt by typing the answer the sender told them about (or that they share by other shared knowledge). See `docs/letters-architecture.md` for the full flow.
```

- [ ] **Step 4: Mark old plan superseded**

Open `docs/superpowers/plans/2026-05-16-friend-letters-tlock.md` and add this block at the very top (before the existing header):

```markdown
> **SUPERSEDED** by [2026-05-18-letters-password-e2ee](2026-05-18-letters-password-e2ee.md).
> The tlock/drand approach below was implemented but replaced before public launch. Kept for historical reference.

```

- [ ] **Step 5: Commit**

```bash
git add docs/letters-architecture.md docs/encryption-strategy.md docs/e2ee-architecture.md docs/superpowers/plans/2026-05-16-friend-letters-tlock.md
git commit -m "$(cat <<'EOF'
docs(letters): update architecture docs for password e2ee

Letters architecture rewritten for the new flow. Encryption-strategy
tier matrix updated. E2ee-architecture distinguishes journal master-key
vs friend-letter answer-key paths. Old tlock plan marked superseded.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: End-to-end manual verification

This task is the real test for the whole change. Two browser sessions (or two profiles) recommended.

**Files:** none

- [ ] **Step 1: Restart everything**

```bash
docker compose restart app
```

Wait for "ready" in the logs.

- [ ] **Step 2: Send a friend letter to yourself**

Use one of these:
- A real email address you control
- Or a service like Resend's testing inbox, or mailtrap.io, depending on your local Resend config

In Hearth:
1. Sign in as the sender user. Confirm `ENCRYPTION_KEY` env var is set (master key is required to seal letters).
2. Navigate to `/letters` → New friend letter.
3. Write some body text, attach 1-2 photos and a doodle if convenient.
4. Click "seal."
5. In the seal modal:
   - Recipient email: `<your email>`
   - Time pill: `1 hr (test)` (uses TEST-PILL — fine for E2E)
   - Question: `What's the answer to this test?`
   - Answer: `hearthtest`
6. Confirm.

Expected: modal shows "sealing..." → "folding" → "sealed" → bounces you to `/letters?tab=sent`.

- [ ] **Step 3: Verify DB state**

In a new terminal:
```bash
docker compose exec app npx prisma studio
```

Open in browser, navigate to `LetterDelivery`. Find the row you just created. Confirm:
- `transientCiphertext`: present, non-empty
- `transientIV`: present
- `salt`: present (base64, ~24 chars)
- `question`: matches what you typed
- `publicToken`: present
- `firstReadAt`: NULL (not opened yet)
- `tlockedKey`: column does NOT exist in the table at all

- [ ] **Step 4: Wait for the email to arrive (~1 hr per TEST-PILL)**

Once it arrives, confirm:
- URL in the email is `<APP_URL>/letter/<publicToken>` with no `#k=...` fragment.

If your local Resend setup runs in test mode and skips the schedule, the email may arrive immediately — that's fine.

- [ ] **Step 5: Open the link as the recipient**

In a private/incognito window:
1. Click the link.
2. Expected: sealed-envelope scene loads, showing sender name, scheduled date, the question, and an answer input.
3. Type the **wrong** answer first (e.g. `wrong`).
4. Expected: tremor animation, then "the seal holds. try again?" — letter does NOT open. **DB check:** `firstReadAt` is STILL `NULL` (wrong-answer attempts must not burn the window).
5. Type the **correct** answer (`hearthtest`).
6. Expected: tremor animation, then the envelope reveals and the letter content appears (body text + photos + doodle). Countdown shows "fades in 23h 59m" or similar.
7. **DB check:** `firstReadAt` is NOW set; `transientExpiresAt` is `firstReadAt + 24h`.

- [ ] **Step 6: Verify normalization**

Send another letter. Question: `Your birthday`. Answer: `1995-07-12`.

When unlocking, try `1995 07 12`, `19950712`, `Jul 12 1995` (if your DOB letters allow that level of variation). Confirm the normalization rules from §3.2 hold: `1995-07-12` and `19950712` should both unlock; `Jul 12 1995` should not (different characters after normalization — letters `jul`).

- [ ] **Step 7: Verify Keep-forever (optional)**

While the unlocked letter is visible:
1. Click "Keep this letter forever."
2. If you're logged in as the recipient with master key unlocked, expected: save flow runs, letter is added to your received-letters list.
3. Navigate to the recipient's letters and confirm the letter is readable from their account.

- [ ] **Step 8: Verify expired window**

After 24h post-first-read (or fake it by manually editing `firstReadAt` in Prisma Studio to be > 24h ago), reopen the magic link. Expected: "This letter has faded" screen.

- [ ] **Step 9: Commit (just a marker — no files)**

There's nothing to commit, but this is a checkpoint. If everything worked, the implementation is done. If anything failed, debug, fix, commit the fix, and re-run from Step 2.

---

## Self-Review Notes

### Spec coverage
- §3.1 key derivation → Task 3
- §3.2 normalization → Task 3 (with duplicated entropy-check helper in Task 9)
- §3.3 AES-GCM encrypt → Task 3 + Task 5 (caller)
- §3.4 server stores → Task 6 (POST) + Task 7 (meta) + Task 2 (schema)
- §3.6 non-goals → enforced by absence; no rate-limit code, no drand code, no date-gate logic
- §4 schema diff → Task 2
- §5 file changes → mirrored 1:1 in Tasks 4, 5, 6, 7, 8, 11, 12, 13, 14
- §6.1 sender UX → Task 9 + Task 10
- §6.2 recipient UX → Task 11
- §6.3 first-read claim split → Task 8 (route changes) + Task 11 (client calls `/opened`)
- §7 drafts → existing infrastructure unchanged, validated in Task 15 step 2 (compose works end-to-end with autosave drafts)
- §9.1 dep & code removal → Task 1 + Task 13
- §9.2 sessionStorage shape → Task 12
- §9.3 plan supersession → Task 14 step 4
- §9.4 docs rewrites → Task 14 steps 1-3

### Type consistency
- `letterKey: Uint8Array` is the consistent name everywhere (asset-bundler, friend-letter-client, page.tsx, save/page.tsx).
- `deriveLetterKey(answer, saltBase64): Promise<Uint8Array>` consistent.
- `encryptWithLetterKey` / `decryptWithLetterKey` consistent.
- `salt` and `question` field names consistent across schema, routes, UI.

### Risks flagged for the implementer
- The `LetterPhotos` component still takes a `K` prop — passing `letterKey` (a `Uint8Array`) into it works because shape is identical, but if the prop name on that component bothers the reviewer, rename in a follow-up. Not blocking.
- The TEST-PILL `1h` lead time remains in `friend/route.ts`. Leave alone — pre-launch hygiene is its own task (grep for `TEST-PILL` before public launch).
