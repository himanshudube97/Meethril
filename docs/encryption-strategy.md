# Encryption Strategy in Hearth

> **Snapshot:** 2026-05-16. Reflects the state after Phase 5 letters cleanup + the JournalEntry/Scrapbook E2EE-only follow-up.
> **Read this when:** you're about to add a new content type, touch a model that stores user-authored data, or change an encryption path.

This doc captures the load-bearing decision about WHICH content uses WHICH encryption strategy and WHY. Hearth has three tiers, and the choice between them is per-content-type, not user-level.

---

## The three tiers

### Tier 1 — End-to-end encryption (E2EE) under the user's master key

**Used for: all user-authored sensitive content.**

The user's master key is derived in the browser from their passphrase via PBKDF2 (100k iters, SHA-256). The key never leaves the browser as plaintext — only the wrapped-under-passphrase form (`User.encryptedMasterKey`) is on the server, and unwrapping requires the passphrase. AES-256-GCM with fresh 96-bit IVs per field.

**Server CANNOT decrypt this content.** Even with full DB access. Even with `.env` access. Period.

### Tier 2 — Server-encrypted with `ENCRYPTION_KEY`

**Used for: content the server legitimately needs to read.**

Encrypted with AES-256-GCM under a single server-held key (`ENCRYPTION_KEY` env var) via the helpers in `src/lib/encryption.ts` (`encrypt` / `decrypt` / `safeDecrypt` / `encryptJson` / `decryptJson`).

**Server CAN decrypt this content** — whoever holds `.env` can read it. The threat model is: "protect against database leaks but not against full server compromise."

### Tier 3 — Plaintext

**Used for: metadata the system needs in queries, indexes, foreign keys, and emails.**

Stored as-is. Schedules, recipient emails, status flags, IDs, etc.

---

## Per-content-type assignment

| Content | Tier | Why |
|---|---|---|
| **Letters** (`Letter`, `LetterDelivery`, `LetterDeliveryAsset`) | **1 (E2EE)** | The whole point of the letters feature is privacy. Tier 1 was always the destination; Phase 4 + 4.1 + 5 got us there. |
| **Journal entries** (`JournalEntry.text`, `textPreview`, doodle strokes, photos) | **1 (E2EE)** | The user's diary. The single most sensitive content in the app. |
| **Scrapbook** (`Scrapbook.title`, `Scrapbook.items`, photo bytes) | **1 (E2EE)** | Same as journals — personal creative content. |
| **Profile** (`User.profile` JSON: nickname, birthday, etc.) | **2 (server-encrypted)** | The reminder cron needs to greet users by name. Personalized email subject lines like "Hi Bob, your letter is ready" require the server to read `profile.nickname`. The data is low-sensitivity (nickname, optional birthday) and the UX value of personalized emails outweighs the privacy cost. If this calculus changes, this is the single easiest tier to move to E2EE. |
| **Stranger notes content** (`StrangerNote.text`, `StrangerReply.text`) | **2 (server-encrypted)** | **Permanent architectural decision.** Stranger notes go to anonymous strangers and require moderation to prevent harassment, slurs, sexually explicit content. Moderation requires the server to read content. No moderation = the feature becomes an abuse vector within weeks. The privacy trade is honest in the user-facing copy: *"Stranger notes are encrypted at rest and reviewed by automated filters to keep the community safe."* This will never become E2EE. |
| **Metadata everywhere** (scheduled dates, recipient emails, status flags, foreign keys, timestamps) | **3 (plaintext)** | Indexes need to use it. Crons need to query it. Delivery email needs the recipient address in plaintext. Documented in the privacy copy as a limitation. |

---

## How to decide for a new content type

When adding a new model or column that stores user-generated content, ask in order:

1. **Is it sensitive personal content the user authored?** → Tier 1 (E2EE).
2. **Does the server NEED to read it for a core feature (moderation, cron-driven personalization, etc.) AND is the privacy cost acceptable?** → Tier 2 (server-encrypted). Explicitly document WHY in the model's comments.
3. **Is it system metadata the user doesn't directly author?** → Tier 3 (plaintext).

If you find yourself reaching for Tier 2 for sensitive content, push back. The default for user content is Tier 1.

If you're tempted to make stranger notes Tier 1: re-read the master spec section "Why Hearth can't moderate E2EE content." The decision is final.

---

## What was dropped in Phase 5b

Phase 5 cleanup dropped the server-side encryption path from `JournalEntry` and `Scrapbook` (both had dual-path discriminators left over from pre-E2EE). After Phase 5b:

- `JournalEntry.encryptionType` column: gone.
- `JournalEntry.e2eeIV` column: gone (legacy single-IV; replaced by `e2eeIVs` JSON map of per-field IVs).
- Dual-path branches in entry routes (`POST /api/entries`, `PUT /api/entries/[id]`): gone — always treat body as E2EE.
- `encryptEntryFields` / `decryptEntryFields` helpers in `src/lib/encryption.ts`: gone — they were only for the server path.
- `/api/entries/backfill-batch` route: gone — legacy backfill for migrating server-encrypted to E2EE; no longer needed pre-launch.
- Scrapbook dual-path: gone — always E2EE.
- `/api/scrapbooks/backfill-batch` route: gone for the same reason.

The `encrypt` / `decrypt` / `safeDecrypt` / `encryptJson` / `decryptJson` helpers in `src/lib/encryption.ts` STAY because Tier 2 (profile, stranger notes) still uses them.

---

## Threat model summary

| Attack | Tier 1 (E2EE) | Tier 2 (server-encrypted) | Tier 3 (plaintext) |
|---|---|---|---|
| Database leak | safe | safe | exposed |
| `.env` leak | safe | exposed | exposed |
| Full server compromise | safe | exposed | exposed |
| Compromised user device (after unlock) | exposed | exposed | exposed |
| Compromised user device (locked) | safe (key not in storage; sessionStorage cleared on tab close) | exposed via the server | exposed |
| Hearth team subpoenaed | safe — we cannot produce content | producible | producible |

The honest summary in the user-facing privacy copy:

> "Your diary, your self-letters, your friend letters, your scrapbook — all end-to-end encrypted. Only you can read them. Even we can't.
> Your profile (nickname, birthday) and stranger notes are encrypted at rest. Stranger notes are moderated by automated filters; everything else is for your eyes only.
> Schedules, recipient emails, and the existence of an entry are visible to our servers — we use them to deliver letters, fire reminders, and keep the app running."

---

## References

- Master spec: [`docs/superpowers/plans/2026-05-15-e2ee-first-architecture.md`](superpowers/plans/2026-05-15-e2ee-first-architecture.md) — the original design that introduced this tier model.
- Letters architecture: [`docs/letters-architecture.md`](letters-architecture.md) — letter-specific implementation details.
- Stranger notes design: [`docs/superpowers/specs/2026-05-03-stranger-notes-design.md`](superpowers/specs/2026-05-03-stranger-notes-design.md) — the moderation requirements that pinned strangers to Tier 2.
