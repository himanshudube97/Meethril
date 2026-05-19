# Stranger Notes v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Hearth's one-shot stranger-note mechanic into an open-ended slow pen-pal exchange with mutual wave-back, post-wave E2EE, OpenAI moderation, and a consolidated maintenance cron — without breaking existing data.

**Architecture:** Replace v1's `StrangerNote` + `StrangerReply` (single note, single 20-word reply) with `StrangerThread` + `StrangerMessage` + `StrangerWave` + `StrangerBlock`. Pre-wave messages stay Tier-2 server-encrypted (so OpenAI moderation can run pre-encrypt). Post-mutual-wave, the server generates a `pendingKeyExchange` flag, and the next client to poll performs an NaCl-box thread-key exchange under each user's Curve25519 keypair (lazily generated at first wave). Matching is synchronous in the send route (v1 pattern); one cron consolidates retry + wave-window close + cleanup. v1 schema stays in place per the additive-only project rule, with a one-shot backfill seeding v2 tables from existing data.

**Tech Stack:**
- Next.js 16 App Router (existing) — API routes under `src/app/api/stranger-notes/`
- Prisma + Postgres (existing) — additive schema migration
- React 19 + Framer Motion (existing) — `src/components/letters/lights/*`
- Server Tier-2 encryption via `src/lib/encryption.ts` `encrypt()` / `decrypt()` (existing AES-256-GCM under `ENCRYPTION_KEY`)
- Client E2EE via `src/lib/e2ee/crypto.ts` master-key primitives (existing — `encryptString` / `decryptString`)
- **New dep:** `tweetnacl` for Curve25519 / NaCl box key exchange
- OpenAI Moderation: direct fetch to `https://api.openai.com/v1/moderations` (`omni-moderation-latest`) — no SDK added
- Docker-first dev: every restart / verify step assumes `docker compose` is up

**Spec:** [`docs/superpowers/specs/2026-05-19-stranger-notes-v2-design.md`](../specs/2026-05-19-stranger-notes-v2-design.md)

**Out of scope (Phase 2):** Web Push, implicit-report threshold, identity reveal beyond display names, location-based matching, email digests.

**No unit tests by default.** Per project convention (see `feedback_skip_tests.md`), verification is manual in the dev Docker stack. Where a behavior is hard to verify by clicking, the task includes a curl/SQL command instead.

---

## File map

**New:**

- `src/lib/stranger-names.ts` — deterministic per-thread display name generator
- `src/lib/helplines.ts` — regional crisis-line lookup
- `src/lib/moderation.ts` — OpenAI omni-moderation wrapper
- `src/lib/stranger-e2ee.ts` — Curve25519 keypair lifecycle + thread-key wrap/unwrap helpers (client-only browser-safe module)
- `src/app/api/stranger-notes/inbox/route.ts` — replaces v1 inbox route
- `src/app/api/stranger-notes/threads/[id]/route.ts` — thread detail (GET) + pen-pal end (DELETE)
- `src/app/api/stranger-notes/threads/[id]/messages/route.ts` — mid-thread reply
- `src/app/api/stranger-notes/threads/[id]/skip/route.ts`
- `src/app/api/stranger-notes/threads/[id]/block/route.ts`
- `src/app/api/stranger-notes/threads/[id]/wave/route.ts`
- `src/app/api/stranger-notes/threads/[id]/wave-offered/route.ts`
- `src/app/api/stranger-notes/threads/[id]/keys/route.ts`
- `src/app/api/stranger-notes/keys/init/route.ts`
- `src/app/api/stranger-notes/users/[id]/public-key/route.ts`
- `src/app/api/cron/stranger-threads/route.ts` — consolidated cron
- `src/components/letters/lights/ThreadView.tsx`
- `src/components/letters/lights/WavePrompt.tsx`
- `src/components/letters/lights/PenPalShelf.tsx`
- `prisma/backfill-stranger-notes-v2.ts` — one-shot data backfill

**Modify:**

- `prisma/schema.prisma` — additive (new models + 3 new User columns)
- `src/lib/stranger-notes.ts` — rewrite (validation + 2/day count check; drop v1 helpers)
- `src/lib/stranger-matcher.ts` — rewrite (block-aware eligibility + sync match)
- `src/app/api/stranger-notes/route.ts` — rewrite to use new schema
- `src/hooks/useStrangerNotes.ts` — rewrite for threads + focus-event refresh + thread-key decryption
- `src/components/letters/lights/LightsView.tsx` — reshape for shelves + threads
- `src/components/letters/lights/Mailbox.tsx` — three shelves
- `src/components/letters/lights/ComposePaper.tsx` — country picker
- `package.json` — add `tweetnacl`, `@types/tweetnacl` if available

**Delete:**

- `src/components/letters/lights/ReadPaper.tsx` (replaced by `ThreadView.tsx`)
- `src/components/letters/lights/ReplyCard.tsx` (folded into `ThreadView.tsx`)
- `src/app/api/stranger-notes/[id]/burn/route.ts` (replaced by skip/block)
- `src/app/api/stranger-notes/[id]/read/route.ts` (replaced by inbox `senderLastViewedAt` / `recipientLastViewedAt` math)
- `src/app/api/stranger-notes/[id]/reply/route.ts` (replaced by `/threads/[id]/messages`)
- `src/app/api/stranger-notes/replies/[id]/burn/route.ts`
- `src/app/api/cron/expire-stranger-notes/route.ts` (replaced by `/api/cron/stranger-threads`)

---

## Task 1: Schema additions + Prisma migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models + User fields**

Append the new models to `prisma/schema.prisma` (do NOT delete the existing `StrangerNote` or `StrangerReply` models — they stay during transition):

```prisma
model StrangerThread {
  id              String   @id @default(cuid())

  senderId        String
  sender          User     @relation("SentStrangerThreads", fields: [senderId], references: [id], onDelete: Cascade)
  recipientId     String?
  recipient       User?    @relation("ReceivedStrangerThreads", fields: [recipientId], references: [id], onDelete: Cascade)

  // unmatched | active | pen_pal | closed_unwaved
  status          String   @default("unmatched")

  senderDisplayName    String
  recipientDisplayName String?

  createdAt       DateTime  @default(now())
  matchedAt       DateTime?
  lastActivityAt  DateTime  @default(now())
  closedAt        DateTime?

  senderWaveOfferedAt    DateTime?
  recipientWaveOfferedAt DateTime?

  pendingKeyExchange     Boolean  @default(false)
  wrappedKeyForSender    String?
  wrappedKeyForRecipient String?

  senderDismissedAt      DateTime?
  recipientDismissedAt   DateTime?

  senderLastViewedAt     DateTime?
  recipientLastViewedAt  DateTime?

  messages       StrangerMessage[]
  waves          StrangerWave[]

  @@index([senderId, status])
  @@index([recipientId, status])
  @@index([status, lastActivityAt])
  @@map("stranger_threads")
}

model StrangerMessage {
  id           String   @id @default(cuid())

  threadId     String
  thread       StrangerThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  senderId     String
  sender       User     @relation("StrangerMessagesSent", fields: [senderId], references: [id], onDelete: Cascade)

  content        String   @db.Text
  encryptionTier String   @default("server")

  countryCode  String?
  stateName    String?

  createdAt    DateTime  @default(now())

  @@index([threadId, createdAt])
  @@map("stranger_messages")
}

model StrangerWave {
  id           String   @id @default(cuid())

  threadId     String
  thread       StrangerThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  userId       String
  user         User     @relation("StrangerWaves", fields: [userId], references: [id], onDelete: Cascade)

  createdAt    DateTime  @default(now())

  @@unique([threadId, userId])
  @@map("stranger_waves")
}

model StrangerBlock {
  id           String   @id @default(cuid())

  blockerId    String
  blocker      User     @relation("StrangerBlocksInitiated", fields: [blockerId], references: [id], onDelete: Cascade)

  blockedId    String
  blocked      User     @relation("StrangerBlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)

  createdAt    DateTime  @default(now())

  @@unique([blockerId, blockedId])
  @@index([blockedId])
  @@map("stranger_blocks")
}
```

In the `User` model, add the new fields (alongside the existing `strangerNotesSent`, `strangerNotesReceived`, `lastStrangerNoteSentAt`):

```prisma
  // Stranger Notes v2 — E2EE keypair + suspension flag.
  strangerPublicKey             String?
  strangerWrappedPrivateKey     String?
  strangerNotesSendingSuspended Boolean @default(false)

  // Relations for the new tables
  sentStrangerThreads      StrangerThread[]  @relation("SentStrangerThreads")
  receivedStrangerThreads  StrangerThread[]  @relation("ReceivedStrangerThreads")
  strangerMessagesSent     StrangerMessage[] @relation("StrangerMessagesSent")
  strangerWaves            StrangerWave[]    @relation("StrangerWaves")
  strangerBlocksInitiated  StrangerBlock[]   @relation("StrangerBlocksInitiated")
  strangerBlocksReceived   StrangerBlock[]   @relation("StrangerBlocksReceived")
```

- [ ] **Step 2: Generate and apply the migration**

```bash
docker compose exec app npx prisma migrate dev --name stranger_notes_v2_additive
```

Expected: Prisma generates a migration file under `prisma/migrations/<timestamp>_stranger_notes_v2_additive/migration.sql` containing `CREATE TABLE` statements for the four new tables plus `ALTER TABLE users ADD COLUMN` for the three new columns. No data-loss warnings. Migration applies cleanly.

If you see any "data loss" prompt, abort. The change must be purely additive per CLAUDE.md rules.

- [ ] **Step 3: Verify schema in Postgres**

```bash
docker compose exec app npx prisma studio
```

Open at `http://localhost:5555`. Confirm `stranger_threads`, `stranger_messages`, `stranger_waves`, `stranger_blocks` exist and are empty. Confirm `users` table has the three new columns.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(stranger-notes): additive schema for v2 (threads, messages, waves, blocks)"
```

---

## Task 2: Display-name generator + helpline lookup

**Files:**
- Create: `src/lib/stranger-names.ts`
- Create: `src/lib/helplines.ts`

- [ ] **Step 1: Write the name generator**

Create `src/lib/stranger-names.ts`:

```typescript
// Per-thread display name generator. Adjective + noun, ~50 of each.
// Stable for a given (threadId, userId) input — uses a small FNV-1a hash so we don't
// need any randomness at call sites. Different threadIds map to different names so
// the same physical user gets a different name in each thread (cross-thread identity
// is intentionally broken).

const ADJECTIVES = [
  'Gentle', 'Quiet', 'Velvet', 'Morning', 'Slow', 'Warm', 'Hushed', 'Sleepy',
  'Drifting', 'Soft', 'Patient', 'Glimmering', 'Cozy', 'Wandering', 'Mellow',
  'Dappled', 'Misty', 'Tender', 'Steady', 'Curious', 'Gracious', 'Honeyed',
  'Glowing', 'Brave', 'Earnest', 'Hopeful', 'Kindly', 'Lucid', 'Modest',
  'Nimble', 'Open', 'Plucky', 'Radiant', 'Serene', 'Tranquil', 'Upright',
  'Vivid', 'Whispering', 'Pale', 'Rosy', 'Amber', 'Cobalt', 'Bramble',
  'Lantern', 'Linden', 'Maple', 'Walnut', 'Willow', 'Cedar', 'Birch',
]

const NOUNS = [
  'Heron', 'Pine', 'Moth', 'Lake', 'River', 'Lantern', 'Sparrow', 'Owl',
  'Wren', 'Thrush', 'Fox', 'Hare', 'Deer', 'Otter', 'Bear', 'Wolf',
  'Brook', 'Meadow', 'Pebble', 'Acorn', 'Feather', 'Petal', 'Fern',
  'Ivy', 'Cloud', 'Star', 'Comet', 'Moon', 'Dawn', 'Dusk', 'Tide',
  'Harbor', 'Cove', 'Pasture', 'Hearth', 'Candle', 'Ember', 'Stone',
  'Pearl', 'Coral', 'Reed', 'Sage', 'Thistle', 'Clover', 'Lichen',
  'Glade', 'Hollow', 'Knoll', 'Vale', 'Cairn',
]

function fnv1a(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function generateDisplayName(seed: string): string {
  const a = fnv1a(seed + ':adj')
  const n = fnv1a(seed + ':noun')
  return `${ADJECTIVES[a % ADJECTIVES.length]} ${NOUNS[n % NOUNS.length]}`
}
```

- [ ] **Step 2: Write the helpline lookup**

Create `src/lib/helplines.ts`:

```typescript
// Regional crisis-line lookup. India (iCall) is the launch default.
// To add a locale: add an entry keyed by ISO country code, then surface it from the
// self-harm interstitial UX based on the user's locale or their last-known postmark.

export interface Helpline {
  name: string
  phone: string
  hours: string
  url?: string
}

const HELPLINES: Record<string, Helpline> = {
  IN: {
    name: 'iCall (India)',
    phone: '9152987821',
    hours: 'Mon–Sat, 8 AM – 10 PM',
    url: 'https://icallhelpline.org',
  },
  // Add US, UK, etc. as needed
}

export function helplineForCountry(countryCode: string | null | undefined): Helpline {
  if (countryCode && HELPLINES[countryCode.toUpperCase()]) {
    return HELPLINES[countryCode.toUpperCase()]
  }
  return HELPLINES.IN
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/stranger-names.ts src/lib/helplines.ts
git commit -m "feat(stranger-notes): display-name generator + helpline lookup"
```

---

## Task 3: OpenAI moderation wrapper

**Files:**
- Create: `src/lib/moderation.ts`

- [ ] **Step 1: Add `OPENAI_API_KEY` env support**

Confirm `.env.example` has a row for `OPENAI_API_KEY`. If not, add:

```
# Used for stranger-note moderation (omni-moderation-latest). Optional in dev — if unset, moderation is skipped.
OPENAI_API_KEY=
```

- [ ] **Step 2: Write the moderation wrapper**

Create `src/lib/moderation.ts`:

```typescript
// Thin wrapper around OpenAI's omni-moderation endpoint. Free, ~200ms.
// Direct fetch (no SDK) to keep deps lean.
// If OPENAI_API_KEY is not set (typical for local dev), moderation no-ops so devs
// can still hit the flow without an API key.

export interface ModerationResult {
  rejected: boolean
  reason?: ModerationCategory
  selfHarm: boolean
}

export type ModerationCategory =
  | 'hate'
  | 'hate/threatening'
  | 'harassment/threatening'
  | 'sexual/minors'
  | 'violence/graphic'
  | 'illicit'

const HARD_REJECT: ModerationCategory[] = [
  'hate',
  'hate/threatening',
  'harassment/threatening',
  'sexual/minors',
  'violence/graphic',
  'illicit',
]

export async function moderateText(text: string): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Dev fallback: skip moderation. Log a one-time warning so this is visible.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[moderation] OPENAI_API_KEY not set — skipping moderation (dev only)')
    }
    return { rejected: false, selfHarm: false }
  }

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    })
    if (!res.ok) {
      // On API failure, fail open with a log. We do not want to block all sends
      // because OpenAI had a hiccup. Self-harm/violence content slipping through is
      // a known risk of fail-open; revisit if outages become frequent.
      console.error('[moderation] OpenAI returned non-OK:', res.status)
      return { rejected: false, selfHarm: false }
    }
    const data = (await res.json()) as {
      results: Array<{ categories: Record<string, boolean>; flagged: boolean }>
    }
    const result = data.results?.[0]
    if (!result) return { rejected: false, selfHarm: false }

    for (const cat of HARD_REJECT) {
      if (result.categories[cat]) {
        return { rejected: true, reason: cat, selfHarm: false }
      }
    }
    const selfHarm =
      Boolean(result.categories['self-harm']) ||
      Boolean(result.categories['self-harm/intent']) ||
      Boolean(result.categories['self-harm/instructions'])
    return { rejected: false, selfHarm }
  } catch (err) {
    console.error('[moderation] fetch failed:', err)
    return { rejected: false, selfHarm: false }
  }
}
```

- [ ] **Step 3: Verify the module compiles**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add .env.example src/lib/moderation.ts
git commit -m "feat(stranger-notes): OpenAI omni-moderation wrapper"
```

---

## Task 4: Rewrite stranger-notes library + matcher

**Files:**
- Modify: `src/lib/stranger-notes.ts`
- Modify: `src/lib/stranger-matcher.ts`

- [ ] **Step 1: Rewrite `src/lib/stranger-notes.ts`**

Replace the entire file:

```typescript
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

// Per-message body length cap. Same on cold opens and replies, both sides.
export const MIN_MESSAGE_CHARS = 10
export const MAX_MESSAGE_CHARS = 200

// New cold-open notes per user per local-calendar-day.
export const DAILY_NEW_NOTE_LIMIT = 2

// Lifetimes (cleanup cron enforces).
export const UNMATCHED_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const ACTIVE_SILENCE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
export const UNWAVED_VANISH_LIFETIME_MS = 24 * 60 * 60 * 1000
export const WAVE_DECISION_WINDOW_MS = 24 * 60 * 60 * 1000

// Number of messages each side must send before wave is eligible.
export const WAVE_ELIGIBLE_PER_SIDE = 3

export type MessageValidationError = 'empty' | 'too_short' | 'too_long'

export function validateMessageContent(
  raw: string
): { ok: true; trimmed: string } | { ok: false; error: MessageValidationError } {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length === 0) return { ok: false, error: 'empty' }
  if (trimmed.length < MIN_MESSAGE_CHARS) return { ok: false, error: 'too_short' }
  if (trimmed.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'too_long' }
  return { ok: true, trimmed }
}

export function encryptServerTier(plaintext: string): string {
  return encrypt(plaintext)
}

export function decryptServerTier(ciphertext: string): string {
  return decrypt(ciphertext)
}

export function safeIanaTz(raw: string | null | undefined): string {
  const candidate = raw && raw.length > 0 ? raw : 'UTC'
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate })
    return candidate
  } catch {
    return 'UTC'
  }
}

/**
 * Returns the count of cold-open notes (status='unmatched' OR matchedAt within today)
 * the user has sent today in their local timezone. Used to enforce DAILY_NEW_NOTE_LIMIT.
 *
 * Important: we count rows in stranger_threads with senderId=X and createdAt's local
 * date == today's local date. This replaces v1's single-row `lastStrangerNoteSentAt`
 * claim which only supported a 1/day limit.
 */
export async function countTodaysNewNotes(userId: string, tz: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*) AS c FROM stranger_threads
    WHERE "senderId" = ${userId}
      AND date_trunc('day', "createdAt" AT TIME ZONE ${tz})
          = date_trunc('day', now() AT TIME ZONE ${tz})
  `
  return Number(rows[0]?.c ?? 0)
}

/**
 * Cold-start engagement gate: a user must have written at least one journal entry
 * before they can send a stranger note.
 */
export async function hasWrittenJournalEntry(userId: string): Promise<boolean> {
  const count = await prisma.journalEntry.count({
    where: { userId },
  })
  return count > 0
}
```

- [ ] **Step 2: Rewrite `src/lib/stranger-matcher.ts`**

Replace the entire file:

```typescript
import { prisma } from '@/lib/db'

/**
 * Try to find an eligible random recipient for a stranger note from `senderId`.
 * Eligibility:
 *   - id <> senderId
 *   - strangerNotesSendingSuspended = false
 *   - no symmetric block: neither (blockerId=sender, blockedId=candidate)
 *     nor (blockerId=candidate, blockedId=sender) exists in stranger_blocks.
 *
 * Single SQL roundtrip with ORDER BY random(). Acceptable up to ~100k users; revisit if scale grows.
 */
export async function pickRandomRecipient(senderId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT u.id FROM users u
    WHERE u.id <> ${senderId}
      AND COALESCE(u."strangerNotesSendingSuspended", false) = false
      AND NOT EXISTS (
        SELECT 1 FROM stranger_blocks sb
        WHERE (sb."blockerId" = ${senderId} AND sb."blockedId" = u.id)
           OR (sb."blockerId" = u.id        AND sb."blockedId" = ${senderId})
      )
    ORDER BY random()
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

/**
 * Atomically transition a thread from 'unmatched' → 'active', assigning a recipient,
 * stamping matchedAt + recipientDisplayName, and bumping the recipient's counter.
 *
 * Returns true if matched, false if the thread was already non-unmatched.
 */
export async function deliverThreadToRecipient(
  threadId: string,
  recipientId: string,
  recipientDisplayName: string
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    const update = await tx.strangerThread.updateMany({
      where: { id: threadId, status: 'unmatched' },
      data: {
        recipientId,
        recipientDisplayName,
        matchedAt: new Date(),
        status: 'active',
        lastActivityAt: new Date(),
      },
    })
    if (update.count === 0) return false
    await tx.user.update({
      where: { id: recipientId },
      data: { strangerNotesReceived: { increment: 1 } },
    })
    return true
  })
  return result
}
```

- [ ] **Step 3: Verify both compile**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: errors will surface for the existing v1 route `src/app/api/stranger-notes/route.ts` (because we just removed v1 helpers it imports). That's fine — Task 6 rewrites it. Confirm there are no errors in `src/lib/`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stranger-notes.ts src/lib/stranger-matcher.ts
git commit -m "refactor(stranger-notes): library + matcher for v2 schema"
```

---

## Task 5: Backfill v1 data into v2 schema

**Files:**
- Create: `prisma/backfill-stranger-notes-v2.ts`

- [ ] **Step 1: Write the backfill script**

Create `prisma/backfill-stranger-notes-v2.ts`:

```typescript
/**
 * One-shot backfill: v1 (StrangerNote + StrangerReply) → v2 (StrangerThread + StrangerMessage).
 *
 * Mapping:
 *   - Each StrangerNote → StrangerThread + first StrangerMessage
 *     status mapping: 'queued' → 'unmatched'; 'delivered' or 'replied' → 'active'
 *     lastActivityAt = matchedAt ?? createdAt
 *   - Each StrangerReply → second StrangerMessage on the corresponding thread,
 *     and bump lastActivityAt = reply.createdAt
 *   - All backfilled messages have encryptionTier='server' (Tier 2, server-encrypted)
 *
 * Idempotent: re-runs are safe — checks for existing thread.id by source note.id.
 *
 * Run: docker compose exec app npx tsx prisma/backfill-stranger-notes-v2.ts
 */

import { PrismaClient } from '@prisma/client'
import { generateDisplayName } from '../src/lib/stranger-names'

const prisma = new PrismaClient()

async function main() {
  const oldNotes = await prisma.strangerNote.findMany({
    include: { reply: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${oldNotes.length} v1 notes to backfill`)

  let createdThreads = 0
  let createdMessages = 0
  let skipped = 0

  for (const note of oldNotes) {
    // Reuse the old note.id as the new thread.id so the backfill is idempotent.
    const existing = await prisma.strangerThread.findUnique({ where: { id: note.id } })
    if (existing) {
      skipped++
      continue
    }

    const statusMap: Record<string, string> = {
      queued: 'unmatched',
      delivered: 'active',
      replied: 'active',
    }
    const newStatus = statusMap[note.status] ?? 'unmatched'
    const lastActivityAt = note.reply?.createdAt ?? note.matchedAt ?? note.createdAt

    const senderDisplayName = generateDisplayName(`${note.id}:sender`)
    const recipientDisplayName = note.recipientId
      ? generateDisplayName(`${note.id}:recipient`)
      : null

    await prisma.$transaction(async (tx) => {
      await tx.strangerThread.create({
        data: {
          id: note.id,
          senderId: note.senderId,
          recipientId: note.recipientId,
          status: newStatus,
          senderDisplayName,
          recipientDisplayName,
          createdAt: note.createdAt,
          matchedAt: note.matchedAt,
          lastActivityAt,
          senderLastViewedAt: null,
          recipientLastViewedAt: note.readAt,
        },
      })

      // First message: the original note content (server-encrypted, Tier 2)
      await tx.strangerMessage.create({
        data: {
          threadId: note.id,
          senderId: note.senderId,
          content: note.content, // already ciphertext
          encryptionTier: 'server',
          createdAt: note.createdAt,
        },
      })

      // Second message: the reply (if any)
      if (note.reply && note.recipientId) {
        await tx.strangerMessage.create({
          data: {
            threadId: note.id,
            senderId: note.recipientId,
            content: note.reply.content, // already ciphertext
            encryptionTier: 'server',
            createdAt: note.reply.createdAt,
          },
        })
        createdMessages++
      }
    })

    createdThreads++
    createdMessages++
  }

  console.log(`Backfill complete: ${createdThreads} threads, ${createdMessages} messages, ${skipped} skipped (already migrated)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 2: Run the backfill**

```bash
docker compose exec app npx tsx prisma/backfill-stranger-notes-v2.ts
```

Expected: prints `Found N v1 notes to backfill` then `Backfill complete: N threads, M messages, 0 skipped`. If N is 0 (no v1 data), still succeeds.

- [ ] **Step 3: Spot-check via Prisma Studio**

```bash
docker compose exec app npx prisma studio
```

Open `stranger_threads` — confirm rows exist mirroring v1 notes. Open `stranger_messages` — confirm each thread has 1-2 messages with `encryptionTier='server'`.

If v1 had no data (fresh dev environment), this is a no-op and that's expected.

- [ ] **Step 4: Re-run to verify idempotency**

```bash
docker compose exec app npx tsx prisma/backfill-stranger-notes-v2.ts
```

Expected: same row count, but log line now reads `0 threads, 0 messages, N skipped`.

- [ ] **Step 5: Commit**

```bash
git add prisma/backfill-stranger-notes-v2.ts
git commit -m "feat(stranger-notes): one-shot backfill v1 → v2 schema"
```

---

## Task 6: Rewrite `POST /api/stranger-notes` (cold-open send)

**Files:**
- Modify: `src/app/api/stranger-notes/route.ts`

- [ ] **Step 1: Rewrite the route**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  validateMessageContent,
  encryptServerTier,
  countTodaysNewNotes,
  hasWrittenJournalEntry,
  DAILY_NEW_NOTE_LIMIT,
} from '@/lib/stranger-notes'
import { pickRandomRecipient, deliverThreadToRecipient } from '@/lib/stranger-matcher'
import { generateDisplayName } from '@/lib/stranger-names'
import { moderateText } from '@/lib/moderation'
import { safeIanaTz } from '@/lib/stranger-notes'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { content?: unknown; country?: unknown; state?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
  }
  const validation = validateMessageContent(body.content)
  if (!validation.ok) {
    const map = {
      empty: 'Write something first.',
      too_short: 'A little longer — at least 10 characters.',
      too_long: 'A little shorter — at most 200 characters.',
    } as const
    return NextResponse.json({ error: map[validation.error] }, { status: 400 })
  }
  const country = typeof body.country === 'string' && body.country.length > 0 ? body.country : null
  const stateName = typeof body.state === 'string' && body.state.length > 0 ? body.state : null

  // Cold-start gate
  const hasEntry = await hasWrittenJournalEntry(user.id)
  if (!hasEntry) {
    return NextResponse.json(
      { error: 'Write something for yourself first before reaching out to a stranger.' },
      { status: 403 }
    )
  }

  // Daily limit
  const tz = safeIanaTz(req.headers.get('X-User-TZ'))
  const todaysCount = await countTodaysNewNotes(user.id, tz)
  if (todaysCount >= DAILY_NEW_NOTE_LIMIT) {
    return NextResponse.json(
      { error: 'Your lights are on their way. Come back tomorrow.' },
      { status: 429 }
    )
  }

  // Moderation
  const moderation = await moderateText(validation.trimmed)
  if (moderation.rejected) {
    return NextResponse.json(
      { error: 'This note can\'t be sent. Try writing it with more warmth.' },
      { status: 400 }
    )
  }
  // selfHarm is not a rejection; the client interstitial handles it pre-submit.

  const ciphertext = encryptServerTier(validation.trimmed)

  // Create thread + first message + bump sender counter atomically.
  const senderDisplayName = generateDisplayName(`${user.id}:${Date.now()}:sender`)
  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.strangerThread.create({
      data: {
        senderId: user.id,
        status: 'unmatched',
        senderDisplayName,
        messages: {
          create: {
            senderId: user.id,
            content: ciphertext,
            encryptionTier: 'server',
            countryCode: country,
            stateName,
          },
        },
      },
    })
    await tx.user.update({
      where: { id: user.id },
      data: {
        strangerNotesSent: { increment: 1 },
        lastStrangerNoteSentAt: new Date(),
      },
    })
    return created
  })

  // Synchronous match attempt. If no eligible recipient, thread stays 'unmatched'
  // and the cron retries.
  const recipientId = await pickRandomRecipient(user.id)
  if (recipientId) {
    const recipientDisplayName = generateDisplayName(`${thread.id}:recipient`)
    await deliverThreadToRecipient(thread.id, recipientId, recipientDisplayName)
  }

  // Refetch to return the final status
  const finalThread = await prisma.strangerThread.findUnique({
    where: { id: thread.id },
    select: { id: true, status: true },
  })

  return NextResponse.json({ id: thread.id, status: finalThread?.status ?? 'unmatched' }, { status: 201 })
}
```

- [ ] **Step 2: Restart Docker and verify compile**

```bash
docker compose restart app
docker compose logs -f app --tail=50
```

Expected: app starts cleanly. If TypeScript errors surface from `src/app/api/stranger-notes/[id]/burn/route.ts` and similar v1-only files, that's fine — those routes are removed in Task 8. For now, comment out their bodies if they block startup (`export async function POST() { return new Response('gone', { status: 410 }) }`) or just leave the build broken until the next tasks resolve it.

- [ ] **Step 3: Manual smoke test with curl**

In the dev container, exec into a shell and use the dev-auth cookie:

```bash
# Get a dev auth token first if needed — see src/lib/auth/dev-auth.ts.
# Then:
curl -X POST http://localhost:3111/api/stranger-notes \
  -H "Content-Type: application/json" \
  -H "Cookie: hearth-auth-token=<token>" \
  -H "X-User-TZ: Asia/Kolkata" \
  -d '{"content": "Hello stranger, hope your day has some light in it.", "country": "IN"}'
```

Expected: `{"id":"<cuid>","status":"unmatched"}` (or `"active"` if another dev user exists to match).

Check in Prisma Studio that the thread + message row appears.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stranger-notes/route.ts
git commit -m "feat(stranger-notes): rewrite send route for v2 schema + moderation + daily limit"
```

---

## Task 7: Inbox API (`GET /api/stranger-notes/inbox`)

**Files:**
- Modify (rewrite): `src/app/api/stranger-notes/inbox/route.ts`

- [ ] **Step 1: Replace the inbox route**

Replace the entire file with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { decryptServerTier, WAVE_ELIGIBLE_PER_SIDE } from '@/lib/stranger-notes'

interface InboxMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  // For server tier: decrypted plaintext. For thread tier: ciphertext (client decrypts).
  body: string
  countryCode: string | null
  stateName: string | null
  createdAt: string
}

interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull every thread this user is in (sender OR recipient), excluding dismissed.
  const rows = await prisma.strangerThread.findMany({
    where: {
      OR: [
        { senderId: user.id, senderDismissedAt: null },
        { recipientId: user.id, recipientDismissedAt: null },
      ],
      status: { in: ['unmatched', 'active', 'pen_pal'] },
    },
    orderBy: { lastActivityAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      waves: { where: { userId: user.id }, take: 1 },
      _count: { select: { messages: true, waves: true } },
    },
  })

  const userMessageCounts = await prisma.strangerMessage.groupBy({
    by: ['threadId', 'senderId'],
    where: { threadId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  })

  // Build per-thread (senderCount, recipientCount) for wave eligibility
  const countsByThread = new Map<string, { sender: number; recipient: number }>()
  for (const row of userMessageCounts) {
    const t = countsByThread.get(row.threadId) ?? { sender: 0, recipient: 0 }
    const parent = rows.find((r) => r.id === row.threadId)
    if (!parent) continue
    if (row.senderId === parent.senderId) t.sender = row._count._all
    if (row.senderId === parent.recipientId) t.recipient = row._count._all
    countsByThread.set(row.threadId, t)
  }

  const outgoing: InboxThread[] = []
  const active: InboxThread[] = []
  const penpals: InboxThread[] = []

  for (const t of rows) {
    const isSender = t.senderId === user.id
    const partnerDisplayName = isSender
      ? (t.recipientDisplayName ?? 'A wandering light')
      : t.senderDisplayName
    const myDisplayName = isSender ? t.senderDisplayName : (t.recipientDisplayName ?? '—')
    const lastViewedAt = isSender ? t.senderLastViewedAt : t.recipientLastViewedAt
    const unreadCount = await prisma.strangerMessage.count({
      where: {
        threadId: t.id,
        senderId: { not: user.id },
        createdAt: lastViewedAt ? { gt: lastViewedAt } : undefined,
      },
    })

    const c = countsByThread.get(t.id) ?? { sender: 0, recipient: 0 }
    const waveEligible =
      t.status === 'active' &&
      c.sender >= WAVE_ELIGIBLE_PER_SIDE &&
      c.recipient >= WAVE_ELIGIBLE_PER_SIDE
    const waveOfferedToMe = Boolean(isSender ? t.senderWaveOfferedAt : t.recipientWaveOfferedAt)
    const myWaveCast = t.waves.length > 0

    const myWrappedKey = isSender ? t.wrappedKeyForSender : t.wrappedKeyForRecipient

    const lastMsg = t.messages[0] ?? null
    const preview = lastMsg
      ? {
          isMine: lastMsg.senderId === user.id,
          encryptionTier: (lastMsg.encryptionTier as 'server' | 'thread') ?? 'server',
          body:
            lastMsg.encryptionTier === 'thread'
              ? lastMsg.content // ciphertext — client decrypts
              : decryptServerTier(lastMsg.content).slice(0, 80),
        }
      : null

    const inboxThread: InboxThread = {
      id: t.id,
      status: t.status as InboxThread['status'],
      partnerDisplayName,
      myDisplayName,
      lastActivityAt: t.lastActivityAt.toISOString(),
      unreadCount,
      waveEligible,
      waveOfferedToMe,
      myWaveCast,
      pendingKeyExchange: t.pendingKeyExchange,
      myWrappedKey,
      preview,
    }

    if (t.status === 'unmatched' && isSender) outgoing.push(inboxThread)
    else if (t.status === 'pen_pal') penpals.push(inboxThread)
    else active.push(inboxThread)
  }

  return NextResponse.json({
    outgoing,
    active,
    penpals,
    counters: {
      sent: rows.filter((r) => r.senderId === user.id).length,
      received: rows.filter((r) => r.recipientId === user.id).length,
    },
  })
}
```

- [ ] **Step 2: Restart and smoke test**

```bash
docker compose restart app
curl -H "Cookie: hearth-auth-token=<token>" http://localhost:3111/api/stranger-notes/inbox
```

Expected: JSON with `outgoing`, `active`, `penpals` arrays. The thread you sent in Task 6 should appear in `outgoing` (if unmatched) or in another user's `active` (if matched).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stranger-notes/inbox/route.ts
git commit -m "feat(stranger-notes): inbox API returns threads grouped by shelf"
```

---

## Task 8: Thread detail + mid-thread reply + retire v1 routes

**Files:**
- Create: `src/app/api/stranger-notes/threads/[id]/route.ts`
- Create: `src/app/api/stranger-notes/threads/[id]/messages/route.ts`
- Delete: `src/app/api/stranger-notes/[id]/burn/route.ts`
- Delete: `src/app/api/stranger-notes/[id]/read/route.ts`
- Delete: `src/app/api/stranger-notes/[id]/reply/route.ts`
- Delete: `src/app/api/stranger-notes/replies/[id]/burn/route.ts`

- [ ] **Step 1: Create the thread detail route**

Create `src/app/api/stranger-notes/threads/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { decryptServerTier, WAVE_ELIGIBLE_PER_SIDE } from '@/lib/stranger-notes'

interface ThreadMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  body: string
  countryCode: string | null
  stateName: string | null
  createdAt: string
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
      waves: true,
    },
  })

  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isSender = thread.senderId === user.id
  const partnerDisplayName = isSender
    ? thread.recipientDisplayName ?? 'A wandering light'
    : thread.senderDisplayName
  const myDisplayName = isSender ? thread.senderDisplayName : thread.recipientDisplayName ?? '—'

  const senderMessageCount = thread.messages.filter((m) => m.senderId === thread.senderId).length
  const recipientMessageCount = thread.messages.filter((m) => m.senderId === thread.recipientId).length

  const waveEligible =
    thread.status === 'active' &&
    senderMessageCount >= WAVE_ELIGIBLE_PER_SIDE &&
    recipientMessageCount >= WAVE_ELIGIBLE_PER_SIDE
  const myWaveCast = thread.waves.some((w) => w.userId === user.id)
  const waveOfferedToMe = Boolean(isSender ? thread.senderWaveOfferedAt : thread.recipientWaveOfferedAt)

  const myWrappedKey = isSender ? thread.wrappedKeyForSender : thread.wrappedKeyForRecipient

  // Update lastViewedAt for this user (server-side; never exposed to partner).
  await prisma.strangerThread.update({
    where: { id },
    data: isSender
      ? { senderLastViewedAt: new Date() }
      : { recipientLastViewedAt: new Date() },
  })

  const messages: ThreadMessage[] = thread.messages.map((m) => ({
    id: m.id,
    isMine: m.senderId === user.id,
    encryptionTier: (m.encryptionTier as 'server' | 'thread') ?? 'server',
    body:
      m.encryptionTier === 'thread'
        ? m.content // ciphertext — client decrypts
        : decryptServerTier(m.content),
    countryCode: m.countryCode,
    stateName: m.stateName,
    createdAt: m.createdAt.toISOString(),
  }))

  return NextResponse.json({
    id: thread.id,
    status: thread.status,
    partnerDisplayName,
    myDisplayName,
    waveEligible,
    waveOfferedToMe,
    myWaveCast,
    pendingKeyExchange: thread.pendingKeyExchange,
    myWrappedKey,
    partnerWrappedKey: null, // never exposed
    messages,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Pen-pal end: hard-delete the thread (cascade deletes messages, waves).
  // Only valid if thread is pen_pal and user is a participant.
  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (thread.status !== 'pen_pal') {
    return NextResponse.json({ error: 'Only pen-pal threads can be ended this way' }, { status: 400 })
  }

  await prisma.strangerThread.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create the mid-thread reply route**

Create `src/app/api/stranger-notes/threads/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import {
  validateMessageContent,
  encryptServerTier,
} from '@/lib/stranger-notes'
import { moderateText } from '@/lib/moderation'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: {
    content?: unknown
    country?: unknown
    state?: unknown
    encryptionTier?: unknown
    ciphertext?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (thread.status === 'closed_unwaved' || thread.status === 'unmatched') {
    return NextResponse.json({ error: 'This thread is not open for replies.' }, { status: 400 })
  }

  const country = typeof body.country === 'string' && body.country.length > 0 ? body.country : null
  const stateName = typeof body.state === 'string' && body.state.length > 0 ? body.state : null

  const tier = body.encryptionTier === 'thread' ? 'thread' : 'server'

  let storedContent: string

  if (tier === 'server') {
    if (typeof body.content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 })
    }
    const validation = validateMessageContent(body.content)
    if (!validation.ok) {
      const map = {
        empty: 'Write something first.',
        too_short: 'A little longer — at least 10 characters.',
        too_long: 'A little shorter — at most 200 characters.',
      } as const
      return NextResponse.json({ error: map[validation.error] }, { status: 400 })
    }
    const moderation = await moderateText(validation.trimmed)
    if (moderation.rejected) {
      return NextResponse.json(
        { error: 'This note can\'t be sent. Try writing it with more warmth.' },
        { status: 400 }
      )
    }
    storedContent = encryptServerTier(validation.trimmed)
  } else {
    // Thread-tier: client has already encrypted under the thread key.
    if (typeof body.ciphertext !== 'string' || body.ciphertext.length < 4) {
      return NextResponse.json({ error: 'ciphertext required for thread tier' }, { status: 400 })
    }
    if (thread.status !== 'pen_pal') {
      return NextResponse.json({ error: 'Thread tier only valid for pen-pal threads' }, { status: 400 })
    }
    const myWrappedKey =
      thread.senderId === user.id ? thread.wrappedKeyForSender : thread.wrappedKeyForRecipient
    if (!myWrappedKey) {
      return NextResponse.json({ error: 'Key exchange not complete' }, { status: 400 })
    }
    storedContent = body.ciphertext
  }

  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.strangerMessage.create({
      data: {
        threadId: id,
        senderId: user.id,
        content: storedContent,
        encryptionTier: tier,
        countryCode: country,
        stateName,
      },
    })
    await tx.strangerThread.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    })
    return m
  })

  return NextResponse.json({ messageId: message.id }, { status: 201 })
}
```

- [ ] **Step 3: Delete v1 routes**

```bash
rm -rf src/app/api/stranger-notes/\[id\] src/app/api/stranger-notes/replies
```

- [ ] **Step 4: Restart Docker and verify typecheck**

```bash
docker compose restart app
docker compose exec app npx tsc --noEmit
```

Expected: no errors (v1 routes are gone, so their imports of removed helpers no longer matter). If `src/hooks/useStrangerNotes.ts` reports errors, that's expected — Task 14 rewrites it.

- [ ] **Step 5: Smoke test the new routes**

```bash
# Replace THREADID with one from your inbox
curl -H "Cookie: hearth-auth-token=<token>" http://localhost:3111/api/stranger-notes/threads/THREADID

curl -X POST http://localhost:3111/api/stranger-notes/threads/THREADID/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: hearth-auth-token=<token>" \
  -d '{"content": "Sending a small light back to you."}'
```

Expected: GET returns thread with `messages` array; POST returns `{messageId}`.

- [ ] **Step 6: Commit**

```bash
git add -A src/app/api/stranger-notes/
git commit -m "feat(stranger-notes): thread detail + reply routes, retire v1 routes"
```

---

## Task 9: Skip + Block routes

**Files:**
- Create: `src/app/api/stranger-notes/threads/[id]/skip/route.ts`
- Create: `src/app/api/stranger-notes/threads/[id]/block/route.ts`

- [ ] **Step 1: Skip route (per-side UI dismiss)**

Create `src/app/api/stranger-notes/threads/[id]/skip/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Skip = UI dismiss only. Does NOT affect matching. Partner is not notified.
  const isSender = thread.senderId === user.id
  await prisma.strangerThread.update({
    where: { id },
    data: isSender ? { senderDismissedAt: new Date() } : { recipientDismissedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Block route (symmetric, cascade-close)**

Create `src/app/api/stranger-notes/threads/[id]/block/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const partnerId = thread.senderId === user.id ? thread.recipientId : thread.senderId
  if (!partnerId) {
    return NextResponse.json({ error: 'No partner to block on this thread yet' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    // Idempotent: skip if already blocked.
    await tx.strangerBlock.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: partnerId } },
      create: { blockerId: user.id, blockedId: partnerId },
      update: {},
    })

    // Hard-delete THIS thread.
    await tx.strangerThread.delete({ where: { id } })

    // Cascade-close any other threads between these two users (rare but per spec).
    await tx.strangerThread.deleteMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: partnerId },
          { senderId: partnerId, recipientId: user.id },
        ],
      },
    })
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Smoke test**

```bash
# Skip
curl -X POST -H "Cookie: hearth-auth-token=<token>" \
  http://localhost:3111/api/stranger-notes/threads/THREADID/skip

# Verify the thread no longer appears in your inbox (but partner can still see it)
curl -H "Cookie: hearth-auth-token=<token>" http://localhost:3111/api/stranger-notes/inbox

# Block (separate thread)
curl -X POST -H "Cookie: hearth-auth-token=<token>" \
  http://localhost:3111/api/stranger-notes/threads/OTHERTHREADID/block

# Verify the row is gone from stranger_threads
docker compose exec app npx prisma studio
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stranger-notes/threads/
git commit -m "feat(stranger-notes): skip (per-side dismiss) + block (symmetric cascade)"
```

---

## Task 10: Wave APIs (offered + decision)

**Files:**
- Create: `src/app/api/stranger-notes/threads/[id]/wave-offered/route.ts`
- Create: `src/app/api/stranger-notes/threads/[id]/wave/route.ts`

- [ ] **Step 1: `wave-offered` (idempotent prompt confirmation)**

Create `src/app/api/stranger-notes/threads/[id]/wave-offered/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const thread = await prisma.strangerThread.findUnique({ where: { id } })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.senderId !== user.id && thread.recipientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const isSender = thread.senderId === user.id
  const alreadyOffered = isSender ? thread.senderWaveOfferedAt : thread.recipientWaveOfferedAt
  if (alreadyOffered) return NextResponse.json({ success: true, idempotent: true })

  await prisma.strangerThread.update({
    where: { id },
    data: isSender ? { senderWaveOfferedAt: new Date() } : { recipientWaveOfferedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: `wave` (decision + mutual detection)**

Create `src/app/api/stranger-notes/threads/[id]/wave/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Body intentionally empty — the act of POSTing is the Yes. There is no "Not now" endpoint;
  // not waving is just not calling this.
  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.strangerThread.findUnique({
      where: { id },
      include: { waves: true },
    })
    if (!thread) return { status: 404 as const, body: { error: 'Not found' } }
    if (thread.senderId !== user.id && thread.recipientId !== user.id) {
      return { status: 404 as const, body: { error: 'Not found' } }
    }
    if (thread.status !== 'active') {
      return { status: 400 as const, body: { error: 'Wave only valid on active threads' } }
    }

    // Upsert this user's wave row (idempotent).
    await tx.strangerWave.upsert({
      where: { threadId_userId: { threadId: id, userId: user.id } },
      create: { threadId: id, userId: user.id },
      update: {},
    })

    // Re-read wave count
    const waveCount = await tx.strangerWave.count({ where: { threadId: id } })

    if (waveCount >= 2) {
      // Mutual wave: flip to pen_pal + flag key exchange needed.
      await tx.strangerThread.update({
        where: { id },
        data: {
          status: 'pen_pal',
          pendingKeyExchange: true,
          lastActivityAt: new Date(),
        },
      })
      return { status: 200 as const, body: { waveCount, status: 'pen_pal' as const } }
    }

    return { status: 200 as const, body: { waveCount, status: 'active' as const } }
  })

  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 3: Smoke test**

To exercise the wave path, you need a thread between two test users with at least 3 messages each. Easiest path: use Prisma Studio to insert synthetic messages, then:

```bash
# As user A
curl -X POST -H "Cookie: hearth-auth-token=<tokenA>" \
  http://localhost:3111/api/stranger-notes/threads/THREADID/wave-offered

curl -X POST -H "Cookie: hearth-auth-token=<tokenA>" \
  http://localhost:3111/api/stranger-notes/threads/THREADID/wave

# As user B
curl -X POST -H "Cookie: hearth-auth-token=<tokenB>" \
  http://localhost:3111/api/stranger-notes/threads/THREADID/wave-offered

curl -X POST -H "Cookie: hearth-auth-token=<tokenB>" \
  http://localhost:3111/api/stranger-notes/threads/THREADID/wave
# Returns { waveCount: 2, status: 'pen_pal' }
```

Verify in Prisma Studio that the thread's `status='pen_pal'` and `pendingKeyExchange=true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stranger-notes/threads/
git commit -m "feat(stranger-notes): wave-offered + wave APIs with mutual flip to pen-pal"
```

---

## Task 11: Consolidated cron (retry + wave-window-close + cleanup)

**Files:**
- Create: `src/app/api/cron/stranger-threads/route.ts`
- Delete: `src/app/api/cron/expire-stranger-notes/route.ts`
- Check: `vercel.json` cron entries (update if present)

- [ ] **Step 1: Create the new cron route**

Create `src/app/api/cron/stranger-threads/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pickRandomRecipient, deliverThreadToRecipient } from '@/lib/stranger-matcher'
import { generateDisplayName } from '@/lib/stranger-names'
import {
  UNMATCHED_LIFETIME_MS,
  ACTIVE_SILENCE_LIFETIME_MS,
  UNWAVED_VANISH_LIFETIME_MS,
  WAVE_DECISION_WINDOW_MS,
} from '@/lib/stranger-notes'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const summary = { matched: 0, closedUnwaved: 0, deleted: 0 }

  // ── Step 1: Retry matching for unmatched threads ────────────────────────────
  const unmatched = await prisma.strangerThread.findMany({
    where: { status: 'unmatched', matchedAt: null },
    select: { id: true, senderId: true },
    take: 100, // batch
  })
  for (const t of unmatched) {
    const recipientId = await pickRandomRecipient(t.senderId)
    if (!recipientId) continue
    const displayName = generateDisplayName(`${t.id}:recipient`)
    const ok = await deliverThreadToRecipient(t.id, recipientId, displayName)
    if (ok) summary.matched++
  }

  // ── Step 2: Close wave-window threads that didn't reach mutual wave ─────────
  const waveWindowDeadline = new Date(now.getTime() - WAVE_DECISION_WINDOW_MS)
  const toClose = await prisma.strangerThread.findMany({
    where: {
      status: 'active',
      senderWaveOfferedAt: { not: null, lte: waveWindowDeadline },
      recipientWaveOfferedAt: { not: null, lte: waveWindowDeadline },
    },
    select: { id: true, _count: { select: { waves: true } } },
  })
  for (const t of toClose) {
    if (t._count.waves >= 2) continue // already became pen_pal
    await prisma.strangerThread.update({
      where: { id: t.id },
      data: { status: 'closed_unwaved', closedAt: now },
    })
    summary.closedUnwaved++
  }

  // ── Step 3: Cleanup (rate-limited to roughly hourly via a marker row) ──────
  // Simple gate: only run cleanup if we haven't in the last 55 minutes. Use a setting
  // table or fall back to: run cleanup every time but limit DELETE batch sizes.
  // For simplicity and safety, run cleanup every cron tick — it's idempotent and the
  // batch is bounded.
  const unmatchedDeadline = new Date(now.getTime() - UNMATCHED_LIFETIME_MS)
  const activeSilenceDeadline = new Date(now.getTime() - ACTIVE_SILENCE_LIFETIME_MS)
  const unwavedVanishDeadline = new Date(now.getTime() - UNWAVED_VANISH_LIFETIME_MS)

  const d1 = await prisma.strangerThread.deleteMany({
    where: { status: 'unmatched', createdAt: { lt: unmatchedDeadline } },
  })
  const d2 = await prisma.strangerThread.deleteMany({
    where: { status: 'active', lastActivityAt: { lt: activeSilenceDeadline } },
  })
  const d3 = await prisma.strangerThread.deleteMany({
    where: { status: 'closed_unwaved', closedAt: { lt: unwavedVanishDeadline } },
  })
  summary.deleted = d1.count + d2.count + d3.count

  return NextResponse.json({ ok: true, summary })
}
```

- [ ] **Step 2: Update vercel.json cron entries**

Check for `vercel.json`:

```bash
cat vercel.json 2>/dev/null | grep -A 5 stranger
```

If the v1 cron `expire-stranger-notes` is registered, replace its entry with:

```json
{ "path": "/api/cron/stranger-threads", "schedule": "*/15 * * * *" }
```

If `vercel.json` doesn't exist or doesn't register the v1 cron, you can skip this step — the route is callable manually with the `CRON_SECRET` Bearer header.

- [ ] **Step 3: Delete the v1 cron route**

```bash
rm -rf src/app/api/cron/expire-stranger-notes
```

- [ ] **Step 4: Restart and hit the new cron manually**

```bash
docker compose restart app
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3111/api/cron/stranger-threads
```

Expected: `{"ok":true,"summary":{"matched":N,"closedUnwaved":0,"deleted":0}}`.

Force-test a cleanup by manually back-dating an `unmatched` thread's `createdAt` to 31 days ago in Prisma Studio, then re-run the cron — `deleted` should bump by 1.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/api/cron/ vercel.json
git commit -m "feat(stranger-notes): consolidated cron — retry + wave-window-close + cleanup"
```

---

## Task 12: E2EE plumbing — keypair init + thread keys

**Files:**
- Modify: `package.json` (add `tweetnacl`)
- Create: `src/lib/stranger-e2ee.ts`
- Create: `src/app/api/stranger-notes/keys/init/route.ts`
- Create: `src/app/api/stranger-notes/threads/[id]/keys/route.ts`
- Create: `src/app/api/stranger-notes/users/[id]/public-key/route.ts`

- [ ] **Step 1: Install tweetnacl**

```bash
docker compose exec app npm install tweetnacl @types/tweetnacl
```

- [ ] **Step 2: Create the E2EE library**

Create `src/lib/stranger-e2ee.ts`:

```typescript
'use client'

// Client-only crypto for stranger-note E2EE.
// Uses NaCl box (X25519 + XSalsa20-Poly1305) for keypair-based key wrapping,
// then AES-256-GCM (via Web Crypto) under the unwrapped thread key for messages.
//
// Why both? NaCl box gives us a sealed-envelope primitive perfect for wrapping a
// symmetric key to a recipient's public key. Once unwrapped, we use AES-GCM via
// the existing src/lib/e2ee/crypto.ts primitives so all our message crypto goes
// through one well-tested path.

import nacl from 'tweetnacl'
import { encryptString, decryptString } from '@/lib/e2ee/crypto'

// ── base64 helpers ──────────────────────────────────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── Keypair lifecycle ───────────────────────────────────────────────────────

export interface StrangerKeypairWrapped {
  publicKey: string // base64
  wrappedPrivateKey: string // base64 ciphertext under master key (Web Crypto AES-GCM JSON form)
}

/**
 * Generate a fresh Curve25519 keypair and wrap the private key under the user's master key.
 * Called lazily the first time the user attempts a wave.
 */
export async function generateStrangerKeypair(masterKey: CryptoKey): Promise<StrangerKeypairWrapped> {
  const pair = nacl.box.keyPair()
  // encryptString returns a JSON envelope { iv, ciphertext }
  const wrappedPrivateKey = await encryptString(bytesToBase64(pair.secretKey), masterKey)
  return {
    publicKey: bytesToBase64(pair.publicKey),
    wrappedPrivateKey,
  }
}

/**
 * Unwrap the user's stranger private key for use in this session.
 */
export async function unwrapStrangerPrivateKey(
  wrappedPrivateKey: string,
  masterKey: CryptoKey
): Promise<Uint8Array> {
  const privB64 = await decryptString(wrappedPrivateKey, masterKey)
  return base64ToBytes(privB64)
}

// ── Thread key generation and wrapping ──────────────────────────────────────

/**
 * Generate a fresh thread key, wrap it for both participants' public keys.
 * Called by the FIRST client to poll a thread after mutual wave (server flag
 * pendingKeyExchange=true).
 */
export async function generateAndWrapThreadKey(
  myPrivateKey: Uint8Array,
  myPublicKey: string, // base64
  partnerPublicKey: string // base64
): Promise<{
  wrappedForMe: string
  wrappedForPartner: string
  threadKey: CryptoKey
}> {
  // Random 32-byte AES key
  const threadKeyBytes = nacl.randomBytes(32)

  const wrappedForMe = wrapKeyForRecipient(
    threadKeyBytes,
    myPrivateKey,
    base64ToBytes(myPublicKey)
  )
  const wrappedForPartner = wrapKeyForRecipient(
    threadKeyBytes,
    myPrivateKey,
    base64ToBytes(partnerPublicKey)
  )

  const threadKey = await crypto.subtle.importKey(
    'raw',
    threadKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )

  return { wrappedForMe, wrappedForPartner, threadKey }
}

function wrapKeyForRecipient(
  threadKey: Uint8Array,
  senderPrivate: Uint8Array,
  recipientPublic: Uint8Array
): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const boxed = nacl.box(threadKey, nonce, recipientPublic, senderPrivate)
  // Encode as nonce || ciphertext (base64)
  const out = new Uint8Array(nonce.length + boxed.length)
  out.set(nonce, 0)
  out.set(boxed, nonce.length)
  return bytesToBase64(out)
}

/**
 * Unwrap a thread key previously wrapped for the current user.
 * Called when a user opens a pen-pal thread and we have wrappedKeyForSender/Recipient.
 */
export async function unwrapThreadKey(
  wrappedKey: string,
  myPrivateKey: Uint8Array,
  partnerPublicKey: string // base64
): Promise<CryptoKey> {
  const combined = base64ToBytes(wrappedKey)
  const nonce = combined.slice(0, nacl.box.nonceLength)
  const boxed = combined.slice(nacl.box.nonceLength)
  const opened = nacl.box.open(boxed, nonce, base64ToBytes(partnerPublicKey), myPrivateKey)
  if (!opened) throw new Error('Failed to unwrap thread key')
  return crypto.subtle.importKey('raw', opened, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

// ── Thread-tier message encryption (uses AES-GCM via Web Crypto) ─────────────

export async function encryptThreadMessage(plaintext: string, threadKey: CryptoKey): Promise<string> {
  // Delegate to the same envelope format as the rest of Hearth's E2EE — encryptString
  // already produces a JSON {iv, ciphertext} envelope.
  return encryptString(plaintext, threadKey)
}

export async function decryptThreadMessage(ciphertext: string, threadKey: CryptoKey): Promise<string> {
  return decryptString(ciphertext, threadKey)
}
```

- [ ] **Step 3: Keypair init route**

Create `src/app/api/stranger-notes/keys/init/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { publicKey?: unknown; wrappedPrivateKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.publicKey !== 'string' || typeof body.wrappedPrivateKey !== 'string') {
    return NextResponse.json({ error: 'publicKey and wrappedPrivateKey required' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { strangerPublicKey: true },
  })
  if (existing?.strangerPublicKey) {
    return NextResponse.json({ error: 'Keypair already initialized' }, { status: 409 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      strangerPublicKey: body.publicKey,
      strangerWrappedPrivateKey: body.wrappedPrivateKey,
    },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Thread keys route**

Create `src/app/api/stranger-notes/threads/[id]/keys/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: { wrappedKeyForSender?: unknown; wrappedKeyForRecipient?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.wrappedKeyForSender !== 'string' || typeof body.wrappedKeyForRecipient !== 'string') {
    return NextResponse.json({ error: 'Both wrapped keys required' }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const thread = await tx.strangerThread.findUnique({ where: { id } })
    if (!thread) return { status: 404 as const, body: { error: 'Not found' } }
    if (thread.senderId !== user.id && thread.recipientId !== user.id) {
      return { status: 404 as const, body: { error: 'Not found' } }
    }
    if (thread.status !== 'pen_pal' || !thread.pendingKeyExchange) {
      return { status: 409 as const, body: { error: 'Keys already exchanged or not pending' } }
    }
    await tx.strangerThread.update({
      where: { id },
      data: {
        wrappedKeyForSender: body.wrappedKeyForSender as string,
        wrappedKeyForRecipient: body.wrappedKeyForRecipient as string,
        pendingKeyExchange: false,
      },
    })
    return { status: 200 as const, body: { success: true } }
  })

  return NextResponse.json(result.body, { status: result.status })
}
```

- [ ] **Step 5: Public key lookup route**

Create `src/app/api/stranger-notes/users/[id]/public-key/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Only expose the public key if there's a pen_pal thread between me and this user.
  // Prevents enumeration of arbitrary public keys.
  const thread = await prisma.strangerThread.findFirst({
    where: {
      status: 'pen_pal',
      OR: [
        { senderId: me.id, recipientId: id },
        { senderId: id, recipientId: me.id },
      ],
    },
    select: { id: true },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const partner = await prisma.user.findUnique({
    where: { id },
    select: { strangerPublicKey: true },
  })
  if (!partner?.strangerPublicKey) {
    return NextResponse.json({ error: 'Partner has no key' }, { status: 404 })
  }

  return NextResponse.json({ publicKey: partner.strangerPublicKey })
}
```

- [ ] **Step 6: Compile check**

```bash
docker compose exec app npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/stranger-e2ee.ts src/app/api/stranger-notes/
git commit -m "feat(stranger-notes): E2EE keypair + thread-key exchange plumbing"
```

---

## Task 13: Frontend hook + LightsView + Mailbox

**Files:**
- Modify (rewrite): `src/hooks/useStrangerNotes.ts`
- Modify (rewrite): `src/components/letters/lights/LightsView.tsx`
- Modify (rewrite): `src/components/letters/lights/Mailbox.tsx`
- Create: `src/components/letters/lights/ThreadView.tsx`
- Delete: `src/components/letters/lights/ReadPaper.tsx`
- Delete: `src/components/letters/lights/ReplyCard.tsx`

- [ ] **Step 1: Rewrite the hook**

Replace `src/hooks/useStrangerNotes.ts` entirely:

```typescript
'use client'

import { useCallback, useEffect, useState } from 'react'

export interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export interface InboxPayload {
  outgoing: InboxThread[]
  active: InboxThread[]
  penpals: InboxThread[]
  counters: { sent: number; received: number }
}

const TZ_HEADER = 'X-User-TZ'

function userTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set(TZ_HEADER, userTz())
  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export function useStrangerNotes() {
  const [data, setData] = useState<InboxPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const inbox = await jsonFetch<InboxPayload>('/api/stranger-notes/inbox')
      setData(inbox)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // Focus-event refetch: tab visibility, window focus, manual pull.
  useEffect(() => {
    refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const sendNewNote = useCallback(
    async (content: string, country?: string, stateName?: string) => {
      await jsonFetch('/api/stranger-notes', {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName }),
      })
      await refresh()
    },
    [refresh]
  )

  const sendReply = useCallback(
    async (threadId: string, content: string, country?: string, stateName?: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName, encryptionTier: 'server' }),
      })
      await refresh()
    },
    [refresh]
  )

  const sendReplyEncrypted = useCallback(
    async (threadId: string, ciphertext: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
      })
      await refresh()
    },
    [refresh]
  )

  const skip = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/skip`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const block = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/block`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const waveOffered = useCallback(async (threadId: string) => {
    await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave-offered`, { method: 'POST' })
  }, [])

  const wave = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave`, { method: 'POST' })
      await refresh()
    },
    [refresh]
  )

  const endPenPal = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
      await refresh()
    },
    [refresh]
  )

  return {
    data,
    loading,
    error,
    refresh,
    sendNewNote,
    sendReply,
    sendReplyEncrypted,
    skip,
    block,
    waveOffered,
    wave,
    endPenPal,
  }
}
```

- [ ] **Step 2: Create ThreadView**

Create `src/components/letters/lights/ThreadView.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme'

interface ThreadMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  body: string // pre-decrypted for server; ciphertext for thread (we display "[locked]" if no key)
  countryCode: string | null
  stateName: string | null
  createdAt: string
}

interface ThreadDetail {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  messages: ThreadMessage[]
}

interface Props {
  threadId: string
  onClose: () => void
  onReply: (content: string) => Promise<void>
  onSkip: () => Promise<void>
  onBlock: () => Promise<void>
  onWavePromptShown: () => Promise<void>
  onWave: () => Promise<void>
}

export default function ThreadView({
  threadId,
  onClose,
  onReply,
  onSkip,
  onBlock,
  onWavePromptShown,
  onWave,
}: Props) {
  const { theme } = useThemeStore()
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/stranger-notes/threads/${threadId}`, { credentials: 'include' })
      const data = await res.json()
      if (!cancelled) setThread(data)
      if (data.waveEligible && !data.waveOfferedToMe) {
        // Mark prompt as offered (idempotent)
        onWavePromptShown().catch(() => {})
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [threadId, onWavePromptShown])

  if (!thread) return <div className="p-6 text-sm opacity-70">Loading…</div>

  // Find pre-wave / post-wave boundary: index of first 'thread' tier message
  const firstThreadIdx = thread.messages.findIndex((m) => m.encryptionTier === 'thread')

  return (
    <div
      className="w-full max-w-md rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: theme.glass.bg,
        border: `1px solid ${theme.glass.border}`,
        backdropFilter: `blur(${theme.glass.blur})`,
      }}
    >
      <div className="flex justify-between items-baseline">
        <h3 style={{ color: theme.text.primary }} className="text-sm font-medium">
          {thread.partnerDisplayName}
        </h3>
        <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">
          close
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {thread.messages.map((m, i) => (
          <div key={m.id}>
            {firstThreadIdx > 0 && i === firstThreadIdx && (
              <div className="text-center text-xs opacity-60 my-3" style={{ color: theme.text.muted }}>
                — From here, only you two can read these —
              </div>
            )}
            <div
              className={`text-sm py-2 px-3 rounded-md ${m.isMine ? 'text-right' : ''}`}
              style={{
                color: theme.text.secondary,
                background: m.isMine ? `${theme.accent.primary}15` : `${theme.accent.warm}15`,
              }}
            >
              {m.body || (m.encryptionTier === 'thread' ? '[encrypted]' : '')}
              {m.countryCode && (
                <span className="ml-2 text-xs opacity-60" style={{ color: theme.text.muted }}>
                  · {m.stateName ? `${m.stateName}, ` : ''}{m.countryCode}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {thread.waveEligible && !thread.myWaveCast && thread.status === 'active' && (
        <div className="p-3 rounded-md flex flex-col gap-2" style={{ background: `${theme.accent.warm}20` }}>
          <p className="text-sm" style={{ color: theme.text.primary }}>
            You&apos;ve shared a few notes. Would you like to keep writing to this stranger?
          </p>
          <button
            type="button"
            onClick={onWave}
            className="self-start px-4 py-1.5 rounded-full text-xs font-medium"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            🪶 Yes, wave back
          </button>
        </div>
      )}

      {(thread.status === 'active' || thread.status === 'pen_pal') && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draft.trim() || sending) return
            setSending(true)
            try {
              await onReply(draft.trim())
              setDraft('')
            } finally {
              setSending(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="Write back…"
            className="w-full p-2 rounded-md text-sm resize-none"
            rows={3}
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.primary,
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs opacity-60" style={{ color: theme.text.muted }}>
              {draft.length}/200
            </span>
            <button
              type="submit"
              disabled={sending || draft.trim().length < 10}
              className="px-4 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
              style={{ background: theme.accent.primary, color: theme.bg.primary }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-3 pt-2 text-xs opacity-60">
        <button onClick={onSkip} className="hover:opacity-100">
          Skip
        </button>
        <button onClick={onBlock} className="hover:opacity-100">
          Block
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite LightsView**

Replace `src/components/letters/lights/LightsView.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useStrangerNotes } from '@/hooks/useStrangerNotes'
import Mailbox from './Mailbox'
import ComposePaper from './ComposePaper'
import ThreadView from './ThreadView'

type Mode = 'idle' | 'composing' | 'thread'

export default function LightsView() {
  const sn = useStrangerNotes()
  const [mode, setMode] = useState<Mode>('idle')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  if (sn.loading && !sn.data) {
    return <div className="p-6 text-sm opacity-70">Loading…</div>
  }
  if (sn.error && !sn.data) {
    return <div className="p-6 text-sm text-red-500">{sn.error}</div>
  }
  if (!sn.data) return null

  const totalUnread =
    sn.data.active.reduce((acc, t) => acc + t.unreadCount, 0) +
    sn.data.penpals.reduce((acc, t) => acc + t.unreadCount, 0)

  return (
    <div className="relative flex flex-col items-center gap-8 p-6 sm:p-10">
      <div className="text-center max-w-md">
        <p className="text-sm opacity-70">
          You&apos;ve sent {sn.data.counters.sent} small lights into the world.
          {' '}
          {sn.data.counters.received} have arrived at your door from strangers.
        </p>
      </div>

      <Mailbox
        unreadCount={totalUnread}
        outgoing={sn.data.outgoing}
        active={sn.data.active}
        penpals={sn.data.penpals}
        onCompose={() => setMode('composing')}
        onPickThread={(id) => {
          setActiveThreadId(id)
          setMode('thread')
        }}
      />

      {mode === 'composing' && (
        <ComposePaper
          onCancel={() => setMode('idle')}
          onSend={async (content, country, stateName) => {
            await sn.sendNewNote(content, country, stateName)
            setMode('idle')
          }}
        />
      )}

      {mode === 'thread' && activeThreadId && (
        <ThreadView
          threadId={activeThreadId}
          onClose={() => {
            setMode('idle')
            setActiveThreadId(null)
          }}
          onReply={(content) => sn.sendReply(activeThreadId, content)}
          onSkip={async () => {
            await sn.skip(activeThreadId)
            setMode('idle')
            setActiveThreadId(null)
          }}
          onBlock={async () => {
            await sn.block(activeThreadId)
            setMode('idle')
            setActiveThreadId(null)
          }}
          onWavePromptShown={() => sn.waveOffered(activeThreadId)}
          onWave={() => sn.wave(activeThreadId)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rewrite Mailbox**

Replace `src/components/letters/lights/Mailbox.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { InboxThread } from '@/hooks/useStrangerNotes'

interface Props {
  unreadCount: number
  outgoing: InboxThread[]
  active: InboxThread[]
  penpals: InboxThread[]
  onCompose: () => void
  onPickThread: (id: string) => void
}

export default function Mailbox({ unreadCount, outgoing, active, penpals, onCompose, onPickThread }: Props) {
  const { theme } = useThemeStore()
  const [open, setOpen] = useState(false)

  const hasItems = outgoing.length + active.length + penpals.length > 0

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.button
        type="button"
        onClick={() => hasItems && setOpen((v) => !v)}
        className="relative w-32 h-40 rounded-xl flex items-center justify-center text-5xl"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
          backdropFilter: `blur(${theme.glass.blur})`,
          color: theme.text.primary,
          cursor: hasItems ? 'pointer' : 'default',
          opacity: hasItems ? 1 : 0.6,
        }}
        whileHover={hasItems ? { scale: 1.03 } : {}}
        animate={
          unreadCount > 0
            ? {
                boxShadow: [
                  `0 0 12px ${theme.accent.warm}40`,
                  `0 0 24px ${theme.accent.warm}80`,
                  `0 0 12px ${theme.accent.warm}40`,
                ],
              }
            : { boxShadow: 'none' }
        }
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Lantern of stranger notes"
      >
        <span aria-hidden>🪔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            {unreadCount}
          </span>
        )}
      </motion.button>

      {open && hasItems && (
        <div
          className="w-full max-w-sm rounded-xl p-3 flex flex-col gap-3"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            backdropFilter: `blur(${theme.glass.blur})`,
          }}
        >
          <Shelf title="Lights you sent" items={outgoing} theme={theme} onPick={onPickThread} muted />
          <Shelf title="Open exchanges" items={active} theme={theme} onPick={onPickThread} />
          <Shelf title="Pen pals" items={penpals} theme={theme} onPick={onPickThread} highlight />
        </div>
      )}

      <button
        type="button"
        onClick={onCompose}
        className="px-6 py-3 rounded-full text-sm font-medium transition-opacity"
        style={{ background: theme.accent.primary, color: theme.bg.primary }}
      >
        Send a small light
      </button>
    </div>
  )
}

function Shelf({
  title,
  items,
  theme,
  onPick,
  muted = false,
  highlight = false,
}: {
  title: string
  items: InboxThread[]
  theme: ReturnType<typeof useThemeStore>['theme']
  onPick: (id: string) => void
  muted?: boolean
  highlight?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wider opacity-60" style={{ color: theme.text.muted }}>
        {title}
      </p>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className="text-left text-sm py-2 px-3 rounded-md hover:opacity-80 transition-opacity"
          style={{
            color: theme.text.secondary,
            background:
              t.unreadCount > 0
                ? `${theme.accent.warm}15`
                : highlight
                ? `${theme.accent.primary}10`
                : 'transparent',
            opacity: muted ? 0.7 : 1,
          }}
          onClick={() => onPick(t.id)}
        >
          <div className="font-medium">{t.partnerDisplayName}</div>
          {t.preview && (
            <div className="text-xs opacity-70 truncate">
              {t.preview.isMine ? 'You: ' : ''}
              {t.preview.encryptionTier === 'thread' ? '[encrypted]' : t.preview.body}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Delete obsolete files**

```bash
rm src/components/letters/lights/ReadPaper.tsx src/components/letters/lights/ReplyCard.tsx
```

- [ ] **Step 6: Restart and verify in browser**

```bash
docker compose restart app
```

Open `http://localhost:3111` → log in → navigate to Letters → Lights. Expected:
- Lantern visible, mailbox dropdown shows shelves
- Can compose a new note (cold-open send works)
- Can open an existing thread (the one from Task 6)
- Can reply inside the thread
- Skip and Block buttons work and the thread disappears from inbox

- [ ] **Step 7: Commit**

```bash
git add -A src/hooks/useStrangerNotes.ts src/components/letters/lights/
git commit -m "feat(stranger-notes): frontend hook + threaded LightsView + Mailbox shelves"
```

---

## Task 14: ComposePaper with country picker

**Files:**
- Modify (rewrite): `src/components/letters/lights/ComposePaper.tsx`

- [ ] **Step 1: Add a minimal country list constant**

At the top of the rewritten `ComposePaper.tsx`, define a small curated list. (For v1, ~30 countries covering the launch audience is enough; add more later as needed.)

Replace `src/components/letters/lights/ComposePaper.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useThemeStore } from '@/store/theme'

const COUNTRIES: { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
]

const STORAGE_KEY = 'hearth.stranger.lastCountry'

interface Props {
  onCancel: () => void
  onSend: (content: string, country?: string, stateName?: string) => Promise<void>
}

export default function ComposePaper({ onCancel, onSend }: Props) {
  const { theme } = useThemeStore()
  const [text, setText] = useState('')
  const [country, setCountry] = useState<string>('')
  const [stateName, setStateName] = useState<string>('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setCountry(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (country) {
      try {
        localStorage.setItem(STORAGE_KEY, country)
      } catch {}
    }
  }, [country])

  const canSend = text.trim().length >= 10 && text.trim().length <= 200 && !sending

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!canSend) return
        setSending(true)
        setError(null)
        try {
          await onSend(text.trim(), country || undefined, stateName || undefined)
          setText('')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not send')
        } finally {
          setSending(false)
        }
      }}
      className="w-full max-w-md rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: theme.glass.bg,
        border: `1px solid ${theme.glass.border}`,
        backdropFilter: `blur(${theme.glass.blur})`,
      }}
    >
      <p className="text-sm opacity-80" style={{ color: theme.text.primary }}>
        Write a small light to a stranger. A gratitude, a hope, a kindness.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        rows={4}
        placeholder="Something warm…"
        className="w-full p-2 rounded-md text-sm resize-none"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
          color: theme.text.primary,
        }}
        autoFocus
      />
      <div className="flex gap-2 items-center">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="text-xs p-1 rounded-md"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            color: theme.text.secondary,
          }}
        >
          <option value="">No postmark</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {country && (
          <input
            type="text"
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            maxLength={40}
            placeholder="State (optional)"
            className="flex-1 text-xs p-1 rounded-md"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.primary,
            }}
          />
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex justify-between items-center">
        <span className="text-xs opacity-60" style={{ color: theme.text.muted }}>
          {text.length}/200
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 opacity-60 hover:opacity-100"
            style={{ color: theme.text.muted }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="px-4 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Restart and verify**

```bash
docker compose restart app
```

In the browser: open the compose surface, pick a country, type a note, send. Verify in Prisma Studio that the new `stranger_messages` row has `countryCode` populated. Reload — confirm the country picker remembers your last selection.

- [ ] **Step 3: Commit**

```bash
git add src/components/letters/lights/ComposePaper.tsx
git commit -m "feat(stranger-notes): compose with country postmark + localStorage memory"
```

---

## Task 15: Wire up E2EE in the frontend

**Files:**
- Modify: `src/components/letters/lights/ThreadView.tsx` (E2EE decrypt for thread-tier messages)
- Modify: `src/components/letters/lights/LightsView.tsx` (wave handler → key-exchange path)

This task connects the existing E2EE API plumbing (Task 12) to the UI. The flow:

1. When the user opens a `pen_pal` thread, the client checks `pendingKeyExchange`.
2. If pending, the client generates a thread key, wraps for both parties, POSTs to `/keys`.
3. If keys are already there, the client unwraps its own and uses it to decrypt thread-tier messages.

- [ ] **Step 1: Add an E2EE setup helper**

Create `src/hooks/useStrangerThreadKey.ts`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import {
  generateStrangerKeypair,
  unwrapStrangerPrivateKey,
  generateAndWrapThreadKey,
  unwrapThreadKey,
  decryptThreadMessage,
} from '@/lib/stranger-e2ee'
import { loadMasterKeyLocally } from '@/lib/e2ee/crypto'

interface ThreadKeyState {
  threadKey: CryptoKey | null
  error: string | null
  loading: boolean
}

/**
 * Manages the thread-key lifecycle for a single pen-pal thread:
 *   - Lazily initialize the user's stranger keypair if missing.
 *   - On pendingKeyExchange, generate a thread key, wrap, post.
 *   - Otherwise, unwrap the existing thread key.
 *
 * Returns the unwrapped CryptoKey ready for AES-GCM encrypt/decrypt.
 */
export function useStrangerThreadKey(
  threadId: string | null,
  pendingKeyExchange: boolean,
  myWrappedKey: string | null,
  partnerUserId: string | null
): ThreadKeyState {
  const [state, setState] = useState<ThreadKeyState>({ threadKey: null, error: null, loading: false })

  useEffect(() => {
    if (!threadId) return
    let cancelled = false

    ;(async () => {
      setState({ threadKey: null, error: null, loading: true })
      try {
        const masterKey = await loadMasterKeyLocally()
        if (!masterKey) {
          throw new Error('Unlock your master key first to read pen-pal threads.')
        }

        // Ensure user has stranger keypair; if not, lazily generate + init.
        const meRes = await fetch('/api/auth/me', { credentials: 'include' })
        const me = await meRes.json()
        let myPublicKey: string | null = me?.strangerPublicKey ?? null
        let myWrappedPrivateKey: string | null = me?.strangerWrappedPrivateKey ?? null

        if (!myPublicKey || !myWrappedPrivateKey) {
          const fresh = await generateStrangerKeypair(masterKey)
          const initRes = await fetch('/api/stranger-notes/keys/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(fresh),
          })
          if (!initRes.ok) throw new Error('Failed to init stranger keypair')
          myPublicKey = fresh.publicKey
          myWrappedPrivateKey = fresh.wrappedPrivateKey
        }

        const myPrivate = await unwrapStrangerPrivateKey(myWrappedPrivateKey, masterKey)

        // Fetch partner's public key (only succeeds if there's a pen_pal thread between us)
        if (!partnerUserId) throw new Error('Partner not known yet')
        const pkRes = await fetch(
          `/api/stranger-notes/users/${encodeURIComponent(partnerUserId)}/public-key`,
          { credentials: 'include' }
        )
        if (!pkRes.ok) throw new Error('Could not fetch partner public key')
        const { publicKey: partnerPublic } = await pkRes.json()

        if (pendingKeyExchange) {
          const { wrappedForMe, wrappedForPartner, threadKey } =
            await generateAndWrapThreadKey(myPrivate, myPublicKey!, partnerPublic)

          // Determine which slot is mine — server stores wrappedKeyForSender / wrappedKeyForRecipient.
          // We POST both and the server figures it out.
          const postRes = await fetch(
            `/api/stranger-notes/threads/${encodeURIComponent(threadId)}/keys`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              // Server doesn't know who is "me" relative to sender/recipient at the JSON level
              // until it looks at the thread row — convention: client always sends BOTH keys with
              // wrappedForMe matching the user posting. Server reads thread.senderId and assigns
              // wrappedKeyForSender = (me is sender ? wrappedForMe : wrappedForPartner).
              // To keep the API simple we send wrappedKeyForSender + wrappedKeyForRecipient
              // explicitly here — caller must know which is which.
              // Simplification: always treat the POSTing client as 'sender' for the keypair-init
              // race, and let server's transaction sort out assignment.
              body: JSON.stringify({
                wrappedKeyForSender: wrappedForMe,
                wrappedKeyForRecipient: wrappedForPartner,
              }),
            }
          )
          if (postRes.status === 409) {
            // Race lost — partner client already exchanged. Re-fetch and unwrap normally.
            const tRes = await fetch(`/api/stranger-notes/threads/${threadId}`, { credentials: 'include' })
            const t = await tRes.json()
            if (!t.myWrappedKey) throw new Error('No wrapped key after race')
            const unwrapped = await unwrapThreadKey(t.myWrappedKey, myPrivate, partnerPublic)
            if (!cancelled) setState({ threadKey: unwrapped, error: null, loading: false })
            return
          }
          if (!postRes.ok) throw new Error('Failed to post thread keys')
          if (!cancelled) setState({ threadKey, error: null, loading: false })
        } else if (myWrappedKey) {
          const unwrapped = await unwrapThreadKey(myWrappedKey, myPrivate, partnerPublic)
          if (!cancelled) setState({ threadKey: unwrapped, error: null, loading: false })
        } else {
          throw new Error('No wrapped key on thread')
        }
      } catch (e) {
        if (!cancelled) {
          setState({ threadKey: null, error: e instanceof Error ? e.message : 'E2EE setup failed', loading: false })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [threadId, pendingKeyExchange, myWrappedKey, partnerUserId])

  return state
}

export { decryptThreadMessage }
```

Note: this hook depends on the `/api/auth/me` endpoint returning `strangerPublicKey` and `strangerWrappedPrivateKey`. Verify that endpoint exists; if it returns a stripped user payload that excludes these new fields, add them to its select set.

- [ ] **Step 2: Verify `/api/auth/me` includes stranger keypair fields**

```bash
grep -n "strangerPublicKey\|strangerWrappedPrivateKey" src/app/api/auth/me/route.ts 2>/dev/null
```

If empty, open `src/app/api/auth/me/route.ts` and add `strangerPublicKey: true, strangerWrappedPrivateKey: true` to the user `select` clause. If the route uses `getCurrentUser()` directly and returns its full result, check what fields that helper exposes. Adjust accordingly.

- [ ] **Step 3: Plumb the hook into ThreadView**

In `src/components/letters/lights/ThreadView.tsx`, near the top of the component body (after `useState` calls), introduce thread-key state and decrypt thread-tier messages as they're displayed. Replace the `<div>{m.body ...}</div>` rendering to decrypt thread-tier messages asynchronously:

```typescript
// near other useState calls
const { threadKey, error: keyError } = useStrangerThreadKey(
  thread?.status === 'pen_pal' ? threadId : null,
  thread?.pendingKeyExchange ?? false,
  thread?.myWrappedKey ?? null,
  // partnerUserId: derived from thread row. The detail endpoint doesn't expose this
  // directly today — extend GET /api/stranger-notes/threads/[id] to include
  // `partnerUserId: thread.senderId === user.id ? thread.recipientId : thread.senderId`
  // in the response.
  (thread as unknown as { partnerUserId?: string })?.partnerUserId ?? null
)
const [decryptedBodies, setDecryptedBodies] = useState<Record<string, string>>({})

useEffect(() => {
  if (!thread || !threadKey) return
  ;(async () => {
    const out: Record<string, string> = {}
    for (const m of thread.messages) {
      if (m.encryptionTier === 'thread') {
        try {
          out[m.id] = await decryptThreadMessage(m.body, threadKey)
        } catch {
          out[m.id] = '[unreadable]'
        }
      }
    }
    setDecryptedBodies(out)
  })()
}, [thread, threadKey])
```

Then in the message-rendering JSX, prefer `decryptedBodies[m.id] ?? m.body`.

- [ ] **Step 4: Add `partnerUserId` to thread detail response**

Modify `src/app/api/stranger-notes/threads/[id]/route.ts` so the GET response includes:

```typescript
partnerUserId: thread.senderId === user.id ? thread.recipientId : thread.senderId,
```

And update the matching frontend type in `useStrangerNotes.ts` / `ThreadView.tsx` to consume it.

- [ ] **Step 5: When user taps Wave and the thread flips to pen_pal, update the encryption-tier the reply form posts as**

In `ThreadView.tsx`, after a successful wave, the next reply should be `encryptionTier: 'thread'` and pre-encrypted under `threadKey`. Wrap the existing `onReply` call:

```typescript
async function handleReply(text: string) {
  if (thread?.status === 'pen_pal' && threadKey) {
    // E2EE path
    const ciphertext = await encryptThreadMessage(text, threadKey)
    await fetch(`/api/stranger-notes/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
    })
  } else {
    await onReply(text)
  }
}
```

(Import `encryptThreadMessage` alongside `decryptThreadMessage` from `@/hooks/useStrangerThreadKey` re-export or directly from `@/lib/stranger-e2ee`.)

- [ ] **Step 6: Restart and exercise E2EE end-to-end**

```bash
docker compose restart app
```

Manual flow:
1. Log in as user A. Open the dev console, ensure master key is unlocked (`hasMasterKeyLocally()` returns true).
2. Send 3 cold-open notes (or seed via Prisma Studio) to user B's account.
3. As user B, reply 3 times.
4. Open thread as A → wave-eligible should be true → tap Yes.
5. Repeat as B → mutual wave.
6. Open thread as A again: client should generate thread key, POST `/keys`, succeed.
7. Open thread as B: client should fetch `myWrappedKey`, unwrap, decrypt messages going forward.
8. Send a reply from A → message stored ciphertext (verify in Prisma Studio: `encryptionTier='thread'`, `content` is base64 JSON envelope).
9. As B, refresh → see A's decrypted message.

If any step fails, check browser console for thrown errors from `useStrangerThreadKey` — most likely failure modes are: master key not unlocked, `/api/auth/me` not exposing the keypair fields, or the race-handling 409 path.

- [ ] **Step 7: Commit**

```bash
git add -A src/hooks/ src/components/letters/lights/ src/app/api/stranger-notes/threads/
git commit -m "feat(stranger-notes): wire E2EE thread keys into ThreadView + reply path"
```

---

## Task 16: Polish — wave decline copy, pen-pal shelf treatment, account-deletion message

**Files:**
- Modify: `src/components/letters/lights/ThreadView.tsx`
- Modify: `src/components/letters/lights/Mailbox.tsx` (Shelf component already exists from Task 13; add visual differentiation)

- [ ] **Step 1: Show "this exchange has folded itself away" for closed_unwaved**

The inbox API already filters out `closed_unwaved` threads (so vanishing is silent), but if the recipient happens to be viewing a thread when it closes, the next GET will return `status='closed_unwaved'` until the cleanup cron deletes it (up to 24h). Add a rendering branch in `ThreadView.tsx` near the top:

```typescript
if (thread.status === 'closed_unwaved') {
  return (
    <div
      className="w-full max-w-md rounded-xl p-6 flex flex-col gap-3 text-center"
      style={{
        background: theme.glass.bg,
        border: `1px solid ${theme.glass.border}`,
        backdropFilter: `blur(${theme.glass.blur})`,
      }}
    >
      <p className="text-sm" style={{ color: theme.text.primary }}>
        This exchange has folded itself away.
      </p>
      <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100 self-center">
        close
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Show "this stranger has left" when the partner account is gone**

When the partner's account is deleted, `recipientId` (or `senderId`) on the thread becomes null via cascade. Add a branch:

```typescript
const partnerGone =
  (thread.status === 'active' || thread.status === 'pen_pal') &&
  !thread.partnerDisplayName

if (partnerGone) {
  return (
    <div
      className="w-full max-w-md rounded-xl p-6 flex flex-col gap-3 text-center"
      style={{ background: theme.glass.bg, border: `1px solid ${theme.glass.border}` }}
    >
      <p className="text-sm" style={{ color: theme.text.primary }}>
        This stranger has left.
      </p>
      <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100 self-center">
        close
      </button>
    </div>
  )
}
```

(The inbox API and thread detail already default `partnerDisplayName` to `'A wandering light'` when null, so check for that literal or null explicitly. Pick one and be consistent.)

- [ ] **Step 3: Add "End this pen-pal connection" button for pen-pal threads**

In `ThreadView.tsx`, when `thread.status === 'pen_pal'`, render a small subtle button in the actions row:

```typescript
{thread.status === 'pen_pal' && (
  <button
    onClick={async () => {
      if (confirm('End this connection? The thread will be erased on both sides.')) {
        await fetch(`/api/stranger-notes/threads/${threadId}`, { method: 'DELETE', credentials: 'include' })
        onClose()
      }
    }}
    className="text-xs opacity-50 hover:opacity-100"
  >
    End connection
  </button>
)}
```

- [ ] **Step 4: Smoke test the polish flows**

Manually test (in dev):
- Open a `closed_unwaved` thread (set one in Prisma Studio): see folded-away copy.
- Delete a user via Prisma Studio while their thread is open in another session: see "this stranger has left."
- End a pen-pal thread: thread row gets hard-deleted.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/letters/lights/
git commit -m "feat(stranger-notes): folded-away + stranger-has-left copy + pen-pal end button"
```

---

## Self-review summary

Mapped each spec section to the tasks that implement it:

| Spec section | Tasks |
|---|---|
| Data model (4 new tables + User fields) | Task 1 |
| Display name generator + helplines | Task 2 |
| OpenAI moderation | Tasks 3, 6, 8 |
| Stranger-notes / matcher library refactor | Task 4 |
| Migration backfill (v1 → v2) | Task 5 |
| Send cold-open + daily limit + gate | Task 6 |
| Inbox shelves | Task 7 |
| Thread detail + reply + pen-pal end | Task 8 |
| Skip / Block (symmetric cascade) | Task 9 |
| Wave-offered + Wave + mutual flip | Task 10 |
| Consolidated cron (retry + wave-close + cleanup) | Task 11 |
| E2EE keypair + thread key exchange APIs | Task 12 |
| Frontend hook + LightsView + Mailbox + ThreadView | Task 13 |
| ComposePaper with country postmark | Task 14 |
| E2EE wire-up in UI | Task 15 |
| Closed-unwaved + stranger-has-left + pen-pal end UI | Task 16 |

Deferred from this plan (per spec): Web Push (Phase 2), implicit-report threshold, identity reveal beyond display names, location-based matching, email digests, soft opt-out from receiving.

Known asymmetries handled inline in the plan:
- `useStrangerThreadKey` depends on `/api/auth/me` exposing the keypair fields — Task 15 Step 2 has an explicit verify-and-extend step.
- The thread detail response needs `partnerUserId` for the E2EE hook — Task 15 Step 4 patches that field in.
- Race on thread-key exchange (two clients both try to wrap simultaneously) — handled by 409 fallback in `useStrangerThreadKey`.
