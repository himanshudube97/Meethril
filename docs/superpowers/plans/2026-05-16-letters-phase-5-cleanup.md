# Letters Phase 5 — Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** Remove the legacy letter infrastructure now that Phase 4 + 4.1 have replaced it. Pre-launch — no live user data to preserve. Destructive migrations are allowed in this phase (and only this phase).

**Scope (settled in brainstorming):**
- IN: `LetterAccessToken` table + helpers + legacy `/api/letter/[token]` route; `deliver-letters` cron; dead `sendFriendLetterMagicLink` email helper; hardcoded `from:` addresses → env-driven; dual-read JournalEntry fallback; legacy backfill letter rows; `Letter` transitional columns; `JournalEntry` letter columns (except `entryType` which the draft flow still needs).
- OUT: `JournalEntry.entryType` (draft flow uses it); PRELAUNCH-TEST-PILLS (kept for staging testing); the 4 non-letter CRON_SECRET fail-closed fixes; Svix freshness; email-subject CRLF strip — all deferred to separate work.

**Tech Stack:** Existing — Prisma + Postgres, Next.js 16 App Router. `prisma db push` (NOT `migrate dev`) for schema changes because the dev DB's migration history is in a split state (per Phase 4.1 Task 1 finding).

**Reference:** [docs/letters-architecture.md](../../letters-architecture.md) — current state, file map.

---

## Architectural decisions

1. **`db push`, not `migrate dev`.** Existing migration history is split between filesystem (~11 dirs) and DB (~2 applied). Phase 4.1 Task 1 hit this and used `db push`. We do the same.

2. **`entryType` stays.** The compose autosave writes drafts as `JournalEntry { entryType: 'letter' | 'unsent_letter' }`. Sealing deletes the draft. Dropping `entryType` would require restructuring the draft model entirely — separate work.

3. **Dual-read interface keeps stable field names.** `DualReadLetter` still has `text`, `e2eeIVs`, etc. Native Letter rows aliased into that shape (already true post-Phase-4). We just drop the JournalEntry query branch. Consumers don't need to change.

4. **No production rollback path needed.** Pre-launch, no users. Each schema drop is permanent. Smoke-test after each.

---

## File structure

### DELETE
| Path | Why |
|---|---|
| `src/lib/letter-tokens.ts` | Helper for `LetterAccessToken` — table is going away |
| `src/app/api/letter/[token]/route.ts` | Old recipient route — replaced by `/letter/[token]/{meta,ciphertext,asset/[id]}` |
| `src/app/api/cron/deliver-letters/route.ts` | Pre-Phase-4 letter delivery cron — runs over empty set today |

### MODIFY
| Path | Change |
|---|---|
| `prisma/schema.prisma` | Drop `LetterAccessToken` model; drop `Letter.encryptionType`, `Letter.e2eeIV`, `Letter.e2eeIVs`, `Letter.sourceJournalEntryId`; drop the 13 `JournalEntry` letter columns. |
| `src/lib/email.ts` | Delete `sendFriendLetterMagicLink` (and any helpers exclusively used by it). Switch the remaining hardcoded `from: 'Hearth <letters@hearth.app>'` lines (3 spots) to `process.env.RESEND_FROM_LETTERS!`. |
| `src/lib/letters/dual-read.ts` | Drop the JournalEntry query branch in `listLettersForRead` and `findLetterForRead`. Native Letter rows only. |
| 8 letter read routes (inbox, sent, arrived, mine, received, `[id]/peek`, `[id]/viewed`, `[id]/read`) | No code changes expected if they consume `DualReadLetter` interface only. Verify per route — any reference to dropped fields (`encryptionType`, `e2eeIV`) gets pruned. |
| `docs/letters-architecture.md` | Reflect post-cleanup state. |

### NOT touched
- `src/components/letters/compose/*` (compose flow still uses `entryType`).
- `src/app/api/entries/*` (the entry draft flow still uses `entryType`).
- `src/components/letters/SealModal.tsx` (PRELAUNCH-TEST-PILLS scaffolding stays).
- The 4 non-letter crons.
- Phase 4 / 4.1 code.

---

## Task 1: Drop `LetterAccessToken` table + dead helpers + legacy route

**Files:**
- Delete: `src/lib/letter-tokens.ts`
- Delete: `src/app/api/letter/[token]/route.ts`
- Modify: `prisma/schema.prisma` (drop `LetterAccessToken` model)

- [ ] **Step 1: Verify no live references**

```bash
docker compose exec app grep -rn "letterAccessToken\|LetterAccessToken\|letter-tokens\|createAccessToken\|consumeToken" src/ 2>/dev/null | grep -v "node_modules"
```

Expected results (all OK to drop):
- `src/lib/letter-tokens.ts` itself
- `src/app/api/letter/[token]/route.ts` (uses `consumeToken`)
- `src/app/api/cron/deliver-letters/route.ts` (uses `createAccessToken`) — getting deleted in Task 2
- Migrations directory (already-applied SQL — leave alone)

If anything else references these, STOP and report — we're missing a consumer.

- [ ] **Step 2: Delete the files**

```bash
docker compose exec app rm src/lib/letter-tokens.ts 'src/app/api/letter/[token]/route.ts'
```

- [ ] **Step 3: Remove `LetterAccessToken` model from Prisma schema**

Open `prisma/schema.prisma`. Find the `model LetterAccessToken { ... }` block and delete the whole thing. Also remove any reverse relation field on other models — `JournalEntry` may have a `letterAccessTokens LetterAccessToken[]` line; if so, delete that too.

- [ ] **Step 4: Apply schema (destructive)**

```bash
docker compose exec app npx prisma db push --accept-data-loss
```

The `--accept-data-loss` is required because dropping a table is destructive. Expected: clean run, table gone.

- [ ] **Step 5: Verify**

```bash
docker compose exec db psql -U hearth hearth -c "\d letter_access_tokens" 2>&1 | head -5
docker compose exec app npx tsc --noEmit 2>&1 | head -10
```

Expected: `Did not find any relation named "letter_access_tokens"` AND empty tsc output.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(letters): drop LetterAccessToken table + helpers + legacy route"
```

---

## Task 2: Email cleanup — delete `sendFriendLetterMagicLink`, switch hardcoded `from:` to env, delete `deliver-letters` cron

**Files:**
- Modify: `src/lib/email.ts`
- Delete: `src/app/api/cron/deliver-letters/route.ts`

- [ ] **Step 1: Audit the email helpers**

```bash
docker compose exec app grep -nE "^(export )?(async )?function send|^function generate" src/lib/email.ts
docker compose exec app grep -n "Hearth <letters@hearth.app>\|Hearth Letters <letters@hearth.app>" src/lib/email.ts
```

Identify:
- `sendFriendLetterMagicLink` and its private helpers (`generateLetterEmail`, etc.)
- Other `send*` functions that still need to keep working
- The 3 hardcoded `from:` strings

- [ ] **Step 2: Delete `sendFriendLetterMagicLink` + its private-only helpers**

In `src/lib/email.ts`:
- Remove the entire `sendFriendLetterMagicLink` function.
- Remove `generateLetterEmail` (it's only used by `sendFriendLetterMagicLink` — verify with grep before removing).
- Anything else that's only used by `sendFriendLetterMagicLink`: remove.
- Anything used by OTHER live helpers: keep.

Verification grep:
```bash
docker compose exec app grep -n "generateLetterEmail\|sendFriendLetterMagicLink" src/
```

After deletion, only `src/lib/email.ts` itself should match (and only for the comments/declarations that remain — if any).

- [ ] **Step 3: Switch remaining hardcoded `from:` to env-driven**

For each remaining `from: 'Hearth <letters@hearth.app>'` or `from: 'Hearth Letters <letters@hearth.app>'` line in `src/lib/email.ts`:

```typescript
from: process.env.RESEND_FROM_LETTERS!,
```

(Phase 4 helpers `sendFriendLetterTransientEmail` / `sendSelfLetterReminderEmail` / `sendAskForCopyEmail` are already env-driven and throw if unset. This task brings the legacy ones up to the same standard. Use the non-null assertion `!` since the env var is required at startup — same pattern Phase 4 helpers use, just inlined here rather than a separate check.)

- [ ] **Step 4: Delete `deliver-letters` cron**

```bash
docker compose exec app rm 'src/app/api/cron/deliver-letters/route.ts'
```

Then verify nothing references it:
```bash
docker compose exec app grep -rn "deliver-letters\|deliverLetters" src/ 2>/dev/null | grep -v node_modules
```

Expected: empty.

- [ ] **Step 5: Restart + typecheck**

```bash
docker compose restart app && sleep 4
docker compose exec app npx tsc --noEmit 2>&1 | head -15
docker compose logs app --tail=10 2>&1 | grep -E "Ready|error" | head -3
```

Expected: clean. If errors mention missing imports from `letter-tokens` or `email`, fix them (they shouldn't exist if Task 1 was thorough).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(letters): drop sendFriendLetterMagicLink, env-driven from, drop deliver-letters cron"
```

---

## Task 3: Purge legacy test data from DB

This is data hygiene, no code changes. Just SQL.

- [ ] **Step 1: Audit what's in the DB**

```bash
docker compose exec db psql -U hearth hearth -c "
  select
    \"letterType\",
    \"encryptionType\",
    count(*) as n,
    sum(case when \"sourceJournalEntryId\" is not null then 1 else 0 end) as backfilled
  from letters
  group by \"letterType\", \"encryptionType\"
  order by 1, 2;
"
docker compose exec db psql -U hearth hearth -c "
  select count(*) as n, count(distinct \"letterId\") as letters
  from letter_deliveries;
"
```

This shows what we have. Anything with `encryptionType='server'` or `sourceJournalEntryId IS NOT NULL` is legacy backfill — these CAN'T be served correctly post-cleanup (the columns are about to be dropped, and the rendering paths assume native Phase-4 shape).

- [ ] **Step 2: Purge**

```bash
docker compose exec db psql -U hearth hearth -c "
  -- Drop legacy backfill rows. Their content is encrypted with a key
  -- we no longer support (or via JournalEntry whose columns are about
  -- to be dropped). Pre-launch, nobody depends on these.
  delete from letters where \"encryptionType\" = 'server' or \"sourceJournalEntryId\" is not null;

  -- Drop test/smoke delivery rows with obvious fake markers. Anything
  -- with a real publicToken (24-byte base64url, ~32 chars) stays.
  delete from letter_deliveries where \"publicToken\" like 'smoketest_%' or \"publicToken\" like 'test_%';

  -- Any letter_delivery_assets cascade-delete with their parent delivery.
  -- Anything that survived to this point with a clearly-fake ciphertext like
  -- 'deadbeef' / 'fakeciphertext_for_smoke_test' is debris; clean it up too.
  delete from letter_delivery_assets where ciphertext in ('deadbeef', 'fakeciphertext_for_smoke_test');
"
```

- [ ] **Step 3: Confirm state**

```bash
docker compose exec db psql -U hearth hearth -c "
  select
    (select count(*) from letters) as letters,
    (select count(*) from letter_deliveries) as deliveries,
    (select count(*) from letter_delivery_assets) as assets;
"
```

Note the row counts for the audit trail. Any well-formed native Phase-4 rows stay.

- [ ] **Step 4: Commit (data-only, no file changes — skip if nothing to commit)**

```bash
git status --short
```

If clean (no file changes — purge is data-only): no commit needed. Otherwise commit whatever surfaced.

---

## Task 4: Simplify `dual-read.ts` to native Letter only

**Files:**
- Modify: `src/lib/letters/dual-read.ts`
- Verify: 8 letter read routes (no changes expected if the interface stays stable)

- [ ] **Step 1: Read current state**

```bash
docker compose exec app cat src/lib/letters/dual-read.ts
```

Identify the two query paths in `listLettersForRead` and `findLetterForRead`: the JournalEntry-anchored branch and the native Letter branch.

- [ ] **Step 2: Rewrite `listLettersForRead` to query Letter only**

The function should:
- Accept the same arguments as today (`{userId, where, orderBy}`).
- Apply the `where` translation as today (existing filters like `entryType: { in: [...] }` should map to native `letterType` filters — see how the current native branch does this).
- Query `prisma.letter.findMany` and map results into the existing `DualReadLetter` shape, including the IV alias trick (`e2eeIVs.text` and `e2eeIVs.content` both resolve to the single content IV).
- Drop everything related to JournalEntry queries and the fallback merge.

Rough skeleton:

```typescript
export async function listLettersForRead(args: {
  userId: string
  where: Prisma.JournalEntryWhereInput // signature kept for caller-compat
  orderBy?: Prisma.JournalEntryOrderByWithRelationInput
}): Promise<DualReadLetter[]> {
  // Translate the caller's JournalEntry-shaped where into native Letter terms.
  // The existing native branch already does this; lift its logic up.
  const nativeWhere = translateWhereForNative(args.where, args.userId)
  const nativeOrderBy = translateOrderByForNative(args.orderBy)

  const letters = await prisma.letter.findMany({
    where: nativeWhere,
    orderBy: nativeOrderBy,
    select: NATIVE_LETTER_SELECT,
  })

  return letters.map(mapNativeLetter)
}
```

`translateWhereForNative`, `translateOrderByForNative`, `NATIVE_LETTER_SELECT`, and `mapNativeLetter` are essentially the helpers the current native branch already uses inline. Lift them out (or keep inline if it's cleaner). The native branch already knows how to alias `e2eeIVs.text` / `e2eeIVs.content` — preserve that.

For `findLetterForRead`, same idea but single-row.

- [ ] **Step 3: Drop the legacy code paths and dead imports**

After the rewrite, the file should NOT import or reference `journalEntry` from Prisma anywhere (except possibly in the function signature types for caller-compat). Remove any helper that only existed to translate JournalEntry-shaped data.

- [ ] **Step 4: Restart + typecheck**

```bash
docker compose restart app && sleep 4
docker compose exec app npx tsc --noEmit 2>&1 | head -25
```

Expected: clean across the whole project. If a route mentions a field that was only on the JournalEntry branch's shape (e.g., something that doesn't exist on native), surface and adapt.

- [ ] **Step 5: Smoke**

Use the `/api/letters/inbox` route as a quick check. With at least one native self-letter in the DB (the smoke rows from Phase 4 Task 6 should be there):

```bash
docker compose exec db psql -U hearth hearth -At -c "select id from letters where \"letterType\" = 'self' limit 1"
```

If a self-letter exists, you can curl the inbox route. If not, just rely on the typecheck — the read-shape tests already passed in Phase 4 Task 19 testing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/letters/dual-read.ts
git commit -m "chore(letters): drop dual-read JournalEntry fallback, native Letter only"
```

---

## Task 5: Drop `Letter` transitional columns

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/letters/dual-read.ts` (drop column references in the select / mapper)

- [ ] **Step 1: Verify no live consumer**

```bash
docker compose exec app grep -rn "encryptionType\|e2eeIV\|e2eeIVs\|sourceJournalEntryId" src/ 2>/dev/null | grep -v node_modules | grep -v "// "
```

Expected matches:
- `prisma/schema.prisma` (about to remove)
- `src/lib/letters/dual-read.ts` (mapper output — we need to keep the alias trick alive for legacy consumers, but the COLUMN can go since native rows always have contentIVs)
- A handful of route files that pass these fields through to the frontend
- `src/components/letters/letterTypes.ts` (the SentStamp interface)

For each consumer that just passes the field through: figure out if we should:
- (a) Drop the field from the response too (cleanest)
- (b) Synthesize a default in the dual-read mapper so existing consumers don't break

Option (b) is the smaller-blast-radius move. The dual-read mapper synthesizes `encryptionType: 'e2ee'` (constant) and `e2eeIVs: { text: contentIV, content: contentIV }`. Consumers keep working.

- [ ] **Step 2: Drop the columns from the Letter model**

In `prisma/schema.prisma`, find the `Letter` model. Remove these fields:
- `encryptionType String  @default("server")` (or whatever the current default)
- `e2eeIV         String?`
- `e2eeIVs        Json?`
- `sourceJournalEntryId String? @unique`

Also drop the index `@@index([sourceJournalEntryId])` if it's there.

- [ ] **Step 3: Update `dual-read.ts` to not select dropped columns; synthesize replacements**

In `src/lib/letters/dual-read.ts`, the native-letter `select` block needs to drop `encryptionType`, `e2eeIV`, `e2eeIVs`, `sourceJournalEntryId`. The mapper synthesizes them:

```typescript
function mapNativeLetter(l: NativeLetter): DualReadLetter {
  const contentIv = (l.contentIVs as { content?: string } | null)?.content ?? null
  return {
    id: l.id,
    // ...other fields...
    encryptionType: 'e2ee',
    e2eeIV: null,
    e2eeIVs: contentIv ? { text: contentIv, content: contentIv } : null,
    // ...
  }
}
```

This keeps the `DualReadLetter` interface stable so the 8 read routes don't change.

- [ ] **Step 4: Apply schema**

```bash
docker compose exec app npx prisma db push --accept-data-loss
```

Expected: clean run, 4 columns dropped.

- [ ] **Step 5: Verify**

```bash
docker compose exec db psql -U hearth hearth -c "\d letters" | grep -E "encryptionType|e2eeIV|sourceJournalEntryId"
docker compose exec app npx tsc --noEmit 2>&1 | head -15
```

Expected: empty for the psql grep (columns gone), empty for tsc.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(letters): drop Letter transitional columns (encryptionType, e2eeIV, e2eeIVs, sourceJournalEntryId)"
```

---

## Task 6: Drop `JournalEntry` letter columns

**Files:**
- Modify: `prisma/schema.prisma`
- Verify: no consumer reads dropped columns

- [ ] **Step 1: Audit consumers**

```bash
docker compose exec app grep -rnE "unlockDate|isSealed|recipientEmail|recipientName|senderName|letterLocation|isDelivered|deliveredAt|isViewed|letterPeekedAt|isReceivedLetter|originalSenderId|originalEntryId" src/ 2>/dev/null | grep -v node_modules | grep -v "Letter\\.\\|letter\\.\\|letters/" | head -50
```

This greps for the column names BUT excludes hits in files that are about the Letter table (those use these field names too on Letter — keep). Inspect remaining hits — anything that reads these columns FROM a `JournalEntry` row needs to be removed first.

If you find a consumer that reads `journalEntry.unlockDate` etc., that consumer needs to be migrated to read from `Letter` instead, OR removed if it's dead code. Don't drop the columns until consumers are clean.

Most likely findings:
- Compose flow (`ComposeView`, `SealModal`) — uses these locally during compose, doesn't write them to JE anymore post-Phase 4
- Pre-Phase-4 read routes — should already be migrated to dual-read
- `/api/letters/drafts/route.ts` — uses `entryType` but probably not the letter-specific fields

If any consumer can't be cleaned up quickly, STOP and surface — these column drops are the riskiest part of cleanup.

- [ ] **Step 2: Drop the 13 columns from the JournalEntry model**

In `prisma/schema.prisma`, find the `JournalEntry` model. Remove these fields:
- `unlockDate  DateTime?`
- `isSealed    Boolean   @default(false)`
- `recipientEmail String?`
- `recipientName  String?`
- `senderName     String?`
- `letterLocation String?`
- `isDelivered    Boolean   @default(false)`
- `deliveredAt    DateTime?`
- `isViewed       Boolean   @default(false)`
- `letterPeekedAt DateTime?`
- `isReceivedLetter Boolean @default(false)`
- `originalSenderId String?`
- `originalEntryId  String?`

**KEEP** `entryType` and `expiresAt` (entryType is in scope for a future restructure; expiresAt is for ephemeral entries).

- [ ] **Step 3: Apply schema**

```bash
docker compose exec app npx prisma db push --accept-data-loss
```

- [ ] **Step 4: Verify**

```bash
docker compose exec db psql -U hearth hearth -c "\d journal_entries" | grep -E "unlockDate|isSealed|recipientEmail|isReceivedLetter"
docker compose exec app npx tsc --noEmit 2>&1 | head -25
```

Expected: empty for the psql grep, empty for tsc.

If tsc fails on a file that still references one of the dropped fields, fix that file inline — the audit in Step 1 should have caught these, but defense in depth.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(letters): drop JournalEntry letter columns (13 fields)"
```

---

## Task 7: Smoke + doc update

**Files:**
- Modify: `docs/letters-architecture.md`

- [ ] **Step 1: Cold restart**

```bash
docker compose down && docker compose up -d --build
docker compose logs -f app --tail=50
```

Wait for "Ready in …".

- [ ] **Step 2: Compose smoke (self-letter)**

In the browser as a logged-in user with E2EE unlocked:
1. Compose a self-letter, 1-week unlock, seal.
2. Check DB:
   ```bash
   docker compose exec db psql -U hearth hearth -c "
     select id, \"letterType\", \"scheduledFor\", \"contentCiphertext\" is not null as has_content
     from letters where \"letterType\" = 'self' order by \"createdAt\" desc limit 1;
   "
   ```
   Expected: 1 row, content non-null.
3. Force-deliver: `update letters set "scheduledFor" = now() - interval '1 minute', "deliveredAt" = null where ...`
4. Verify the inbox surfaces it.

- [ ] **Step 3: Compose smoke (friend letter, optional if Resend not configured)**

If `RESEND_API_KEY` is set:
1. Compose a friend letter to your test email, "5 min (test)" delay, attach 1 photo.
2. Verify rows in `letters` / `letter_deliveries` / `letter_delivery_assets`.
3. Wait for email, open in incognito, verify decrypt works.

If not configured, skip — Phase 4.1 already tested this flow in isolation. The cleanup didn't touch the write path.

- [ ] **Step 4: Verify no dead references**

```bash
docker compose exec app grep -rn "letterAccessToken\|LetterAccessToken\|letter-tokens\|sendFriendLetterMagicLink\|deliver-letters\|sourceJournalEntryId" src/ 2>/dev/null | grep -v node_modules
```

Expected: empty.

```bash
docker compose exec app grep -rn "Hearth <letters@hearth.app>" src/lib/email.ts
```

Expected: empty (all hardcoded `from:` now env-driven).

- [ ] **Step 5: Update `docs/letters-architecture.md`**

The doc was written assuming dual-read + LetterAccessToken still existed. Update:
- Section 6 (file map): drop the rows for `/api/letter/[token]` (legacy), `/api/cron/deliver-letters`, `src/lib/letter-tokens.ts`, `LetterAccessToken` model.
- Section 4 (dual-read note): update to "queries the Letter table directly" — no fallback.
- Section 8 (known bugs): mark Lower #10 (dead `sendFriendLetterMagicLink`) as FIXED in this phase.
- Section 9 (pre-launch checklist): mark the "Remove dead helpers + legacy routes" item as done.
- Add a one-line note in section 1 or 2: "Post-Phase-5-cleanup: `JournalEntry` letter columns and `Letter` transitional columns are gone. Drafts still use `JournalEntry.entryType` until a future restructure."

- [ ] **Step 6: Final tag + commit**

```bash
git add docs/letters-architecture.md
git commit -m "docs(letters): Phase 5 cleanup shipped — legacy infra removed"
git tag letters-phase-5-cleanup-shipped
```

---

**Phase 5 cleanup complete.** Branch is now the lean post-cleanup state. Phase 7 from the master spec is essentially done (modulo `entryType` and the non-letter CRON fixes, both flagged as future work).
