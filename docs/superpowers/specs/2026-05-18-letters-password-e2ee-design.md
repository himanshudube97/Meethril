# Friend letters — password+question e2ee redesign

**Status:** design approved, awaiting implementation plan
**Date:** 2026-05-18
**Scope:** friend letters only (self-letters unchanged; stranger notes unchanged)

---

## 1. Why

Today's friend-letter encryption uses **tlock-js + drand**: the body is encrypted under a random per-letter key `K`, and `K` is time-lock-encrypted to a drand round near the unlock date. The magic-link URL fragment carries the tlock-encrypted `K`. This works but has two structural issues:

1. **External dependency on drand.** If the drand network is unreachable or shuts down, every undelivered friend letter becomes undecryptable. Hearth has no control over that liveness.
2. **Crypto-level time-lock is more security than the product needs.** The product guarantee we actually want is *"the recipient gets this on date X"* — which is already enforced by Resend scheduling the email. The crypto-level time-lock adds dependency cost without a matching product benefit.

We're replacing it with a **password-based e2ee scheme** where the sender writes a *question only the two of them would know the answer to*, the recipient types the answer to unlock, and the answer is stretched through **Argon2id** before serving as the AES key. No external dependencies. Server stores opaque ciphertext + a salt + the question. Time-lock comes from email scheduling.

---

## 2. The user-facing reframe

We are deliberately **not** using the words "password" or "hint" anywhere in the UI. The model in the user's head is:

> *"I'm sealing this letter with a question only the two of us would know the answer to."*

In the UI:
- The sender labels things **"a question only you both know"** and **"the answer"**.
- The recipient sees the question on a parchment card, with a single answer field beneath it.

Internally in code, we can name the fields whatever's clearest (`question`, `answer`, `salt`, `letterKey`). The UI strings are what matter for the product feeling.

---

## 3. Cryptography

### 3.1 Key derivation

```
answer_norm = normalize(answer)
salt        = random 16 bytes (per letter)
letterKey   = Argon2id(answer_norm, salt, m=19MB, t=2, p=1, hashLen=32)
```

**Parameters:**
- `m=19456 KiB`, `t=2`, `p=1` — OWASP-recommended minimum for Argon2id. ~1s on a mid-range Android, ~300ms on desktop. Bumping `m` higher fails on low-RAM mobile browsers without meaningfully improving security against guessable answers; answer entropy is the real bottleneck, not Argon2 cost.
- `hashLen=32` — produces a 256-bit AES key.
- Browser implementation via **`hash-wasm`** package (≈50KB WASM, well-maintained).

### 3.2 Normalization

`normalize(s)` runs in both sender and recipient browsers and MUST produce byte-identical output:

```
1. Unicode NFKD normalize
2. Strip combining marks  (so "é" → "e")
3. Lowercase
4. Strip all whitespace
5. Strip all punctuation (anything in \p{P} or \p{S} unicode categories)
```

This means `"Café Lumière"`, `"cafe lumiere"`, `"CAFE  LUMIERE!"` all collapse to `cafelumiere`. Senders are coached in the compose UI to choose questions where the answer is unambiguous despite this normalization.

### 3.3 Encryption

```
contentCiphertext, contentIV = AES-256-GCM(body_json, letterKey)
```

Where `body_json` is the same shape as today — text body, song, doodle strokes inline, asset reference list, style metadata.

Photo assets each get their own IV but **share `letterKey`**:

```
for each photo:
  assetCiphertext, assetIV = AES-256-GCM(photo_bytes, letterKey)
```

GCM with key reuse + unique IVs per message is safe by design. We use random 12-byte IVs.

### 3.4 What the server stores

| Field | Plaintext on server? | Notes |
|---|---|---|
| `LetterDelivery.transientCiphertext` | ✗ | AES-GCM ciphertext of body |
| `LetterDelivery.transientIV` | ✓ (not secret) | 12-byte IV, base64 |
| `LetterDelivery.salt` (new) | ✓ (not secret) | 16-byte Argon2 salt, base64 |
| `LetterDelivery.question` (new) | ✓ **plaintext** | Shown on the unlock page. Server-readable metadata. |
| `LetterDelivery.publicToken` | ✓ | Random URL token |
| `LetterDeliveryAsset.ciphertext` | ✗ | AES-GCM ciphertext of photo |
| `LetterDeliveryAsset.iv` | ✓ | Per-asset IV |
| `Letter.recipientEmail` | ✓ | Needed to send the email |
| `Letter.scheduledFor` | ✓ | Needed by the delivery cron |
| `Letter.senderName`, `recipientName` | ✓ | Plaintext on the envelope, by design |

### 3.5 Threat model — what's actually protected

**Confidentiality of letter content:** the server, the network, the email provider, and anyone who breaches the DB cannot read the letter body or photos without the answer. Argon2id forces them to spend ≥1s of compute per guess.

**What's visible to the server (metadata footprint):**
- Who sent to whom and when
- The question text
- Photo count + size, doodle presence, style metadata
- Read timing (`firstReadAt`)

This is unavoidable in the magic-link model. We document it honestly and do **not** market this as "the server knows nothing about your letter." The server knows the envelope and the question; it does not know the contents or the answer.

**What breaks the scheme:**
- A guessable answer (`1234`, the recipient's known birthday, etc.). The UI nudges away from these but can't prevent them.
- The sender accidentally writing the answer into the question field. Same risk as any "hint" system.
- The sender sharing the answer through the same channel as the magic link (e.g., emailing the answer in plaintext). The UI never does this for them; we document the pattern.

### 3.6 What we deliberately do NOT do

- No drand / tlock — full removal. `tlock-js` dependency dropped.
- No server-side date gate on `/api/letter/[token]/ciphertext`. The recipient possessing the magic-link URL is the only gate; once they have it (email arrived at `scheduledFor`), they can decrypt at any time.
- No server-side rate limit on answer attempts. AES-GCM rejection is silent — the server isn't validating anything, so there's nothing to rate-limit. Client allows unlimited retries.
- No password recovery / reset. If the recipient forgets the answer, the letter is permanently undecryptable. This is intentional; recovery would require the sender to escrow a key, which breaks the model.
- No "preview the password the recipient will see." The sender chose the answer; the system trusts them.

---

## 4. Schema changes

All changes are to `prisma/schema.prisma`. Per user instruction ("I don't have any users as of now"), this is a clean migration — drop columns and re-create, no data preservation needed.

### 4.1 `LetterDelivery` — modify

```diff
 model LetterDelivery {
   id       String @id @default(cuid())
   letterId String @unique
   letter   Letter @relation(fields: [letterId], references: [id], onDelete: Cascade)

-  // Phase 4 (friend letters): the ciphertext that gets delivered.
-  // Encrypted with a random per-letter K (NOT the master key).
+  // Friend letters: AES-256-GCM ciphertext of body_json.
+  // Encrypted with letterKey = Argon2id(normalize(answer), salt).
+  // Neither the answer nor letterKey ever reach the server.
   transientCiphertext String @db.Text
   transientIV         String

-  // K time-locked to letter.scheduledFor via Drand
-  tlockedKey String @db.Text
+  // Argon2id salt, 16 bytes base64. Not secret.
+  salt String
+
+  // Plaintext: shown to the recipient on the unlock page so they know
+  // what answer to type. Visible to anyone with DB access — metadata leak
+  // by design (the magic-link recipient has no account, so we have no
+  // pre-shared key to encrypt this under).
+  question String @db.Text

-  // Public token used in the URL path. Fragment carries tlockedKey.
+  // Public token used in the URL path. URL has no fragment.
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

### 4.2 `LetterDeliveryAsset` — comment update only

The schema fields stay. Only the comment block changes:

```diff
-  // K-encrypted asset bytes (base64). Recipient has K via the URL
-  // fragment + tlock; decrypts with K to recover the original photo
-  // or doodle bytes.
+  // letterKey-encrypted asset bytes (base64). Recipient derives
+  // letterKey from their typed answer + the LetterDelivery.salt and
+  // decrypts to recover the original photo bytes.
```

### 4.3 `Letter` — no changes

Draft autosave fields (`draftText`, `draftTextIV`, `draftPhotos`, etc.) remain exactly as today. They store the master-key-encrypted draft; the seal flow consumes them and produces the answer-encrypted final payload.

### 4.4 Migration

Single Prisma migration:
- `DROP COLUMN tlockedKey`
- `ADD COLUMN salt VARCHAR NOT NULL`
- `ADD COLUMN question TEXT NOT NULL`

Any existing `LetterDelivery` rows are dropped (none in production per the user). Local dev DB resets cleanly.

---

## 5. Code changes

### 5.1 Files to delete

| Path | Reason |
|---|---|
| [src/lib/letters/tlock.ts](src/lib/letters/tlock.ts) | tlock/drand encrypt + decrypt helpers — no longer needed |
| `tlock-js` in [package.json](package.json) | Drop dependency |

### 5.2 Files to add

**[src/lib/letters/answer-crypto.ts](src/lib/letters/answer-crypto.ts)** — new module, ~80 LOC:

```ts
export function normalizeAnswer(s: string): string;
export async function deriveLetterKey(answer: string, saltBase64: string): Promise<CryptoKey>;
export async function generateSalt(): Promise<string>;  // 16 random bytes, base64
export async function encryptWithLetterKey(plaintext: Uint8Array, key: CryptoKey): Promise<{ciphertext: string; iv: string}>;
export async function decryptWithLetterKey(ciphertext: string, iv: string, key: CryptoKey): Promise<Uint8Array>;
```

Argon2id via `hash-wasm`. AES-GCM via WebCrypto.

**Add `hash-wasm`** to dependencies.

### 5.3 Files to modify

| Path | Change |
|---|---|
| [src/lib/letters/friend-letter-client.ts](src/lib/letters/friend-letter-client.ts) | `buildFriendLetterPayload` rewrite: accept `{draft, question, answer, unlockDate}`, derive `letterKey`, encrypt body + assets under it, return `{salt, question, transientCiphertext, transientIV, assets[]}`. Remove the `K`/tlock path entirely. |
| [src/lib/letters/asset-bundler.ts](src/lib/letters/asset-bundler.ts) | `bundleFriendLetterAssets` now takes `letterKey` instead of generating a random `K`. Re-encrypts photos under `letterKey`. |
| [src/lib/letters/transient-crypto.ts](src/lib/letters/transient-crypto.ts) | Either delete (logic moves into `answer-crypto.ts`) or keep as a thin AES-GCM wrapper. Decide during implementation. |
| [src/app/api/letters/friend/route.ts](src/app/api/letters/friend/route.ts) | `POST` body shape: accept `salt`, `question`, drop `tlockedKey`. Create `LetterDelivery` row with new columns. |
| [src/app/api/letter/[token]/meta/route.ts](src/app/api/letter/[token]/meta/route.ts) | Response shape: return `{scheduledFor, senderName, recipientName, alreadyExpired, firstReadAt, salt, question, assets[]}`. Drop `tlockedKey`. |
| [src/app/api/letter/[token]/ciphertext/route.ts](src/app/api/letter/[token]/ciphertext/route.ts) | **Behavior change:** no longer claims `firstReadAt` on fetch. Returns `{ciphertext, iv}` idempotently. The 24h-window expiry check stays — once `firstReadAt` is set (by the new `/opened` endpoint), 410s after `firstReadAt + 24h` as before. See §6.3. |
| `src/app/api/letter/[token]/opened/route.ts` (**new**) | `POST` endpoint client calls after a successful client-side decrypt. Atomically sets `firstReadAt` and `transientExpiresAt = firstReadAt + 24h`. Idempotent — subsequent calls are no-ops. |
| [src/app/letter/[token]/page.tsx](src/app/letter/[token]/page.tsx) | Major UX rewrite — sealed-envelope scene with question + answer input. See §6.2. |
| [src/app/letter/[token]/save/page.tsx](src/app/letter/[token]/save/page.tsx) | "Keep forever" flow: replace `K` retrieval from sessionStorage with `letterKey` retrieval. Same downstream pattern: decrypt under `letterKey` → re-encrypt under master key → `POST /api/photos`. |
| Email template (friend letter, in [src/lib/email.ts](src/lib/email.ts) or similar) | Drop `#k=<tlockedKey>` from the magic link. Link becomes plain `/letter/<publicToken>`. Email body content unchanged otherwise. |
| Friend-letter compose form (likely under [src/components/letters/](src/components/letters/)) | Add question + answer inputs, example prompts popover, low-entropy nudge. See §6.1. |
| [src/lib/letters/draft-decrypt.ts](src/lib/letters/draft-decrypt.ts) | Unchanged — drafts are still master-key encrypted. |
| [src/lib/letters/resend-webhook.ts](src/lib/letters/resend-webhook.ts) | Unchanged. |
| [src/lib/letters/dual-read.ts](src/lib/letters/dual-read.ts) | Unchanged — Phase 5 helper that wraps `Letter` table reads, unrelated to tlock. Stays. |

### 5.4 Docs to update

- [docs/letters-architecture.md](docs/letters-architecture.md) — rewrite the friend-letter section to match the new flow. Remove all tlock / drand references.
- [docs/encryption-strategy.md](docs/encryption-strategy.md) — update the friend-letter row in the tier matrix. Body + assets are still Tier-1 e2ee, but the key derivation source changes from "random K + tlock" to "Argon2id(answer)".
- [docs/e2ee-architecture.md](docs/e2ee-architecture.md) — minor; add a paragraph about the friend-letter answer-key path so it's distinguished from journals/photos which use the master key.

---

## 6. UX

### 6.1 Sender — compose & seal

The friend-letter composer already exists. Two additions on the **seal** step (after writing the letter, when picking recipient + send date):

**Question input.** Single-line text. Label: *"A question only you both know the answer to."* Placeholder rotates through examples: *"What's the name of our favorite cafe?"*, *"Your birthday in DDMMYYYY"*, *"The nickname only you call me"*.

**Answer input.** Type=password. Label: *"The answer."* Helper text underneath: *"Type it exactly the way they will. Capitalization, spaces, and punctuation are ignored."* (This communicates the normalization rule honestly.)

**Examples popover.** Tappable `?` icon next to the question input. Reveals 4 inline example questions:
- *"Where did we meet?"* (single word, lowercase)
- *"Your birthday in DDMMYYYY"* (format spelled out)
- *"The nickname only you call me"*
- *"The book we both cried over"*

**Low-entropy nudge.** If the typed answer (after normalization) is shorter than 4 characters OR is all digits and ≤6 characters, show a soft warning beneath the field: *"That might be too easy to guess. Try something only the two of you would know."* No blocking — sender can proceed anyway.

**Sealing.** On submit:
1. Client reads the draft from `Letter.draftText` / `draftPhotos` / etc.
2. Decrypts them under the sender's master key.
3. Generates `salt`, runs Argon2id on `normalize(answer) + salt` → `letterKey`.
4. Re-encrypts the body and each photo under `letterKey`.
5. `POST /api/letters/[id]/seal` (or `POST /api/letters/friend`, current shape — settle in implementation) with `{salt, question, transientCiphertext, transientIV, assets[], scheduledFor}`.
6. Server creates the `LetterDelivery` row, nulls the draft fields, flips `Letter.isSealed=true`.
7. Resend is scheduled to deliver the magic-link email at `scheduledFor`.

The sender never sees the salt or the derived key. They see "Letter sealed, will be delivered on <date>."

### 6.2 Recipient — unlock scene

The `/letter/<publicToken>` page becomes a small set piece. On-aesthetic with Hearth's paper/playfair palette.

**On load:**
- `GET /api/letter/[token]/meta` returns `{senderName, scheduledFor, salt, question, alreadyExpired, firstReadAt, assets[]}`.
- If `alreadyExpired` (already read more than 24h ago) → show "this letter has wilted" screen, no input.
- Otherwise render the **sealed envelope scene**:

**Scene composition** (top to bottom):
1. Header: *"{senderName} left you something"* in playfair italic. Date below: *"sealed {scheduledFor}"*.
2. Center: a wax-sealed envelope illustration (SVG, ~300px). Subtle hover wobble.
3. Below envelope: parchment card containing the **question** in playfair italic, ~24px.
4. Underline-only input field beneath the question. Placeholder: *"whisper the answer…"*.
5. Single submit button styled as "Break the seal" (or simply an arrow icon).

**On submit:**
1. Show "trying to break the seal…" with a subtle envelope tremor animation (CSS keyframes).
2. Client derives `letterKey` from `normalize(answer)` + `salt` via Argon2id (~1s).
3. `GET /api/letter/[token]/ciphertext` — server atomically claims `firstReadAt` and returns `{ciphertext, iv}`.
4. Client attempts `AES-GCM decrypt`.
   - **GCM tag mismatch** (wrong answer): catch the error. Show *"the seal holds. try again?"* under the question. Envelope returns to rest. **CRITICAL:** the ciphertext fetch already claimed `firstReadAt`, but the user hasn't actually read anything yet. Handle this — either don't fetch ciphertext until *after* successful client-side derive + a successful test decrypt of a known-format payload, OR add a separate "I read it" client confirmation endpoint that sets `firstReadAt` (cleaner). Decision deferred to implementation; flagging it here.
   - **Success:** wax seal cracks (SVG animation, ~600ms), envelope opens, letter content slides up. Photos fade in below the body.
5. Once unlocked, the recipient sees standard letter render: body, photos, song, doodles, with "Keep forever" CTA at the bottom (if logged into Hearth) or "Save the moment" CTA (if not, prompts account creation).

**Wrong-answer UX details:**
- No retry counter shown. No lockout.
- The question stays visible (recipient might have misread it).
- The input clears after a wrong attempt.
- After 3 consecutive wrong attempts, surface a softer prompt: *"Stuck? You could ask {senderName} for a hint — but they might not remember either."* This is just copy, no functional change.

**Audio.** If the user has theme sounds enabled (existing Hearth feature), wax-seal-crack plays a single soft *snap* on successful unlock. Otherwise silent.

### 6.3 First-read claim — design decision

Today, hitting `/api/letter/[token]/ciphertext` claims `firstReadAt` atomically (so the 24h timer starts). With the new scheme, the recipient might fetch ciphertext, fail decryption (wrong answer), and walk away — burning the 24h window without ever seeing the letter.

**Resolution:** split the read-claim into two server calls:
1. `GET /api/letter/[token]/ciphertext` — does NOT set `firstReadAt`. Just returns `{ciphertext, iv}` along with `{salt, question}` from meta (or keep them separate, same idea). Idempotent.
2. `POST /api/letter/[token]/opened` — client calls this only after successful AES-GCM decrypt. Atomically sets `firstReadAt` and starts the 24h transient-expiry clock.

If the recipient closes the tab between (1) and (2), `firstReadAt` stays null and the 60-day-unread cleanup eventually applies — same as today.

This is a behavior change from today's atomic-on-fetch model, but it's the right one for password-gated decrypt where the server can't tell whether the fetch resulted in a successful read. Worth flagging in the cleanup-cron docs.

---

## 7. Drafts (no schema change)

`Letter` already has draft fields (`draftText`, `draftTextIV`, `draftSong`, `draftSongIV`, `draftPhotos`, `draftDoodles`, `draftStyle`) encrypted under the **sender's master key**. The new design uses them unchanged:

| Phase | `Letter.draftText` / `draftPhotos` | `Letter.isSealed` | `LetterDelivery` |
|---|---|---|---|
| Drafting | Master-key encrypted, autosaved | `false` | none |
| Sealing (in-flight) | Read by client, decrypted under master key | flipping to `true` | being created |
| Sealed | NULL (cleared by seal endpoint) | `true` | row exists, answer-encrypted ciphertext + assets |

Discarding a draft = delete the `Letter` row (no `LetterDelivery` exists, no cleanup hooks fire). Existing draft autosave routes (`/api/letters/drafts/...`) don't need changes — they already operate on master-key-encrypted blobs.

**One caveat:** today's sender does NOT preserve a personal copy of friend letters after sealing — `Letter.contentCiphertext` stays null for friend letters, and `LetterDelivery.transientCiphertext` gets cleaned up after 24h/60d. So if a sender wants to re-read what they sent Anna six months ago, they can't.

This is **existing behavior, not a regression of this design.** It's worth noting as a future-work UX gap, but we are explicitly NOT fixing it in this spec. Doing so would require either:
- Encrypting a sender-copy under master key during seal (~easy, but it's scope creep)
- Or pulling sealed letters back into `contentCiphertext` via a separate "sent letters archive" feature

Leaving for a future spec.

---

## 8. Non-goals (explicit)

The following are out of scope for this change. Listed so we don't accidentally bundle them:

- ❌ Self-letter changes (they keep master-key encryption, which is already gap-free e2ee)
- ❌ Stranger-note changes (Tier-2 server-encrypted by design, for moderation)
- ❌ Sender-side preserved copy of sent friend letters (existing gap, leaving)
- ❌ Multi-recipient support
- ❌ Password rotation / re-key
- ❌ Account recovery for the answer (intentionally impossible)
- ❌ Server-side rate-limiting on answer attempts (no oracle, nothing to rate-limit)
- ❌ Server-side date gate on ciphertext fetch (time-lock = email delivery)
- ❌ Wordle-style letter-count hints or progress indicators (entropy leak)
- ❌ Multi-stage puzzles / multiple-question chains (YAGNI; one question is enough)

---

## 9. Cleanup — companion housekeeping

These are tied to this change and should land in the same PR(s), not deferred:

### 9.1 Dependency & code removal

- Remove `tlock-js` from [package.json](package.json) and [package-lock.json](package-lock.json).
- Delete [src/lib/letters/tlock.ts](src/lib/letters/tlock.ts) entirely.
- Grep the repo for any remaining `tlock`, `drand`, `tlockedKey`, `tlockEncryptKey`, `tlockDecryptKey` references and remove them. Should be a small handful.
- Fold [src/lib/letters/transient-crypto.ts](src/lib/letters/transient-crypto.ts) into the new `answer-crypto.ts`. The two AES-GCM helpers there (`encryptTransient`, `decryptTransient`) are subsumed by `encryptWithLetterKey` / `decryptWithLetterKey` — same primitive, semantically tied to the new key derivation. Net result: one crypto module for friend letters instead of two.

### 9.2 sessionStorage cache (Keep-forever flow)

The recipient page caches decrypted letter content in `sessionStorage` under a token-scoped key so the save page can re-encrypt under the recipient's master key without re-fetching. See [src/app/letter/[token]/page.tsx:156](src/app/letter/[token]/page.tsx#L156) and [src/app/letter/[token]/save/page.tsx:107](src/app/letter/[token]/save/page.tsx#L107).

Action: update the cached payload shape to drop the `K` field (no longer exists) and replace with the necessary inputs for re-encryption — likely just the decrypted body JSON + decrypted photo Uint8Arrays. The Keep-forever flow doesn't need the `letterKey` itself after decryption; it just needs the plaintext blobs to re-encrypt under the recipient's master key.

### 9.3 Plan-file supersession

Mark [docs/superpowers/plans/2026-05-16-friend-letters-tlock.md](docs/superpowers/plans/2026-05-16-friend-letters-tlock.md) as superseded — add a header note pointing to this spec. Don't delete (history is useful), just flag it.

### 9.4 Docs rewrites

Already covered in §5.4 — re-stating here so cleanup is in one place:
- [docs/letters-architecture.md](docs/letters-architecture.md) — rewrite friend-letter section
- [docs/encryption-strategy.md](docs/encryption-strategy.md) — update tier matrix row
- [docs/e2ee-architecture.md](docs/e2ee-architecture.md) — distinguish friend-letter answer-key path from journal master-key path

### 9.5 NOT in scope (flagged for future, do not bundle)

- Legacy `Letter` model fields with "Phase N" comments (`isReceivedLetter`, `isViewed`, `letterPeekedAt`, `isArchived` — some of these were Phase 2 backfill snapshots that are no longer canonical). Cleaning these up is its own normalization pass, unrelated to e2ee.
- `keptPhotoRefs` JSON column normalization (schema comment already flags this for a future "Phase 7 cleanup").
- Sender-side preserved copy of sent friend letters (already noted in §7 — separate spec when we decide to fix it).
- Renaming `transientCiphertext` / `transientIV` / `transientExpiresAt` to drop the "transient" prefix. The field names are now slightly misleading (ciphertext lifetime is the same as before — 24h post-read or 60d unread — but it's no longer tlock-style "transient until round X"). Pure cosmetic, defer.

---

## 10. Open questions for implementation

These are genuinely undecided and the implementation plan will resolve them:

1. **Argon2 progress UI** — does `hash-wasm` expose a progress callback? If so, drive the envelope-tremor animation from real progress. If not, just use a timed CSS animation (~1.2s loop) that resolves whenever the derive promise resolves.
2. **Audio asset** — wax-seal-crack sound. Either pull from existing Hearth theme-sounds bank or use a single new SFX. Check what's already in [public/sounds/](public/sounds/) before commissioning.
3. **Compose-form file location** — find the existing friend-letter seal form and integrate question/answer inputs there. Likely under `src/components/letters/` but exact path confirmed during implementation.
4. **Seal endpoint shape** — today friend-letter creation is `POST /api/letters/friend`. Decide whether the seal step stays as that one-shot endpoint or splits into `POST /api/letters/[id]/seal` (draft → sealed transition). The latter matches the draft model better but requires more refactor. Default: keep one-shot for now, refactor later if needed.

---

## 11. Summary in one paragraph

Friend letters get sealed with a question + answer chosen by the sender. The answer (normalized: lowercase, no whitespace, no punctuation, NFKD unicode) goes through Argon2id with a per-letter salt to produce a 256-bit AES key, which encrypts the body and all photos client-side. The server stores ciphertext, salt, question, scheduledFor, and recipient email — nothing else. Resend delivers a magic-link email at the unlock date; the recipient lands on a sealed-envelope page, sees the question, types the answer, and the browser decrypts everything locally. No drand, no tlock, no external dependency. The only path to the contents is through someone who knows the answer.
