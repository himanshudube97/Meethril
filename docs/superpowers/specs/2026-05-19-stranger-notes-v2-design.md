# Stranger Notes v2 — Slow Pen Pal

**Date:** 2026-05-19
**Supersedes:** [`2026-05-03-stranger-notes-design.md`](./2026-05-03-stranger-notes-design.md) (the original "A Small Light" one-shot mechanic).
**Surface:** Lights area on the Letters page. New Prisma models (`StrangerThread`, `StrangerMessage`, `StrangerWave`, `StrangerBlock`). New API surface under `/api/stranger-notes/`. One consolidated cron route for retry + wave-window-close + cleanup. Additive changes to `User`.
**Out of scope (v1):** Implicit-report block thresholds (deliberately deferred, see Moderation). Identity reveal beyond display names. Themed boards / location-based matching. Email digests for inactive users. **Web push notifications are Phase 2** — v1 ships in-app lantern badge only.

---

## Problem & positioning

The v1 mechanic ("send one note, get at most a 20-word warmth back, both vanish in 24h") shipped, but two patterns showed up in design that v1 cannot serve:

1. **The reply cap kills the connection precisely at the point where the magic begins.** Once two strangers have made contact and the recipient has written back, *that's the moment that matters*. Capping it at 20 words and a single turn is like writing a beautiful letter and then refusing to read more than the first sentence of the reply.
2. **Random matching plus a single-shot exchange means "you'll never meet that person again."** Even if two strangers click, there is no door — no mechanism for them to choose to keep the connection. The product structurally forbids the most valuable outcome.

v2 reshapes the mechanic into a **slow pen pal exchange**: an open-ended back-and-forth that ends on silence, with a *wave-back* moment after enough turns that, on mutual consent, converts the thread into a permanent E2EE pen-pal connection.

This preserves everything v1 got right (anonymity, ephemerality, gentleness, low rate) and adds the missing emotional architecture (a real exchange, a way to keep it going, a way to fold it away).

## Goals

1. **The exchange has shape, not a cliff.** Silence is the close; users never see a hard "you have X messages left" counter mid-conversation.
2. **There is a door past the exchange.** The wave-back mechanic lets two strangers who clicked become permanent pen pals — without forcing it on anyone, and without any rejection signal.
3. **Anonymity stays absolute** through the entire arc, including in the pen-pal state. No real names, no profile reveals, no cross-thread identity.
4. **Privacy compounds with trust.** Pre-wave messages are server-encrypted (the server can moderate). Post-wave messages are end-to-end encrypted (only the two participants can read them). The transition is explicit and honest in the UI.
5. **Async is a feature.** Messages travel through stars — the natural rhythm of sporadic app use is what makes every message feel like a letter, not a chat ping. No artificial delivery delays, no read receipts, no typing, no presence — ever.
6. **Cold-start abuse is gated.** Brand-new accounts cannot send stranger notes until they have engaged with Hearth itself (at least one journal entry written).

## Non-goals (v1)

- **Reporting flow with admin queue.** Skip and Block are the only user-facing abuse tools. Automated moderation runs at write-time. The implicit-report threshold ("block-by-N-users in window → suspend") is deferred — risk is acknowledged and noted in the Moderation section.
- **Identity reveal beyond per-thread display names.** Real names, profile pictures, or stable cross-thread identifiers are out of scope.
- **Themed boards / location-based matching.** Matching is purely random; country is decoration only.
- **Email digests.** Not in v1.
- **Web push (desktop / browser) notifications** are Phase 2 — deferred to a follow-up project. v1 uses the in-app lantern badge only.

---

## User flows

### Sending a cold-open note

1. User navigates to the Lights area.
2. UI shows a compose surface (10–200 chars, soft prompt — gratitude, kindness, a small wish).
3. User can *optionally* attach a country (and state) as a postmark. Stored as a per-message tag — never as a profile-wide setting, so each message is its own decision. Selection persists in `localStorage` so it defaults to last choice, but the user can clear it any time.
4. On send:
   - Cold-start gate: server checks that this user has written ≥ 1 journal entry. If not, returns 403 with a gentle "write something for yourself first" message.
   - Daily rate limit: max 2 cold-open notes per user per local-calendar-day (in user's IANA timezone via `X-User-TZ`). Atomic SQL claim, same pattern as v1.
   - **OpenAI omni-moderation** runs on the plaintext. Hard-reject `hate`, `harassment/threatening`, `sexual/minors`, `violence/graphic`. Self-harm content shows a gentle interstitial with the iCall helpline (India) and offers to either send the note as-is or save it to the user's own journal instead.
   - Plaintext is encrypted under `ENCRYPTION_KEY` (Tier 2). Server can decrypt for future moderation.
   - A new `StrangerThread` is created in `status='unmatched'` with the first `StrangerMessage`.
   - Matching is attempted **synchronously inside the send request** (same `tryDeliverQueued` pattern v1 uses today). If a recipient is found, the thread flips to `status='active'`, `matchedAt` is stamped, and `recipientDisplayName` is generated — all before the request returns.
5. Sender sees their note in the Lights "outgoing" shelf:
   - If matched at send time: *"Your light has reached someone."* (no real identity exposed)
   - If unmatched: *"Your light is traveling through stars. It may reach someone soon."* — the retry cron picks it up later.

### Matching retry (cron fallback for the unmatched case)

When the synchronous match at send time finds no eligible recipient (rare — small user base, everyone blocked, recipient was suspended, etc.), the thread sits in `status='unmatched'`. The retry cron runs every 15 minutes:
1. For each thread in `status='unmatched'` with `matchedAt IS NULL`:
2. Pick a random eligible recipient. Eligibility:
   - `recipient.id != sender.id`
   - `recipient.id` not in `StrangerBlock` rows where `blockerId = sender.id` OR `blockerId = recipient.id` and `blockedId = sender.id` (symmetric block)
   - `recipient.strangerNotesSendingSuspended` is false
   - (v1 deliberately omits: recipient opt-out toggle — deferred; soft-deleted accounts — n/a since none exist; recipient has been-here-recently filter — deferred)
3. Atomically flip `status='active'`, set `recipientId`, stamp `matchedAt`, generate `recipientDisplayName`. Increment recipient's `strangerNotesReceived` counter.
4. If still no eligible recipient exists, leave in `unmatched`. The cron retries on each run. After **30 days unmatched**, the thread (and its message) is hard-deleted by the cleanup pass.

### Receiving a note + replying

1. Recipient opens Lights. Sees a small glow on their lantern + a card in the inbox.
2. The card shows: a per-thread random display name for the sender (e.g., "GentleHeron"), the message text, optional postmark ("from somewhere in Brazil"), and a soft "delivered just now" timestamp (fuzzy — "this morning," "yesterday," not minute-precise).
3. Recipient options:
   - **Reply**: opens a compose surface (10–200 chars). Same moderation pipeline at write. Encrypted Tier 2. Counts as message 2 in the thread. Becomes visible to the original sender the next time they load the inbox.
   - **Skip**: dismisses the note from the inbox. The sender doesn't get a notification of the skip. The note remains in the database (lifecycle continues until silence cleanup), but is hidden from the recipient's UI. *Skipping does NOT prevent future matches with the same sender*; it's purely a UI dismiss.
   - **Block**: same as skip + adds a row to `StrangerBlock`. The sender is filtered from this recipient's future matches forever, and vice versa. Symmetric. The sender is never told they were blocked.

### Mid-thread (exchange in progress)

- Both users can keep replying. Each new message goes through the moderation + Tier 2 encrypt pipeline and becomes visible to the partner on their next inbox load.
- The thread has a `lastActivityAt`. If 30 days pass with no new message from either side, the cleanup cron deletes the thread. (User-perceived silent fade — no notification.)
- Length cap is **10–200 chars per message**, both sides, every turn. Same shape as the opening note; keeps it a note, not an essay.
- New cold-open notes are still rate-limited (2/day). Replies inside an active thread do not count against that limit.

### The wave-back moment

**Trigger condition:** as soon as each side has sent **≥ 3 messages** in the thread (so the thread contains 6+ messages with at least 3 from each user), the wave prompt becomes eligible to surface.

**Surfacing rules:**
- The prompt appears once for each user, the first time that user opens the thread *after* the condition is met. Server stamps `waveOfferedAt` on the user's side of the thread when the UI confirms it has shown the prompt.
- The user has **24 hours from `waveOfferedAt`** to choose Yes / Not now / no action. If they tap Yes, a row is written to `StrangerWave`. If they tap Not now or do nothing for 24h, no row is written.
- Each user is offered the prompt independently. Their `waveOfferedAt` may differ by days if one opens the app much later.

**During the wave window:**
- Either user can continue sending messages while their 24h window is open. The wave is an additional decision, not a precondition for further writing.
- The window only starts ticking once the user's own client has confirmed the prompt was shown (`POST /api/stranger-notes/threads/[id]/wave-offered`). A user who never opens the thread never has a ticking window — but the *partner's* window can still close on its own schedule.
- Once Yes is tapped, that user's wave is locked. They cannot un-wave. (Clean closure: if they regret, the thread either becomes pen-pal anyway, or vanishes if the partner doesn't reciprocate.)
- The wave gesture is a deliberate two-step in the UI (modal confirmation) — low friction for humans, mild friction for automation.

**Mutual detection (server-side):**
- When a `StrangerWave` row is written, the server checks whether the other user already has a row.
- If yes → flip the thread to `status='pen_pal'` and trigger key exchange (see Encryption section). Both users see, on their next session, *"You both waved. From here on, only you two can read these — even Hearth can't."*
- If no → store the wave silently. The other user is not notified.

**The vanish:**
- If both users have been offered the prompt AND neither's 24h window is still open AND fewer than 2 `StrangerWave` rows exist, the thread is marked `status='closed_unwaved'`. 24 hours later, the cleanup cron hard-deletes the thread and all messages.
- The UI shows the thread one last time with a soft line — *"This exchange has folded itself away."* — before the cleanup pass.
- Crucially: neither user ever learns whether the other waved, was offered the prompt, or simply forgot. The asymmetry is the design.

### After mutual wave (pen-pal mode + E2EE)

- Thread moves from the "Lights" shelf to a dedicated **"Pen Pals"** shelf.
- All new messages are end-to-end encrypted under a thread-specific symmetric key (see Encryption section). Server cannot decrypt.
- No daily rate limit on writes to pen-pal threads.
- No 30-day silence expiry on pen-pal threads. They live until either user breaks the connection.
- Pre-wave messages (the first 6+) remain visible, still Tier-2 encrypted at rest. A clear transition marker is shown in the UI between message N and message N+1, where N is the last pre-wave message.
- Either user can **end the pen-pal connection** at any time from the thread settings. The thread is hard-deleted from both sides. No reason is asked, no notification is sent to the partner — the partner simply sees "this stranger has left" the next time they open the thread.

### Account deletion mid-thread

- When a user account is hard-deleted, `onDelete: Cascade` on all stranger-* relations propagates.
- The partner's thread view shows "this stranger has left" in poetic copy. The row itself disappears within 24h via cleanup cron.
- E2EE pen-pal threads also clean up — without the partner's private key (which is wrapped under their master key, now gone), neither side could decrypt anyway.

---

## Display names

Each user gets a randomly-generated display name **per thread**, generated at thread creation and stored on the thread row. The same person you write to and the same person I write to see different generated names *for me*. There is no global handle.

- Format: `${Adjective} ${Noun}` where both lists are curated lists of ~50 pleasant nature words. Approximate space: 50 × 50 = 2,500 combinations. Collisions across different threads are fine (and intended).
- Stored as `senderDisplayName` and `recipientDisplayName` on the thread row. Generated once.
- Identical pool, identical generator on both sides.
- Pre-wave and post-wave: same generated name. The wave changes encryption tier, not identity.

Example names: "Gentle Heron", "Quiet Pine", "Velvet Moth", "Morning Lake", "Slow River", "Warm Lantern". Curated to avoid words with bad cross-cultural readings.

---

## Encryption

### Tier 1 (Pre-wave: Tier 2 server-encrypted)

Messages 1 through the last pre-wave message:
- Encrypted under `ENCRYPTION_KEY` via `src/lib/encryption.ts` `encrypt()` / `decrypt()`, exactly as v1 does today.
- Server can decrypt for moderation purposes.
- This is the same tier as `StrangerNote.content` today — no schema change for the encryption form.

### Tier 2 (Post-wave: Tier 1 E2EE)

Once both users have waved:
- The server marks the thread `pendingKeyExchange = true`.
- The next time either client polls the thread and sees this state, that client generates a fresh AES-256-GCM symmetric key (the **thread key**).
- The client fetches both users' Curve25519 public keys (the partner's from the server; its own from local keypair store).
- It wraps the thread key once for each user using NaCl `box` (ECDH-then-AES-wrap), producing two ~80-byte ciphertexts.
- It posts both wrapped keys to the server. Server stores them on the thread row as `wrappedKeyForSender` and `wrappedKeyForRecipient`. Server clears `pendingKeyExchange`.
- Both clients can now fetch their wrapped key, unwrap it with their own private key (in turn unwrapped under their master key, which is already E2EE infrastructure in Hearth — see `docs/encryption-strategy.md` and `2026-05-01-e2ee-finish-design.md`).
- All new messages are encrypted client-side under the thread key. Server stores ciphertext only.

### Keypair lifecycle

- Each user gets a Curve25519 keypair generated **at first wave-back event**, lazily. (Eager generation at signup is also viable but adds work for users who never use stranger notes.)
- Private key is wrapped under the user's master key (same mechanism as journal E2EE keys).
- Public key is stored server-side in plaintext as `User.strangerPublicKey`.
- If a user does not have a master key set up (no E2EE configured), they cannot wave — instead the wave prompt offers them an "unlock E2EE first" path that takes them through the existing E2EE setup flow before allowing the wave.

### No backfill

Pre-wave messages remain Tier 2. They are not re-encrypted under the thread key after mutual wave.

**Why:** the server already decrypted those messages for moderation. Re-encrypting them under the thread key does not unsee that. Backfill would be aesthetic symmetry with no real privacy gain. Honesty in the UI is a better story: *"From here on, only you two can read these. Even Hearth can't."*

The UI shows a clear horizontal marker at the encryption-tier transition. Pre-wave messages remain readable to the user (their client fetches them Tier-2-decrypted from the server, as today).

---

## Moderation

### At-write moderation (every outgoing message, pre-encryption)

- Plaintext is sent to **OpenAI `omni-moderation-latest`** before encryption.
- Hard-reject (return 400) on: `hate`, `hate/threatening`, `harassment/threatening`, `sexual/minors`, `violence/graphic`, `illicit`.
- **Self-harm**: when `self_harm` or `self_harm/intent` fires, the API response is NOT a rejection. Instead, the client shows a gentle interstitial with a regional crisis-line number plus a clear "you matter" message, and offers two paths:
  - The helpline shown is iCall (India) for launch. The lookup is centralized in `src/lib/helplines.ts` (new) keyed by user locale, so adding US/UK/etc. later is a data change, not a code change.
  - Save this to your own journal instead (creates a private `JournalEntry`).
  - Send it anyway (the server still encrypts and queues it; the recipient sees the message normally).
- This applies to messages 1 through the last pre-wave message. Post-wave messages bypass moderation (E2EE) — see the trust framing below.

### Post-wave: no automated moderation

After mutual wave, the server cannot read messages, so OpenAI moderation is not possible. The justifications:
- The first 6+ messages were moderated. Outright abusive senders would have been caught.
- The mutual wave is itself a trust signal — both users explicitly opted into deeper connection.
- The Block button still works post-wave: it hard-deletes the thread and prevents future matches with that partner (which is moot at this point, since they're already matched into a permanent thread).

### User-facing abuse tools

- **Skip** (per-message): hides the message/thread from inbox. Sender not notified. Future matching not affected.
- **Block** (per-partner): hides the thread and adds a `StrangerBlock` row. Permanently prevents re-matching with that partner. Sender not notified. Symmetric — server filters in either direction. Available on every thread, pre-wave and post-wave.
  - When you block someone, **all other active or pen-pal threads you have with that same partner are also closed** (hard-deleted). In practice this is rare (matching is random), but the invariant should hold: blocking severs the relationship in every dimension.
  - The blocked partner's view of any affected thread surfaces "this stranger has left" the next time they open it — same poetic language as account-deletion. They are never told it was a block.
- **No "Report" button.** Deliberate v1 simplification.

### Deferred: implicit-report threshold

Originally proposed: if user X gets blocked by 3 distinct partners within 7 days, auto-suspend X from sending stranger notes for 30 days, with no admin review.

**v1 omits this**. Acknowledged risk: a bad actor who slips past automated moderation (e.g., consistently uncomfortable but not categorically violating content) can keep targeting new strangers indefinitely. Each individual recipient is protected (they can Block), but the next victim is not.

This is acceptable for launch scale (small initial user base, mostly known-to-founder). It must be revisited before broad scale — track block events with a counter on `User` so the data exists to flip this on later without backfill.

---

## Async-as-feature mechanics

The slowness is the texture — and it's enforced by the medium, not by an artificial sleep timer. Hearth is not a chat app; nobody sits on it refreshing. Specific levers:

- **No delivery jitter.** Matching is synchronous inside the send request (same `tryDeliverQueued` pattern v1 uses today). Once matched, a message is *available to read* the next time the recipient loads the inbox. The "letter traveling" feel comes from the recipient's own sporadic checking, not from a backend sleep.
- **Focus-event refresh.** The inbox refetches on `visibilitychange` (tab gains focus), on route change, and on manual pull-to-refresh. No polling. Lightweight.
- **No read receipts.** `senderLastViewedAt` / `recipientLastViewedAt` exist for the user's own unread badge math, but are **never exposed to the partner.**
- **No typing indicators, no presence, no online status.** Ever.
- **In-app notification only for v1.** The existing lantern badge in the Letters area lights up on next inbox refresh when there is something new (new delivered message, wave eligible, pen-pal flip, thread closed). No emails, no web push, no service worker — **web push is deferred to Phase 2** (see Open questions).
- **Fuzzy timestamps**: "this morning," "yesterday," "a few days ago." Never minute-precise. Reinforces letters, not chat.

---

## Country / postmark

- Optional, per-message. Sender can attach country (required) + state (optional) when sending.
- Stored as plaintext on the message row (`countryCode`, `stateName`).
- Visible to the partner if set, displayed as a "postmark" detail on the message card ("from someone in Brazil" or "from someone in Karnataka, India").
- **Does not affect matching.** Random matching only, for v1.
- Per-message default: localStorage stores the last selection so the picker pre-fills, but the user can always clear it for a single message.

---

## Data model

### New tables

```prisma
model StrangerThread {
  id              String   @id @default(cuid())

  // Anonymous pair. Roles are stable (sender = the user who wrote the cold-open note).
  senderId        String
  sender          User     @relation("SentStrangerThreads", fields: [senderId], references: [id], onDelete: Cascade)
  recipientId     String?
  recipient       User?    @relation("ReceivedStrangerThreads", fields: [recipientId], references: [id], onDelete: Cascade)

  // unmatched | active | pen_pal | closed_unwaved
  status          String   @default("unmatched")

  // Per-thread random display names. The same physical user has different names in different threads.
  senderDisplayName    String
  recipientDisplayName String?  // null until matched

  // Lifecycle timestamps
  createdAt       DateTime  @default(now())
  matchedAt       DateTime?
  lastActivityAt  DateTime  @default(now())
  closedAt        DateTime?

  // Wave state — see StrangerWave for the actual decisions
  senderWaveOfferedAt    DateTime?
  recipientWaveOfferedAt DateTime?

  // E2EE state (post-wave only)
  pendingKeyExchange     Boolean  @default(false)
  wrappedKeyForSender    String?  // base64 NaCl box
  wrappedKeyForRecipient String?

  // Per-side dismiss state. Set by Skip; the thread continues to exist for the other side,
  // and the partner-block (separate StrangerBlock row) is what actually prevents future matching.
  senderDismissedAt      DateTime?
  recipientDismissedAt   DateTime?

  // Per-side "last viewed the thread" for inbox unread badging. Never exposed to the partner —
  // no read receipts. Used only client-side to compute the unread count.
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

  // Pre-wave: AES-256-GCM ciphertext (Tier 2, server can decrypt)
  // Post-wave: AES-256-GCM ciphertext under the thread key (Tier 1, server cannot decrypt)
  content      String   @db.Text

  // Marks which tier this row is encrypted under. Drives client-side decryption.
  // 'server' | 'thread'
  encryptionTier String @default("server")

  // Optional postmark
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

  // The user who initiated the block
  blockerId    String
  blocker      User     @relation("StrangerBlocksInitiated", fields: [blockerId], references: [id], onDelete: Cascade)

  // The user being blocked
  blockedId    String
  blocked      User     @relation("StrangerBlocksReceived", fields: [blockedId], references: [id], onDelete: Cascade)

  createdAt    DateTime  @default(now())

  @@unique([blockerId, blockedId])
  @@index([blockedId])
  @@map("stranger_blocks")
}
```

### User table additions (additive)

```prisma
// In existing User model — add these fields. Existing fields untouched.
strangerPublicKey            String?  // Curve25519 public key (base64). Lazy-generated on first wave.
strangerWrappedPrivateKey    String?  // Private key wrapped under master key. Generated together with public key.
strangerNotesSendingSuspended Boolean @default(false)  // For future implicit-report threshold; unused in v1.
```

The existing `strangerNotesSent`, `strangerNotesReceived`, `lastStrangerNoteSentAt` fields stay. Daily rate limit semantics change from "1/day" to "2/day". The v1 SQL claim pattern (single-row update against `lastStrangerNoteSentAt`) does not extend cleanly to a count-of-2; replace it with a count-of-rows-today check inside the send transaction:

```sql
SELECT COUNT(*) FROM stranger_threads
WHERE "senderId" = $userId
  AND date_trunc('day', "createdAt" AT TIME ZONE $tz)
      = date_trunc('day', now() AT TIME ZONE $tz)
```

Reject (429) if the count is already ≥ 2 before inserting the new thread. The count + insert run inside a single transaction with `SERIALIZABLE` isolation to prevent the read-then-write race that the v1 update-claim originally fixed. `lastStrangerNoteSentAt` continues to be updated for backwards compatibility but is no longer the limit's source of truth.

### Migration plan from v1

The existing `StrangerNote` + `StrangerReply` tables back-fill cleanly:

- Each existing `StrangerNote` row becomes a `StrangerThread` (status mapping: `queued` → `unmatched`, `delivered`/`replied` → `active`) plus one `StrangerMessage` row (its content).
- Each existing `StrangerReply` row becomes a second `StrangerMessage` row on the corresponding thread.
- Existing notes/replies were Tier 2 — set `encryptionTier='server'` on backfilled messages.
- Existing threads in `active` state get `lastActivityAt = matchedAt` or `replyCreatedAt`, whichever is later. The 30-day clock starts from there.
- Existing threads still in `queued` after backfill stay `unmatched`. The 30-day clock starts from `createdAt`.
- Existing notes' display names: generate them at backfill time and stamp the columns. No interactive choice — the backfill picks for everyone.

The migration runs in two phases per the project's additive-only rule:

1. **Phase 1**: add new tables, add new User columns. Dual-write any new sends to both old + new schema. Run backfill. Ship.
2. **Phase 2** (a week later, after verifying parity): API routes start reading from the new tables. Old tables retained but no longer written. Drop old tables in Phase 3.

---

## API surface

All routes require `getCurrentUser()` auth. All routes accept `X-User-TZ` header for local-day calculations where relevant.

### Sending and threads

```
POST   /api/stranger-notes
  Body: { content: string, country?: string, state?: string }
  Behavior: Cold-start gate check → daily limit check → moderation → encrypt → create thread + first message.
  Returns: { threadId, status }

GET    /api/stranger-notes/inbox
  Returns all threads the user is in (sender OR recipient), grouped by shelf:
    - outgoing: status=unmatched threads sent by this user
    - active: status=active threads (matched, both still able to write)
    - penpals: status=pen_pal threads
  Each thread item includes the partner's display name, last message preview (decrypted client-side
  if pen_pal and we have the key), lastActivityAt, unread count.

GET    /api/stranger-notes/threads/[id]
  Returns the full thread: status, displayName-for-partner, all messages, wave-prompt-eligible flag,
  key-exchange-needed flag.

POST   /api/stranger-notes/threads/[id]/messages
  Body: { content: string, country?: string, state?: string, encryptionTier: 'server' | 'thread', ciphertext?: string }
  Behavior:
    - If tier='server': server runs moderation, encrypts plaintext, stores. Daily rate limit does NOT apply (active thread).
    - If tier='thread': client already encrypted under thread key; server stores ciphertext as-is.
       Server validates the thread is in pen_pal state and the user owns the wrapped key.
  Returns: { messageId }

POST   /api/stranger-notes/threads/[id]/wave
  Behavior: writes a StrangerWave row for this user on this thread. Idempotent.
    If this is the second wave row → flips status to pen_pal, sets pendingKeyExchange=true.
  Returns: { waveCount, status }

POST   /api/stranger-notes/threads/[id]/wave-offered
  Behavior: client-side confirms the prompt was actually shown. Server stamps senderWaveOfferedAt
  or recipientWaveOfferedAt for this user. Idempotent.

POST   /api/stranger-notes/threads/[id]/skip
  Behavior: hides the thread from the requester's inbox (sets a per-user dismissed flag — actually
  implemented as a `dismissedAt` timestamp on the thread, per-side). Does not affect matching.

POST   /api/stranger-notes/threads/[id]/block
  Behavior: writes a StrangerBlock row (this user blocks the partner). Hides the thread.
  Returns: { success: true }

DELETE /api/stranger-notes/threads/[id]
  Behavior: only valid for pen_pal threads — ends the pen-pal connection. Cascade-deletes the thread.
```

### E2EE keys

```
POST   /api/stranger-notes/keys/init
  Body: { publicKey: base64, wrappedPrivateKey: base64 }
  Behavior: stores both on the User row. Only allowed if both are currently null. The client generates
  these together — server doesn't see the private key (it's already wrapped under master key).
  Used at first wave attempt.

POST   /api/stranger-notes/threads/[id]/keys
  Body: { wrappedKeyForSender: base64, wrappedKeyForRecipient: base64 }
  Behavior: writes both wrapped thread keys to the thread row. Clears pendingKeyExchange.
  Only one client (the first to poll the thread post-mutual-wave) runs this; subsequent attempts return 409.

GET    /api/stranger-notes/users/[id]/public-key
  Behavior: returns a user's strangerPublicKey, but only if there's at least one pen_pal thread between
  the requester and that user. (Prevents the public-key endpoint from being a user-enumeration vector.)
```

### Cron

Matching is synchronous on the send path (same `tryDeliverQueued` pattern v1 already uses). The only async path is **retry for cold-opens that found no eligible recipient at send time** — uncommon but possible (small user base, everyone blocked, etc.). One retry cron handles that case plus all cleanup.

```
POST   /api/cron/stranger-threads
  Runs every 15 minutes.
  Behavior:
    1. (Retry matching) For each StrangerThread in status='unmatched' where matchedAt IS NULL:
       run matcher (random eligible recipient). If found, flip to status='active', stamp matchedAt,
       generate recipientDisplayName.
    2. (Wave window close) For each StrangerThread in status='active' where:
         - Both senderWaveOfferedAt and recipientWaveOfferedAt are non-null
         - Both are older than 24h
         - Fewer than 2 StrangerWave rows exist
       Set status='closed_unwaved', stamp closedAt = now().
    3. (Cleanup, runs at most once per hour to save cycles):
       - Hard-delete threads in status='unmatched' where createdAt < now() - 30 days.
       - Hard-delete threads in status='active' where lastActivityAt < now() - 30 days.
       - Hard-delete threads in status='closed_unwaved' where closedAt < now() - 24h.
       - (status='pen_pal' threads are never cleaned up automatically.)
```

The cron requires `Authorization: Bearer ${CRON_SECRET}`. Same pattern as existing cron routes. Consolidating retry + wave-window-close + cleanup into one route keeps Vercel cron config small. The cleanup step is rate-limited internally (compare `now()` to a small marker row's `updatedAt`) so the heavy DELETE pass only runs ~once an hour instead of every 15 min — the other two steps run every 15 min.

---

## UI / Frontend changes

### File-level changes

- `src/components/letters/lights/LightsView.tsx` — replaces today's three-mode state machine with a shelf-based inbox + per-thread view. Active mode determines which subcomponent renders.
- `src/components/letters/lights/Mailbox.tsx` — keep the lantern + count, but the inbox dropdown now shows three sections: Outgoing, Active, Pen Pals (when present).
- `src/components/letters/lights/ComposePaper.tsx` — extended to allow optional country/state picker. Same character cap.
- `src/components/letters/lights/ReadPaper.tsx` — becomes `ThreadView`, showing the full message history. Pre-wave messages have the Tier 2 envelope styling; post-wave messages have a different "sealed wax" styling. The transition between the two has a clear marker.
- `src/components/letters/lights/ReplyCard.tsx` — retires (its functionality folds into ThreadView).
- New: `src/components/letters/lights/WavePrompt.tsx` — the modal/inline prompt for the wave-back decision.
- New: `src/components/letters/lights/PenPalShelf.tsx` — separate visual treatment for pen-pal threads (gentler border, no expiry timer).

### Theme integration

Per `CLAUDE.md` rules: every new surface uses `useThemeStore()` for colors. No hardcoded hex literals on backgrounds, text, or borders. The Lights area is rendered inside `LayoutContent`'s standard chrome (no special case needed for full-bleed).

### Notification surface

- Existing nav-level notification dot lights up when:
  - A new message has been delivered to the user
  - A wave prompt is eligible for the user but not yet offered
  - A thread has flipped to pen_pal
- Tapping the dot routes to the Lights area.

### Animations

- Sending a note: a brief "light rising" animation, then the lantern shows it in the outgoing shelf with the soft traveling-through-stars text.
- Receiving a delivered message: the lantern glows on next page load (no real-time push).
- Wave prompt: a small inline ceremony — the thread shows a soft pulse before revealing the prompt.
- Pen-pal transition: when status flips, the thread's frame visually transforms (color shift, new envelope styling) once.

---

## Rate limits, gates, and lifetimes — summary table

| Rule | Value |
|---|---|
| Cold-start gate | ≥ 1 journal entry written |
| New cold-open notes per day | 2 (in user's local TZ) |
| Replies inside active thread | unlimited |
| Replies inside pen-pal thread | unlimited |
| Message length | 10–200 chars (every message, both sides) |
| Delivery model | synchronous match; recipient sees on next inbox load / focus event (no artificial delay) |
| Unmatched thread lifetime | 30 days from createdAt |
| Active thread silence lifetime | 30 days from lastActivityAt |
| Wave prompt trigger | each side has sent ≥ 3 messages |
| Wave decision window | 24h from waveOfferedAt per side |
| Unwaved close → hard delete | 24h after closedAt |
| Pen-pal thread lifetime | indefinite (until either side ends it) |

---

## Open questions / deliberately deferred

1. **Web Push (desktop & web notifications).** Explicitly **Phase 2** — its own follow-up project. v1 uses the in-app lantern badge only (lights up on next inbox refresh). When Phase 2 lands, it adds: service worker file in `/public`, VAPID keypair via env vars, `web-push` npm package, a `PushSubscription` table (subscription + userId + endpoint + keys), a permission-prompt UX moment in the Lights area, and push triggers on the same four events the in-app badge already handles (new delivered message, wave eligible, mutual wave, thread closed). Targets desktop browsers and PWA-installed iOS Safari.
2. **Implicit-report threshold** (block-by-N-users → auto-suspend). Not in v1. Track block counts in `StrangerBlock` so the data exists to flip this on later. Revisit when user base scale demands it.
3. **Real-name reveal in pen-pal threads.** Not in v1. Display names are forever per-thread. A future opt-in reveal gesture is plausible.
4. **Themed boards / location matching.** Country is decoration only in v1. If users start asking for "match me with someone in another country" we can add a weak matching preference.
5. **Email digests** for inactive users with unread messages. Not in v1.
6. **Soft opt-out of receiving** stranger notes (a profile toggle). Not in v1. The matcher's TODO list mentions this — leave it for later.

## Risks acknowledged

- **No reporting flow.** A bad actor can target multiple strangers in sequence. Block protects the individual but not the next person. Mitigations: write-time moderation, slow rate limits, journal-entry gate. Risk owned and accepted for launch scale.
- **Server-side decryption of pre-wave messages.** Hearth holds the keys. The privacy statement to users must make this clear: "we encrypt at rest, but we can read these messages to keep the space safe — and they disappear in 30 days." Don't claim pre-wave is private from Hearth.
- **Key-exchange race conditions.** Two clients may both try to write thread keys simultaneously. Server rejects the second attempt (409). Client handles by re-fetching the thread state — keys are now there, decrypt normally.
- **Lost master key.** If a user resets/loses their master key, their wrapped private key becomes unrecoverable. All their pen-pal threads become unreadable on their side. Match Hearth's existing E2EE behavior: surface this prominently in the master-key-reset flow.
- **Display name collisions across threads.** Acceptable — collisions across different threads do not break anonymity, since you never see two "Gentle Heron"s in the same place.
