# E2EE architecture

## Threat model

- ✅ Server breach (DB dump, server compromise, malicious admin) yields only ciphertext
- ✅ Network interception sees only ciphertext (TLS + E2EE)
- ✅ Storage provider (Supabase) cannot read photo bytes (they're encrypted before upload)
- ✅ Email provider (Resend) never sees E2EE content
- ❌ Compromise of the user's *unlocked* browser session can read everything
- ❌ Loss of both daily key and recovery key is unrecoverable (by design)

## Crypto stack

- **AES-256-GCM** for symmetric encryption
- **PBKDF2-SHA256, 100k iterations** for deriving wrapping keys from passphrases
- **Web Crypto API** (`crypto.subtle`) — runs in the browser, never on the server
- **Random IVs** (12 bytes) for every encryption — never reused with the same key
- **Random salts** (16 bytes) for daily-key PBKDF2; deterministic for recovery-key (the recovery key is itself random)

## Key hierarchy

```
                 master key (random, never typed)
                  ↑                ↑
     wraps with daily key      wraps with recovery key
     (user-typed passphrase)    (24-char random, written down)
                  ↓                ↓
     encryptedMasterKey      encryptedMasterKeyRecovery
     (stored on server)      (stored on server)
```

The master key encrypts all user data. The two wrapping keys exist only in the user's head and on paper. Server has both wrapped versions but cannot unwrap either.

### Friend letters — answer-derived key

Friend letters use a separate key path from journals and self-letters. While journals and self-letters are encrypted under the user's **master key** (PBKDF2 from the user's passphrase), friend letters are encrypted under a **letterKey** derived per-letter from a sender-chosen answer via Argon2id (`m=19MB, t=2, p=1`). This lets the recipient — who has no Hearth account or master key — decrypt by typing the answer the sender told them about (or that they share by shared knowledge). The Argon2id salt and the question are stored server-side in plaintext; the answer and `letterKey` are never stored. See `docs/letters-architecture.md` for the full flow.

## What the server sees

| Field | When E2EE on |
|---|---|
| `text`, `textPreview`, `mood`, `tags`, `song` | ciphertext only |
| Photo bytes | ciphertext only (in `EncryptedBlob` table or Supabase Storage) |
| Photo storage path | ciphertext only (`encryptedRef` column) |
| Doodle strokes | ciphertext only |
| Self-letter sender/recipient/location | ciphertext only |
| Scrapbook items | ciphertext only |
| Timestamps, entry type, letter delivery flags, recipient email | plaintext (server functional requirement) |

## Per-entry encryption

Every JournalEntry has `encryptionType: 'server' | 'e2ee'`. The two paths are mutually exclusive at the row level:

- `server`: server-side `encrypt()` runs on text fields, server stores the result
- `e2ee`: client encrypts with master key, server stores ciphertext as-is, sets `encryptionType='e2ee'` and a per-field IV map in `e2eeIVs`

Server branches on `encryptionType` in both directions:
- Write: skip server-side `encrypt()` if `encryptionType === 'e2ee'`
- Read: don't try to decrypt with server key if `encryptionType === 'e2ee'`; client decrypts

## Photo storage flow

```
Browser:
  raw photo bytes → encryptBytes(masterKey) → ciphertext blob
  POST /api/photos (multipart)
    server: getPhotoAdapter().store(ciphertext, userId) → handle
    server returns { handle }
  encryptString({handle, iv}, masterKey) → encryptedRef + encryptedRefIV
  send entry to /api/entries with photos[].encryptedRef + photos[].encryptedRefIV
```

The adapter pattern (`PhotoStorageAdapter` interface, `LocalPostgresAdapter` for dev, `SupabaseStorageAdapter` for prod) is selected at startup via `PHOTO_STORAGE` env var. Browser code is identical across modes.

## Key persistence

Master key is cached in `localStorage` as `{ key: <base64>, expiresAt: <epoch ms> }` with a 7-day TTL by default. On app load, the store hydrates from localStorage; if the entry is missing or expired, the user sees the UnlockModal.

`localStorage` is a cache, not a source of truth. The wrapped master key is always on the server. Clearing localStorage manually is non-destructive — the user re-derives the master key on next unlock with daily key or recovery key.

## Backfill on enable

When a user enables E2EE for the first time, `useBackfill` runs in their browser:

1. `GET /api/entries/backfill-batch?cursor=X` — server returns up to 20 plaintext entries (those still on `encryptionType='server'`), decrypted server-side on the way out
2. For each entry, encrypt all fields with master key (and migrate photos: download → encrypt → upload via the adapter)
3. `PUT /api/entries/[id]` with `encryptionType='e2ee'` and the new ciphertext
4. Save progress in `localStorage.hearth-backfill-progress`. If the tab closes mid-flow, resume on next unlock via `E2EEProvider`'s effect.

Failed entries are logged in `failedIds`; they remain on `encryptionType='server'` until the user manually edits them (which triggers a normal E2EE write path).

## Recovery flows

### Forgot daily key (use recovery key)

1. User enters recovery key in RecoveryModal
2. SHA-256 hash compared to stored `recoveryKeyHash` for verification
3. PBKDF2(recoveryKey) derives wrapping key
4. Browser unwraps `encryptedMasterKeyRecovery` → master key
5. User picks new daily key
6. Browser re-wraps master key with new daily-key wrapping
7. `POST /api/e2ee/update-daily-key` replaces the daily-key blob
8. Recovery-key blob and hash unchanged

### Rotate recovery key (have daily key, want fresh recovery key)

1. User must already be unlocked (master key in memory)
2. Browser generates new recovery key (24 chars random)
3. PBKDF2(newRecoveryKey) derives new wrapping key
4. Browser wraps master key with new recovery wrapping
5. SHA-256(newRecoveryKey) → new recoveryKeyHash
6. `POST /api/e2ee/update-recovery-key` replaces the recovery-key blob and hash
7. Old recovery key file is now invalid

In both flows, the master key never changes — no data re-encryption.

## Stats endpoint and E2EE

The `/api/entries/stats` endpoint returns `clientAggregationRequired: true` when the user has any `encryptionType='e2ee'` entries. In that case:

- `avgMood` is `null` for months/years that have E2EE entries (mood is ciphertext)
- Structural data (counts, streaks, year/month navigation) is still accurate
- v1 client renders "stats unavailable" where avgMood would appear
- Future: client can decrypt entries locally and aggregate moods in the browser

## Adding new encrypted fields

Three steps:

1. **Add the field to `EncryptableDraft` and the encrypt/decrypt branches in `src/lib/e2ee/draft-encryptor.ts`.**
2. **Add an IV slot in the `e2eeIVs` JSON column** (or a new column on the new model — `e2eeIVs Json?` is the convention).
3. **Server stores ciphertext as-is when `encryptionType === 'e2ee'`** — no new server-side encryption code needed.

Worked example — adding a `weather` field:

```typescript
// 1. In draft-encryptor.ts:
export interface EncryptableDraft {
  // ... existing fields
  weather?: string | null
}

const STRING_FIELDS = [
  // ... existing
  'weather',
] as const
```

```typescript
// 2. In API route (no schema change needed if weather is already a column on JournalEntry):
const { weather, ... } = body
data: { weather, ...(encryptionType === 'e2ee' ? {} : { /* server encryption */ }) }
```

The IV map's `weather` slot lives inside the existing `e2eeIVs` JSON column. No migration required.

## What cannot be added without breaking E2EE

- **Server-side processing of plaintext content** — the server has no way to read encrypted fields
- **AI features that summarize/analyze entry text** — would need plaintext at the model
- **Server-side full-text search** — by design impossible
- **Server-side analytics on entry content** — same reason
- **Push notifications based on what the user wrote** — same reason

For these, either run the operation client-side (decrypt locally, then send to a model with explicit user consent) or accept that the feature only works for non-E2EE users.

## File map

| File | Responsibility |
|---|---|
| `src/lib/e2ee/crypto.ts` | Web Crypto primitives, key wrapping, key persistence |
| `src/lib/e2ee/draft-encryptor.ts` | Pure encrypt/decrypt of all user-content fields |
| `src/lib/storage/photo-adapter.ts` | Adapter interface + factory |
| `src/lib/storage/local-postgres-adapter.ts` | Dev adapter (writes EncryptedBlob table) |
| `src/lib/storage/supabase-storage-adapter.ts` | Prod adapter (uploads to Supabase Storage) |
| `src/store/e2ee.ts` | Zustand store for E2EE state, unlock status, backfill progress |
| `src/hooks/useE2EE.ts` | React hook wrapping draft-encryptor for components |
| `src/hooks/useAutosaveEntry.ts` | Branches on isE2EEReady before fetch |
| `src/hooks/useBackfill.ts` | Backfill orchestration with localStorage checkpoint |
| `src/hooks/usePhotoSrc.ts` | Decrypts photo bytes for rendering |
| `src/components/e2ee/SetupModal.tsx` | 4-step setup wizard |
| `src/components/e2ee/UnlockModal.tsx` | Daily-key entry, 7-day default TTL |
| `src/components/e2ee/RecoveryModal.tsx` | Recovery-key entry, set new daily key |
| `src/components/e2ee/RotateRecoveryKeyModal.tsx` | Generate new recovery key |
| `src/components/e2ee/BackfillToast.tsx` | Non-blocking progress UI |
| `src/components/e2ee/E2EEProvider.tsx` | Mounts modals + auto-resume backfill |
| `src/app/api/photos/route.ts` | POST upload (delegates to adapter) |
| `src/app/api/photos/[handle]/route.ts` | GET/DELETE per handle |
| `src/app/api/entries/route.ts` | POST/PUT entries; accepts e2eeIVs |
| `src/app/api/entries/[id]/route.ts` | Single-entry update |
| `src/app/api/entries/backfill-batch/route.ts` | GET plaintext batch |
| `src/app/api/scrapbooks/route.ts` | POST/PUT scrapbooks; accepts e2eeIVs |
| `src/app/api/scrapbooks/backfill-batch/route.ts` | GET plaintext batch for scrapbooks |
| `src/app/api/e2ee/setup/route.ts` | Initial wrapped-key write (existing) |
| `src/app/api/e2ee/keys/route.ts` | Read wrapped keys (existing) |
| `src/app/api/e2ee/update-daily-key/route.ts` | Replace daily-key blob (existing) |
| `src/app/api/e2ee/update-recovery-key/route.ts` | Replace recovery-key blob (new) |
| `src/app/me/page.tsx` | Profile page with E2EE controls |
| `src/app/security/page.tsx` | User-facing privacy doc |
