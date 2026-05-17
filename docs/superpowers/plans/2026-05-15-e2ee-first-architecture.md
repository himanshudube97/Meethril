# E2EE-First Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Scope note:** This is a master spec covering the full E2EE redesign of Hearth. It's organized into 7 phases, each shippable on its own. **Phase 1 has fully detailed bite-sized tasks below.** Phases 2–7 are outlined here and will be expanded into their own detailed plans (one file per phase) at the time each phase begins. This keeps tactical planning fresh against the actual codebase state, rather than locking in line numbers months in advance.

**Goal:** Convert Hearth from optional E2EE into an E2EE-first app, redesign the letters feature with three distinct privacy models (self / friend / stranger), and ship paid-tier monetization through the stranger-notes feature.

**Architecture:** All user-authored content (journal entries, scrapbook photos, self-letters, friend-letters' transit ciphertext, recipient's kept letters) becomes end-to-end encrypted with the user's master key — Hearth's servers cannot decrypt. Friend letters add **time-lock encryption** via Drand so the server can't read during the delivery wait period either. Stranger notes remain server-encrypted (Hearth-readable) because moderation is non-negotiable for that feature and cannot coexist with E2EE. Letters move out of `JournalEntry` into a dedicated `Letter` model with a separate `LetterDelivery` row for the transient delivery vessel.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 5 (Postgres), Resend (email scheduling + webhooks), `tlock-js` + `drand-client` (time-lock encryption), `obscenity` (English profanity filter), OpenAI Moderation API (multilingual content moderation), existing WebCrypto-based master-key flow.

---

## Table of contents

1. [Design decisions (record of what we decided)](#design-decisions)
2. [Target data model](#target-data-model)
3. [Phase roadmap](#phase-roadmap)
4. [Phase 1: Mandatory E2EE onboarding (DETAILED)](#phase-1-mandatory-e2ee-onboarding-detailed)
5. [Phase 2: Letter table extraction + schema migration (OUTLINE)](#phase-2-letter-table-extraction--schema-migration-outline)
6. [Phase 3: Self-letters E2EE flow (OUTLINE)](#phase-3-self-letters-e2ee-flow-outline)
7. [Phase 4: Friend letters E2EE flow with tlock + Resend (OUTLINE)](#phase-4-friend-letters-e2ee-flow-with-tlock--resend-outline)
8. [Phase 5: Stranger notes moderation + paid tier (OUTLINE)](#phase-5-stranger-notes-moderation--paid-tier-outline)
9. [Phase 6: Existing entries re-encryption migration (OUTLINE)](#phase-6-existing-entries-re-encryption-migration-outline)
10. [Phase 7: Deprecation and cleanup (OUTLINE)](#phase-7-deprecation-and-cleanup-outline)
11. [Cross-cutting concerns](#cross-cutting-concerns)

---

## Design decisions

This section captures every decision from the design conversation. It's the source of truth for *why* the architecture is shaped this way. When implementing, refer back to this if you're unsure whether a tradeoff is intentional.

### Why E2EE-first and not optional

- The current opt-in model creates two classes of users and forces every feature to handle both `encryptionType: "server"` and `encryptionType: "e2ee"` paths. This is a sustained tax.
- "E2EE-first" means: every new signup goes through forced passphrase setup before they can use the app. No exceptions. The `encryptionType` field disappears for new content (still tracked for legacy migration).
- This is **not "auto-generate keys for users"** — that's not real E2EE because keys would have to live on the server or in one device's storage. We require an actual user-held secret (passphrase) because there is no other honest way to do E2EE.

### Forgot-passphrase = data loss (the deal users must accept)

- E2EE means **no password reset can ever exist for user content**. If a user loses both their passphrase and their recovery key, their data is permanently gone.
- The recovery key is the only backstop. We must aggressively encourage saving it (download PDF, print, copy to password manager) before letting them complete onboarding.
- This is a feature, not a bug — it's what makes the privacy claim real — but it must be communicated clearly during setup.

### Why a real passphrase, not a 4-digit PIN

- UPI-style PINs work because the *server* rate-limits attempts. With E2EE, the server can't validate — the test is "does the derived key decrypt the blob?" — which an attacker can run offline against a stolen ciphertext.
- A 4-digit PIN has 10,000 possibilities; trivially crackable offline.
- We require a real passphrase: minimum 8 characters or a 4-word diceware phrase. UI framing: *"Write a short sentence you'll remember. Like a favorite line of poetry, or a sentence about your dog."*
- (Future enhancement: passkey/WebAuthn-based device unlock as an upgrade path. Out of scope for v1.)

### Daily passphrase entry, like UPI

- Master key lives in memory for the session only. Tab close, log out, idle timeout → key gets dropped from memory.
- Each new session prompts for passphrase. Recovery key is NOT used for daily unlock (it's the one-time backstop only).

### What "fully E2EE" means in this app

- **Content** (journal text, photos, doodles, song, mood, letter bodies): end-to-end encrypted under the owner's master key. Hearth cannot read.
- **Metadata** (timestamps, mood scores, recipient emails on letters, scheduledFor dates, status flags): plaintext on the server. We do not pursue encrypted indexes / metadata privacy in this redesign. *Documented limitation in the privacy copy.*
- **Stranger notes**: explicitly NOT E2EE — server-encrypted, moderated. We are upfront about this.

### Three letter types, three different privacy models

The redesign separates letters into three flows because they have genuinely different security/UX requirements:

| Type | Crypto | Delivery | Sender can re-read? |
|------|--------|----------|---------------------|
| **Self** | Master-key (E2EE) | Email reminder + in-app reveal on/after unlockDate | Yes — they are the recipient |
| **Friend** | tlock + ephemeral K (E2EE during wait, E2EE post-delivery) | Resend scheduled email (7–30 days), URL-fragment key, 24h read window | **No** — sender holds only a receipt; can pay to *ask* recipient for a copy |
| **Stranger** | Server-encrypted (Hearth-readable) | Instant, in-app | N/A — sender keeps their own copy in their account |

### Why time-lock encryption for friend letters

The "time-delayed delivery + recipient-without-account + true E2EE during the wait" combination is mathematically impossible to achieve naively — *somebody* has to deliver on day X, and that somebody needs to know how to make the content decryptable.

Time-lock encryption (Drand + tlock) solves this by making the decryption key derivable from a future public randomness beacon. During the wait, **even the server holding `tlock_K` cannot decrypt** — the Drand value needed doesn't exist yet. After unlockDate, the value becomes public, and anyone holding `tlock_K` can derive `K`. We deliberately delete `tlock_K` from our server at delivery, so post-delivery only the recipient (via URL fragment) holds it.

The honest threat model: **Hearth's servers cannot read the letter at any lifecycle stage. After delivery, the recipient's email holds the key — your letter is as private as your friend's email account.** Better than today's plaintext; not perfect (no system can be perfect against inbox compromise).

### Why Resend handles friend-letter scheduling (no cron)

- Resend's `scheduled_at` API supports up to 30 days in the future. That fits the friend-letter delay constraints we chose: **7, 15, 20, 30 days, or custom 7–30 days.**
- For self-letters, where delays can be years, we DO use a cron. Resend can't help past 30 days.
- For the friend-letter delivery cron we previously discussed — we don't need it. Resend's webhook (`email.sent`, `email.bounced`) tells us when delivery happens.

### URL-fragment key delivery (friend letters)

- The friend-letter email link is `https://hearth.app/letter/<token>#k=<base64-tlock_K>`.
- The fragment (`#...`) is never transmitted by browsers to servers — it stays client-side, in the recipient's URL bar / clipboard.
- Server stores only the `<token>` for lookups; it never knows `tlock_K`.
- Decryption is fully client-side: page fetches ciphertext from Hearth, fetches the public Drand beacon value for the unlockDate, derives `K`, decrypts.

### 24-hour read window, time-based not count-based

- Earlier idea was "5 reads then disappears" — that has cache/refresh edge cases ("does refresh count?").
- Switched to **"24 hours from first open"** — solves cache/refresh trivially (re-decryption is free during the window) and the mental model is intuitive ("the letter is yours for 24 hours").
- After 24 hours, server returns 410 Gone for subsequent ciphertext fetches and queues the `LetterDelivery` row for deletion.

### "Keep forever" — saving to recipient's account

- Within the 24h window, recipient can click **Keep forever**.
- If recipient isn't a Hearth user, they get magic-link signup → forced E2EE onboarding (same flow as everyone else).
- Once their master key is loaded, their browser re-encrypts the already-decrypted letter content under their master key and uploads as a new `Letter` row owned by them (`isReceivedLetter=true`).
- This is the only way a friend letter survives long-term outside the sender's receipt.
- **Conversion funnel**: this is a primary growth lever — friend letters convert email recipients into Hearth users.

### Sender holds a receipt only (real-letter analogy)

- For friend letters, the sender's row has **no content blob** — just plaintext metadata (recipient, scheduled date, status). They never see what they wrote, by design.
- This mirrors the physical-letter experience: once you put it in the mail, you don't have a copy.
- **Paid feature — "Ask for a copy back"**: sender clicks a button on their receipt → email goes to the recipient → recipient (who has the letter saved in their account) can choose to send a copy back via the same friend-letter flow in reverse. Sender then has 24h to read it. This is emotionally rich and a clean monetization moment.

### Why Hearth can't moderate E2EE content (and what that means for strangers)

- True E2EE means Hearth cannot read the content. Therefore Hearth cannot moderate the content. Therefore E2EE features cannot be moderated.
- **Stranger notes require moderation** (preventing harassment, slurs, sexually explicit content). Without moderation the feature becomes a vector for abuse within weeks.
- Therefore: **stranger notes stay server-encrypted (NOT E2EE).** This is a permanent architectural decision, not a temporary compromise. There is no fancy crypto workaround for this — the tension is fundamental.
- Be honest in the privacy copy: *"Your diary, your self-letters, and your friend letters are end-to-end encrypted — only you (and your friend) can read them. Stranger notes are encrypted at rest and reviewed by automated filters to keep the community safe."*

### Moderation stack for stranger notes

- **First pass**: `obscenity` (npm) for English profanity. Fast (~5ms), handles leet speak, separators, fuzzy match.
- **Hindi/Hinglish supplementary list**: small curated list (50–100 entries) of the most explicit slurs in both Devanagari and roman script.
- **Second pass**: OpenAI Moderation API (`omni-moderation-latest` model). Free, ~100ms, multilingual (Hindi/Hinglish included), returns per-category scores (harassment, hate, sexual, self-harm, violence).
- Tune category thresholds based on the first weeks of logs.
- Add a "Report" button per stranger note as defense in depth. Reports go to a human moderation queue (out of v1 scope; backend ready).

### Paid tier for stranger notes

| Tier | Free | Paid |
|------|------|------|
| Notes sent per day | 1 | 5 |
| Replies per thread | 1 reply back, then thread closes | Unlimited replies in any thread |
| Save a stranger as ongoing penpal | No | Yes |

Reasoning: paid sells **connection depth** (unlimited conversation) more than volume (5/day is modest). This better matches Hearth's quality-over-quantity aesthetic and limits abuse vectors. The "you and Stranger #4271 just had a beautiful exchange — keep talking?" moment is the primary conversion pitch.

### Paid feature: "Ask sender for a copy back"

Tied to the friend-letter receipt. Sender can request the recipient (if they kept the letter) sends a copy back. Same crypto, reversed. Paid because it's a high-emotional-value moment with no infrastructure cost to Hearth.

---

## Target data model

### `User` — additions

No new fields needed. Existing E2EE fields are sufficient:
- `e2eeEnabled`, `encryptedMasterKey`, `masterKeyIV`, `masterKeySalt`, `recoveryKeyHash`, `encryptedMasterKeyRecovery`, `recoveryKeyIV`, `e2eeSetupAt`.

The change is **policy**: `e2eeEnabled` becomes `true` for every user after onboarding completes. Users without it are blocked from app usage by middleware.

For the paid tier additions, existing Lemon Squeezy fields (`subscriptionStatus`, `variantId`, `currentPeriodEnd`) drive entitlement. We may add a derived helper `isPaidUser(user)` rather than a stored boolean.

### `Letter` — new table

Replaces letter rows in `JournalEntry`. Owns both sender's "receipt" and recipient's "kept copy" perspectives.

```prisma
model Letter {
  id           String   @id @default(cuid())
  userId       String   // owner — sender for outgoing, recipient for "kept" copies
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Letter classification
  letterType   String   // "self" | "friend" | "received-friend"
  // "self": user's letter to themselves
  // "friend": sender's receipt for a friend letter (no content blob; transient is what holds content)
  // "received-friend": recipient's kept copy of a friend letter (full content blob, E2EE under recipient's master key)

  // Owner's permanent E2EE content (null for "friend" receipts — sender never has content)
  contentCiphertext String?  // encrypted with owner's master key; text + photos refs + song + doodle refs serialized as JSON before encryption
  contentIVs        Json?    // per-field IVs map
  title             String?  // encrypted title for the letter (optional, set by sender)
  titleIV           String?

  // Plaintext metadata
  recipientEmail String?   // for friend & received-friend; null for self
  recipientName  String?
  senderName     String?   // for received-friend, the original sender's display name
  letterLocation String?   // "Where you wrote this"
  scheduledFor   DateTime  // for self & friend: when the letter unlocks/delivers. For received-friend: same as the original.

  // Provenance
  originalSenderId   String?   // for received-friend: the sender's userId
  originalLetterId   String?   // for received-friend: the sender's Letter.id (their receipt)

  // Status metadata (populated as lifecycle progresses)
  deliveredAt        DateTime?  // for self: cron set when email sent. For friend: Resend webhook set when sent.
  firstReadAt        DateTime?  // for friend (receipt-side mirror of LetterDelivery.firstReadAt) and self (when user revealed it)
  savedByRecipientAt DateTime?  // for friend: when recipient clicked "Keep forever"
  bouncedAt          DateTime?
  bouncedReason      String?

  // Soft archive for sender-initiated hides
  isArchived  Boolean  @default(false)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  delivery    LetterDelivery?

  @@index([userId, letterType, isArchived])
  @@index([scheduledFor, deliveredAt])  // for self-letter cron
  @@map("letters")
}
```

### `LetterDelivery` — new table

The transient delivery vessel for friend letters. **Only friend letters get a row here.** Self-letters don't (no third-party delivery), and stranger notes don't (different flow entirely).

```prisma
model LetterDelivery {
  id                  String   @id @default(cuid())
  letterId            String   @unique
  letter              Letter   @relation(fields: [letterId], references: [id], onDelete: Cascade)

  // The ciphertext that gets delivered. Encrypted with random per-letter K (NOT the master key).
  transientCiphertext String   // letter content as one E2EE blob (text, photos refs, song, etc.)
  transientIV         String

  // K time-locked to letter.scheduledFor via Drand
  tlockedKey          String   // tlock(K, drand_round_for_scheduledFor)

  // Public token used in the URL path. Fragment carries tlockedKey.
  publicToken         String   @unique  // cuid, used in /letter/<token>

  // Resend tracking
  resendEmailId       String?

  // 24h read window tracking
  firstReadAt         DateTime?   // set on first successful GET of ciphertext
  transientExpiresAt  DateTime?   // = firstReadAt + 24h; nullable until first read

  createdAt           DateTime @default(now())

  @@index([transientExpiresAt])  // for cleanup cron
  @@index([publicToken])
  @@map("letter_deliveries")
}
```

### `StrangerNote`, `StrangerReply` — modifications

Existing schema is mostly correct. Modifications needed:
- Add `repliesAllowed Int` to `StrangerNote` — defaulted by paid tier of recipient (1 for free, unlimited represented as -1 or a high cap).
- Add `replyCount Int` to track replies in the thread.
- For paid "save as penpal" feature: a new table or a flag — TBD in Phase 5.

### `JournalEntry` — preserved with deprecations

Letter-specific fields on `JournalEntry` (`unlockDate`, `isSealed`, `recipientEmail`, `recipientName`, `senderName`, `letterLocation`, `isDelivered`, `deliveredAt`, `isViewed`, `letterPeekedAt`, `isReceivedLetter`, `originalSenderId`, `originalEntryId`) and `entryType` discriminator → **deprecated, not removed**, in Phase 2. They stay null on new entries. Phase 7 cleans them up if rollout is stable.

`encryptionType` field on `JournalEntry` → deprecated. After Phase 6, all entries are E2EE. We keep the field for backward read compatibility for one release, then remove.

`LetterAccessToken` table → **retired in Phase 4**. The new `LetterDelivery.publicToken` replaces it. After migration, drop the table.

---

## Phase roadmap

Each phase is independently shippable: at the end of each phase, the app is in a coherent working state. A phase can be paused, reviewed in production, and the next phase resumed later.

| Phase | Scope | Ships |
|------|-------|-------|
| **1** | Mandatory E2EE onboarding — force every new signup through passphrase + recovery key setup. Block app usage for users who haven't completed it. | New users get E2EE by default. Existing optional flow stays available for legacy users. |
| **2** | Letter table extraction — create `Letter` + `LetterDelivery` tables, backfill from `JournalEntry`, dual-read for one release. | Letters can be read from either table. No new functionality yet. |
| **3** | Self-letters E2EE flow — encrypt with master key, daily cron for email reminders, in-app reveal. Write/read paths use the new `Letter` model. | Self-letters work end-to-end through the new model and are encrypted. |
| **4** | Friend letters E2EE flow — tlock-js integration, Resend scheduled send, URL-fragment key delivery, 24h read window, "Keep forever" flow, magic-link signup, receipt UI, "Ask for copy" paid feature. | Full friend-letter feature shipped. The most complex phase. |
| **5** | Stranger notes moderation + paid tier — `obscenity` + OpenAI Moderation, free/paid limits (1 vs 5/day), unlimited replies for paid, "save as penpal" feature. | Stranger feature is safe to run at volume; first monetization hook lives. |
| **6** | Existing entries re-encryption migration — UI flow to re-encrypt server-encrypted entries under master key. Required before Phase 7. | Existing users' legacy entries become E2EE. |
| **7** | Deprecation & cleanup — drop deprecated letter fields on `JournalEntry`, remove old letter routes, retire `LetterAccessToken`, remove `encryptionType` field. | Codebase is leaner; no dual paths. |

---

## Phase 1: Mandatory E2EE onboarding (DETAILED)

**Goal:** Every new signup is forced through E2EE passphrase + recovery key setup before they can use the app. Users without complete E2EE setup are redirected to an onboarding modal that cannot be dismissed without completing setup.

**Files to create:**
- `src/components/onboarding/E2EEOnboardingModal.tsx` — multi-step setup modal
- `src/components/onboarding/PassphraseStep.tsx` — step 1: choose passphrase
- `src/components/onboarding/RecoveryKeyStep.tsx` — step 2: download/save recovery key
- `src/components/onboarding/ConfirmStep.tsx` — step 3: confirm + finalize
- `src/lib/auth/onboarding-guard.ts` — server-side helper for redirect logic
- `src/hooks/useE2EEOnboarding.ts` — client hook

**Files to modify:**
- `middleware.ts` — redirect signed-in users without E2EE to onboarding
- `src/app/layout.tsx` — render onboarding modal globally when needed
- `src/app/security/page.tsx` — keep for users to manage existing setup; remove from primary signup path
- `src/lib/auth/index.ts` — surface E2EE status on `getCurrentUser()` return type

**Manual verification at end of phase:** Sign up as a brand-new user via dev auth. Confirm you cannot reach `/me`, `/diary`, or any content route without first completing onboarding. Confirm passphrase + recovery key save flow works end-to-end. Confirm signing out and back in prompts for passphrase (not full re-onboarding).

---

### Task 1: Add `hasCompletedE2EEOnboarding` helper

**Files:**
- Modify: `src/lib/auth/index.ts` (whichever file exports `getCurrentUser`)

- [ ] **Step 1: Read the current `getCurrentUser` shape**

Run:
```bash
docker compose exec app cat src/lib/auth/index.ts | head -80
```

Identify the return type of `getCurrentUser()`. Confirm it returns the User row from Prisma.

- [ ] **Step 2: Add a helper to check onboarding status**

Append to `src/lib/auth/index.ts` (or create `src/lib/auth/e2ee-status.ts` if you prefer separation):

```typescript
/**
 * Returns true if the user has completed mandatory E2EE setup.
 * A user is "onboarded" when they have both an encryptedMasterKey (passphrase wrap)
 * and a recoveryKeyHash (recovery key was generated and acknowledged saved).
 */
export function hasCompletedE2EEOnboarding(user: {
  e2eeEnabled: boolean
  encryptedMasterKey: string | null
  recoveryKeyHash: string | null
}): boolean {
  return (
    user.e2eeEnabled &&
    user.encryptedMasterKey !== null &&
    user.recoveryKeyHash !== null
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/
git commit -m "feat(e2ee): add hasCompletedE2EEOnboarding helper"
```

---

### Task 2: Server-side redirect in middleware

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Read current middleware to understand auth check pattern**

Run:
```bash
docker compose exec app cat middleware.ts
```

- [ ] **Step 2: Add `/onboarding` to public paths and add E2EE check**

Modify `middleware.ts` so authenticated users WITHOUT completed onboarding are redirected to `/onboarding`, while users WITH completed onboarding visiting `/onboarding` are redirected away:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// ... existing imports

// Add /onboarding to PUBLIC_PATHS allowlist
const PUBLIC_PATHS = [
  '/', '/login', '/pricing',
  '/onboarding',  // <-- add
  '/api/auth', '/api/webhooks',
  // ... whatever else is there
]

export async function middleware(req: NextRequest) {
  // ... existing auth check, e.g. await getCurrentUser(req)
  const user = /* however middleware fetches user */

  if (user) {
    const onboarded = user.e2eeEnabled && user.encryptedMasterKey && user.recoveryKeyHash
    const path = req.nextUrl.pathname

    // Force unonboarded users to /onboarding for any non-public path
    if (!onboarded && !PUBLIC_PATHS.some(p => path.startsWith(p))) {
      return NextResponse.redirect(new URL('/onboarding', req.url))
    }

    // Send onboarded users away from /onboarding
    if (onboarded && path.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/me', req.url))
    }
  }

  // ... rest of existing middleware
}
```

**Note:** the exact way to fetch the user in middleware depends on your existing auth setup (dev JWT vs Supabase). Follow whatever pattern already exists in `middleware.ts`.

- [ ] **Step 3: Restart and verify middleware compiles**

Run:
```bash
docker compose restart app
docker compose logs -f app --tail=50
```

Expected: clean restart, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(e2ee): redirect non-onboarded users to /onboarding"
```

---

### Task 3: Create the onboarding page shell

**Files:**
- Create: `src/app/onboarding/page.tsx`
- Create: `src/app/onboarding/layout.tsx` (minimal, to suppress nav chrome)

- [ ] **Step 1: Create the layout**

```typescript
// src/app/onboarding/layout.tsx
import type { ReactNode } from 'react'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f6efe2] text-[#3d342a]">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create the page shell that renders the modal**

```typescript
// src/app/onboarding/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { hasCompletedE2EEOnboarding } from '@/lib/auth'
import { E2EEOnboardingModal } from '@/components/onboarding/E2EEOnboardingModal'

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (hasCompletedE2EEOnboarding(user)) redirect('/me')

  return <E2EEOnboardingModal userName={user.name ?? ''} />
}
```

- [ ] **Step 3: Restart, visit /onboarding while logged out, confirm redirect to /login**

```bash
docker compose restart app
```

Manually visit `http://localhost:3111/onboarding` in incognito → should redirect to login.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/
git commit -m "feat(e2ee): scaffold /onboarding route"
```

---

### Task 4: Build the `E2EEOnboardingModal` component shell

**Files:**
- Create: `src/components/onboarding/E2EEOnboardingModal.tsx`

- [ ] **Step 1: Build the modal with step state**

```typescript
// src/components/onboarding/E2EEOnboardingModal.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PassphraseStep } from './PassphraseStep'
import { RecoveryKeyStep } from './RecoveryKeyStep'
import { ConfirmStep } from './ConfirmStep'

type Step = 'intro' | 'passphrase' | 'recovery' | 'confirm' | 'done'

export function E2EEOnboardingModal({ userName }: { userName: string }) {
  const [step, setStep] = useState<Step>('intro')
  const [passphrase, setPassphrase] = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <h1 className="font-serif text-3xl mb-4">
                Welcome to Hearth, {userName || 'friend'}.
              </h1>
              <p className="mb-2 leading-relaxed">
                Before you start writing, we need to set up encryption.
              </p>
              <p className="mb-6 leading-relaxed">
                Everything you write here — your diary, your letters, your
                photos — should only be readable by you. Even we can&apos;t
                see it. This is how we promise that.
              </p>
              <p className="mb-6 text-sm opacity-70">
                It takes about a minute. You&apos;ll set a memorable phrase
                (like a UPI PIN you type once a day), and we&apos;ll give you
                a recovery key in case you ever forget.
              </p>
              <button
                onClick={() => setStep('passphrase')}
                className="px-6 py-3 bg-[#3d342a] text-[#f6efe2] rounded-full"
              >
                Let&apos;s set it up
              </button>
            </motion.div>
          )}

          {step === 'passphrase' && (
            <PassphraseStep
              key="passphrase"
              onComplete={(pp) => {
                setPassphrase(pp)
                setStep('recovery')
              }}
            />
          )}

          {step === 'recovery' && (
            <RecoveryKeyStep
              key="recovery"
              passphrase={passphrase}
              onComplete={(rk) => {
                setRecoveryKey(rk)
                setStep('confirm')
              }}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              key="confirm"
              passphrase={passphrase}
              recoveryKey={recoveryKey}
              onComplete={() => {
                // hard redirect so middleware re-evaluates
                window.location.href = '/me'
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit (stub state — children don't exist yet, will fail to import)**

Skip this commit for now — see next tasks. Actually, comment out the imports for `PassphraseStep`, `RecoveryKeyStep`, `ConfirmStep` and their usages so the file compiles, then commit. Uncomment as each step is built.

Cleaner alternative: do steps in order — build the children first (tasks 5, 6, 7), then come back to this task. Skip step 2 of this task; revisit at the end.

---

### Task 5: Build `PassphraseStep`

**Files:**
- Create: `src/components/onboarding/PassphraseStep.tsx`

- [ ] **Step 1: Build the passphrase entry UI with strength check**

```typescript
// src/components/onboarding/PassphraseStep.tsx
'use client'

import { useState } from 'react'

export function PassphraseStep({ onComplete }: { onComplete: (pp: string) => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)

  const tooShort = passphrase.length > 0 && passphrase.length < 8
  const mismatch = confirm.length > 0 && confirm !== passphrase
  const valid = passphrase.length >= 8 && passphrase === confirm

  return (
    <div>
      <h2 className="font-serif text-2xl mb-3">Choose your memorable phrase.</h2>
      <p className="text-sm opacity-70 mb-6 leading-relaxed">
        This is your daily key. Pick something only you would write — a
        sentence about your dog, a line of poetry, a phrase that means
        something to you. Aim for at least 8 characters.
      </p>

      <label className="block text-xs uppercase tracking-wider mb-2 opacity-60">
        Your phrase
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="e.g. coffee with mira in the rain"
        className="w-full px-4 py-3 mb-3 border border-[#3d342a]/20 rounded-lg bg-white/50"
        autoFocus
      />

      <label className="block text-xs uppercase tracking-wider mb-2 opacity-60">
        Type it again to be sure
      </label>
      <input
        type={show ? 'text' : 'password'}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full px-4 py-3 mb-3 border border-[#3d342a]/20 rounded-lg bg-white/50"
      />

      <label className="text-sm flex items-center gap-2 mb-6 opacity-70">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
        />
        Show what I&apos;m typing
      </label>

      {tooShort && (
        <p className="text-sm text-amber-700 mb-3">
          Just a little longer — 8 characters at minimum.
        </p>
      )}
      {mismatch && (
        <p className="text-sm text-amber-700 mb-3">
          The two phrases don&apos;t match.
        </p>
      )}

      <p className="text-xs opacity-60 mb-6 italic leading-relaxed">
        Important: if you forget this phrase, we cannot reset it. Even we
        don&apos;t know what it is — that&apos;s how this works. You&apos;ll get a
        recovery key next as a backup.
      </p>

      <button
        disabled={!valid}
        onClick={() => onComplete(passphrase)}
        className="px-6 py-3 bg-[#3d342a] text-[#f6efe2] rounded-full disabled:opacity-30"
      >
        Continue
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/PassphraseStep.tsx
git commit -m "feat(e2ee): passphrase entry step"
```

---

### Task 6: Build `RecoveryKeyStep`

**Files:**
- Create: `src/components/onboarding/RecoveryKeyStep.tsx`

- [ ] **Step 1: Generate the recovery key on mount, render it for save**

```typescript
// src/components/onboarding/RecoveryKeyStep.tsx
'use client'

import { useEffect, useState } from 'react'
import { generateRecoveryKey } from '@/lib/e2ee/crypto'  // confirm the actual export name in src/lib/e2ee/crypto.ts

export function RecoveryKeyStep({
  passphrase,
  onComplete,
}: {
  passphrase: string
  onComplete: (rk: string) => void
}) {
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Generate once on mount. If the export name in crypto.ts is different,
    // adjust the import above.
    setRecoveryKey(generateRecoveryKey())
  }, [])

  if (!recoveryKey) return <p>Generating your recovery key...</p>

  return (
    <div>
      <h2 className="font-serif text-2xl mb-3">Save your recovery key.</h2>
      <p className="text-sm opacity-70 mb-6 leading-relaxed">
        This is your only way back in if you ever forget your phrase. Save
        it somewhere safe — a password manager, a printed copy, an email to
        yourself. We don&apos;t keep a copy.
      </p>

      <div className="font-mono text-lg p-6 bg-white border border-[#3d342a]/20 rounded-lg mb-4 break-all select-all">
        {recoveryKey}
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            navigator.clipboard.writeText(recoveryKey)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="px-4 py-2 border border-[#3d342a]/30 rounded-full text-sm"
        >
          {copied ? 'Copied' : 'Copy to clipboard'}
        </button>
        <button
          onClick={() => downloadRecoveryKey(recoveryKey)}
          className="px-4 py-2 border border-[#3d342a]/30 rounded-full text-sm"
        >
          Download as .txt
        </button>
      </div>

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <span className="text-sm leading-relaxed">
          I&apos;ve saved my recovery key somewhere I can find it again. I
          understand that if I lose both my phrase and this key, my data
          cannot be recovered.
        </span>
      </label>

      <button
        disabled={!acknowledged}
        onClick={() => onComplete(recoveryKey)}
        className="px-6 py-3 bg-[#3d342a] text-[#f6efe2] rounded-full disabled:opacity-30"
      >
        I&apos;ve saved it — continue
      </button>
    </div>
  )
}

function downloadRecoveryKey(key: string) {
  const blob = new Blob(
    [
      `Your Hearth recovery key:\n\n${key}\n\nKeep this safe. Together with your phrase, it's the only way back into your encrypted data.\n`,
    ],
    { type: 'text/plain' }
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'hearth-recovery-key.txt'
  a.click()
  URL.revokeObjectURL(url)
}
```

**Note on the `generateRecoveryKey` import:** Verify the actual export name in `src/lib/e2ee/crypto.ts`. If it doesn't exist as a single-call generator, you may need to compose it from primitives there. Confirm by running:

```bash
docker compose exec app grep -n "export" src/lib/e2ee/crypto.ts
```

If no suitable export exists, add one to `crypto.ts`:

```typescript
export function generateRecoveryKey(): string {
  // 32 random bytes as 8 groups of 4 hex chars separated by dashes
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .match(/.{1,4}/g)!
    .join('-')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/RecoveryKeyStep.tsx src/lib/e2ee/crypto.ts
git commit -m "feat(e2ee): recovery key generation + save step"
```

---

### Task 7: Build `ConfirmStep` — derives keys, calls existing setup API

**Files:**
- Create: `src/components/onboarding/ConfirmStep.tsx`

- [ ] **Step 1: Wire up the actual crypto + setup API call**

The existing `/api/e2ee/setup` route expects these fields: `encryptedMasterKey, masterKeyIV, masterKeySalt, recoveryKeyHash, encryptedMasterKeyRecovery, recoveryKeyIV`. Re-use whatever existing helpers in `src/lib/e2ee/crypto.ts` derive these from `(passphrase, recoveryKey)`.

```typescript
// src/components/onboarding/ConfirmStep.tsx
'use client'

import { useState } from 'react'
import {
  generateMasterKey,
  deriveKeyFromPassphrase,
  encryptMasterKey,
  hashRecoveryKey,
  encryptMasterKeyWithRecoveryKey,
} from '@/lib/e2ee/crypto'  // verify exact export names; adjust as needed

export function ConfirmStep({
  passphrase,
  recoveryKey,
  onComplete,
}: {
  passphrase: string
  recoveryKey: string
  onComplete: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function finalize() {
    setBusy(true)
    setError(null)
    try {
      // 1. Generate a fresh random master key
      const masterKey = await generateMasterKey()

      // 2. Derive a wrapping key from the passphrase
      const { wrappingKey, salt } = await deriveKeyFromPassphrase(passphrase)

      // 3. Encrypt the master key with the passphrase-derived wrapping key
      const { ciphertext: encryptedMasterKey, iv: masterKeyIV } =
        await encryptMasterKey(masterKey, wrappingKey)

      // 4. Hash the recovery key (for verification later)
      const recoveryKeyHash = await hashRecoveryKey(recoveryKey)

      // 5. Encrypt the master key under the recovery key too (the backup wrap)
      const {
        ciphertext: encryptedMasterKeyRecovery,
        iv: recoveryKeyIV,
      } = await encryptMasterKeyWithRecoveryKey(masterKey, recoveryKey)

      // 6. POST everything to the existing setup endpoint
      const res = await fetch('/api/e2ee/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedMasterKey,
          masterKeyIV,
          masterKeySalt: salt,
          recoveryKeyHash,
          encryptedMasterKeyRecovery,
          recoveryKeyIV,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Setup failed (${res.status})`)
      }

      // 7. Hand master key to the session store so the user is unlocked already
      // (Use whatever existing zustand store / context Hearth uses for the
      // in-memory master key. Check src/store/ for the pattern.)
      // Example:
      // useE2EEStore.getState().setMasterKey(masterKey)

      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl mb-3">One last check.</h2>
      <p className="mb-6 leading-relaxed">
        You&apos;re about to encrypt your account with the phrase you just set.
        From now on, you&apos;ll type that phrase once a day to unlock your
        diary. Ready?
      </p>

      {error && (
        <p className="text-sm text-red-700 mb-4 p-3 bg-red-50 rounded">
          {error}
        </p>
      )}

      <button
        disabled={busy}
        onClick={finalize}
        className="px-6 py-3 bg-[#3d342a] text-[#f6efe2] rounded-full disabled:opacity-30"
      >
        {busy ? 'Setting up...' : 'Lock it in'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify the import names**

Run:
```bash
docker compose exec app grep -nE "^export (function|const)" src/lib/e2ee/crypto.ts
```

Adjust the imports in `ConfirmStep.tsx` to match whatever the real export names are.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/ConfirmStep.tsx
git commit -m "feat(e2ee): confirm step finalizes setup via existing API"
```

---

### Task 8: Back to `E2EEOnboardingModal` — wire imports and commit

**Files:**
- Modify: `src/components/onboarding/E2EEOnboardingModal.tsx`

- [ ] **Step 1: Ensure all three step imports are uncommented and the file compiles**

Already written in Task 4. Just confirm it builds:

```bash
docker compose exec app npx tsc --noEmit
```

Expected: no errors related to onboarding files.

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/E2EEOnboardingModal.tsx
git commit -m "feat(e2ee): wire up onboarding modal steps"
```

---

### Task 9: Update `/login` and signup flows to send new users to `/onboarding`

**Files:**
- Modify: relevant auth callback / signup handler (typically `src/app/api/auth/*` — exact path depends on dev vs Supabase flow)

- [ ] **Step 1: Identify where signed-in redirect happens after login/signup**

```bash
docker compose exec app grep -rn "redirect.*\\/me\\|redirect.*home\\|/me'" src/app/api/auth/ src/app/login/
```

- [ ] **Step 2: Replace post-login redirect target with conditional**

After a successful login/signup, instead of always redirecting to `/me`, redirect based on E2EE status. Easiest: just redirect to `/me` and let middleware kick in to send them to `/onboarding`. **No code change needed if middleware is correct** — verify by manually testing.

- [ ] **Step 3: Manual test**

1. `docker compose up -d`
2. In incognito, complete a fresh dev-auth signup (or Supabase OAuth)
3. After login, you should land on `/onboarding`, not `/me`
4. Complete passphrase → recovery → confirm flow
5. Confirm you land on `/me` after finishing
6. Sign out, sign back in → confirm you land on `/me` directly (already onboarded)
7. (If applicable) Visit `/onboarding` directly while onboarded → confirm redirect to `/me`

- [ ] **Step 4: Commit (if any code changed)**

```bash
git add -A
git commit -m "feat(e2ee): post-login routing flows through middleware E2EE check"
```

---

### Task 10: Daily passphrase unlock prompt (post-onboarding)

Onboarding gets users encrypted. But once they're onboarded, every new session needs them to enter their passphrase to load the master key into memory. This task adds (or refines) that prompt.

**Files:**
- Check existing: `src/store/` for any e2ee/master-key store
- Likely modify: existing unlock UI in `src/app/security/` or a new `src/components/UnlockPrompt.tsx`

- [ ] **Step 1: Audit existing daily unlock UI**

```bash
docker compose exec app grep -rn "masterKey\|unlockE2EE\|enterPassphrase" src/components src/app | head -30
```

Determine whether daily unlock UI already exists in usable form. If yes, **just ensure it's invoked when an onboarded user has no master key in memory** (e.g., fresh tab, post-refresh).

- [ ] **Step 2: Hook the unlock prompt into the global layout**

In `src/app/layout.tsx` (or whatever wraps authenticated pages), conditionally render an `<UnlockPrompt />` when:
- user is signed in
- user is onboarded (`hasCompletedE2EEOnboarding`)
- master key is NOT in memory (zustand store check)

```typescript
'use client'
import { useE2EEStore } from '@/store/e2ee'  // verify path
// ...

const masterKeyLoaded = useE2EEStore((s) => Boolean(s.masterKey))

return (
  <>
    {user && onboarded && !masterKeyLoaded && <UnlockPrompt />}
    {children}
  </>
)
```

- [ ] **Step 3: Manual verify**

Sign in (already onboarded user), close tab, reopen. Confirm the unlock prompt appears and accepts the passphrase.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(e2ee): show unlock prompt when master key not in memory"
```

---

### Task 11: Final smoke test of Phase 1

- [ ] **Step 1: Cold-start the app**

```bash
docker compose down
docker compose up -d --build
docker compose logs -f app --tail=100
```

- [ ] **Step 2: Run through the full happy path manually**

In an incognito window:

1. Sign up new user (dev auth: `support+test1@local` or whatever).
2. Land on `/onboarding`.
3. Try to navigate to `/me`, `/diary`, `/letters` — verify redirect back to `/onboarding`.
4. Complete passphrase step (try too-short, mismatch → confirm errors).
5. Complete recovery key step (download → verify file content).
6. Complete confirm step → land on `/me`.
7. Sign out → sign back in → land on `/me` directly.
8. Close tab → reopen → unlock prompt appears, accepts passphrase.

- [ ] **Step 3: Commit nothing (just verification). Tag the working state if desired:**

```bash
git tag e2ee-onboarding-shipped
```

---

**Phase 1 complete.** You have an app where every new user is forced into E2EE setup. Existing users (without E2EE) are still allowed in via the optional `/security` flow for now — Phase 6 handles their forced migration.

---

## Phase 2: Letter table extraction + schema migration (OUTLINE)

**Goal:** Create `Letter` and `LetterDelivery` tables, backfill letter rows from `JournalEntry`, dual-read for one release, then cut letter reads over to the new tables.

**Key work:**
- Add `Letter` and `LetterDelivery` Prisma models (definitions in [Target data model](#target-data-model)). Additive migration only.
- Run a one-time backfill: for every `JournalEntry` with `entryType IN ('letter', 'unsent_letter')`, create a corresponding `Letter` row. Note: existing letters are not yet in the new tlock/transient model — they're treated as legacy and migrated forward with `letterType: 'self'` (since current letter content is encrypted with the user's master key already, semantically self-letters).
- For each of the 6 existing letter routes (`/api/letters/inbox`, `sent`, `arrived`, `mine`, `received`, `[id]/viewed`, `[id]/peek`):
  - Add dual-read: query `Letter` first, fall back to `JournalEntry where entryType='letter'`.
  - Keep response shape identical so frontend doesn't change yet.
- Ship and verify in production for 1 release before cutting writes.
- Don't drop the `JournalEntry` letter fields yet — that's Phase 7.

**Verification:**
- Backfill script idempotent; can re-run.
- All existing letter UI screens render unchanged.
- No new write paths yet.

**Estimated bite-sized tasks when expanded:** ~12.

---

## Phase 3: Self-letters E2EE flow (OUTLINE)

**Goal:** Implement the self-letter write/read flow using the new `Letter` model. Master-key encryption, daily cron for email reminders, in-app reveal modal.

**Key work:**
- Write path: client encrypts content with master key → POST to new `/api/letters/self` → server stores in `Letter` with `letterType='self'`.
- Reveal path: in-app modal when user has self-letters where `scheduledFor <= NOW()` and `firstReadAt is null`. User clicks → master key decrypts → letter displays.
- Daily cron at `/api/cron/self-letter-reminders`: finds self-letters where `scheduledFor <= NOW() AND deliveredAt IS NULL`, sends notification email ("Your letter from <date> is ready"), sets `deliveredAt`. Email contains NO content — just nudge to open the app.
- Update the existing self-letter UI to write through the new endpoint.
- Add `CRON_SECRET` verification on the cron endpoint (existing pattern from `/api/cron/deliver-letters`).

**Verification:**
- Write a self-letter scheduled for tomorrow.
- Force cron to run via authenticated POST in dev.
- Email arrives, app reveal works, ciphertext is unreadable in DB without the user's master key.

**Estimated bite-sized tasks when expanded:** ~10.

---

## Phase 4: Friend letters E2EE flow with tlock + Resend (OUTLINE)

**Goal:** The big one. Ship the full friend-letter feature with tlock + Resend-scheduled delivery + URL-fragment key + 24h read window + "Keep forever" + magic-link signup + sender's receipt + "Ask for copy" paid feature.

**Key sub-tasks (will become its own detailed plan):**

1. **Add `tlock-js` + `drand-client` dependencies.**
   ```bash
   docker compose exec app npm install tlock-js drand-client
   ```
   Verify League of Entropy network parameters (mainnet, period, etc.) — `tlock.land` docs.

2. **Create `src/lib/letters/tlock.ts`** with helper functions:
   - `tlockEncryptKey(key: Uint8Array, unlockDate: Date): Promise<string>` (returns base64 tlock ciphertext)
   - `tlockDecryptKey(tlockCiphertext: string, unlockDate: Date): Promise<Uint8Array>`

3. **Friend-letter write API**: `POST /api/letters/friend`
   - Body: `{contentCiphertext, contentIV, tlockedKey, recipientEmail, recipientName, scheduledFor}` (client did all crypto)
   - Server: creates a `Letter` row with `letterType='friend'`, NO `contentCiphertext` (receipts have no content), and a `LetterDelivery` row with the transient blob + tlock key + a unique `publicToken`.
   - Server immediately calls Resend with `scheduled_at: scheduledFor`, body containing the link `https://hearth.app/letter/<publicToken>#k=<tlockedKey>`.
   - Stores returned `resendEmailId` on the `LetterDelivery`.

4. **Recipient landing page**: `src/app/letter/[token]/page.tsx`
   - Client-only page (no SSR auth requirement for reading the letter).
   - Reads `tlockedKey` from `window.location.hash`.
   - Fetches Drand beacon for `letter.scheduledFor` (server tells the page the date via metadata endpoint).
   - Derives `K`, fetches ciphertext via `GET /api/letter/[token]/ciphertext` (sets `firstReadAt` on first call, returns 410 after 24h), decrypts, displays.
   - Shows 24h countdown timer (live, framer-motion).
   - Shows "Keep forever" CTA that triggers magic-link signup → onboarding → re-encrypt → save.

5. **Magic-link signup for letter recipients**: a new `/letter/[token]/save` flow.
   - If recipient is logged in and onboarded → re-encrypt and save flow (one API call).
   - If recipient is logged out → send magic-link to their email (we know it from the letter's `recipientEmail`) → completes signup → forced E2EE onboarding (Phase 1 flow) → returns to save flow.

6. **Resend webhook handler**: `POST /api/webhooks/resend`
   - Verify signature.
   - On `email.sent`: set `Letter.deliveredAt`.
   - On `email.bounced`: set `Letter.bouncedAt`, `bouncedReason`. Do NOT delete the transient — sender may retry.
   - Skip `email.opened` and `email.clicked` (use server-side `firstReadAt` instead).

7. **Sender's receipt UI**: re-skin the existing "sent letters" view. Each row shows metadata only — no content. Status timeline ("Scheduled / Delivered / Opened / Saved / Faded / Bounced").

8. **"Ask for a copy" paid feature**: receipt row shows an "Ask Sarah for a copy" button when `savedByRecipientAt IS NOT NULL`. Click → triggers email to recipient → recipient (logged in) can click "Yes, send a copy" → reverse-flow friend letter (recipient becomes sender, original sender becomes recipient).

9. **Cleanup cron**: small daily job in `/api/cron/letter-cleanup`:
   ```sql
   DELETE FROM letter_deliveries
   WHERE (first_read_at IS NOT NULL AND first_read_at < NOW() - INTERVAL '24 hours')
      OR (first_read_at IS NULL AND created_at < NOW() - INTERVAL '60 days');
   ```

**Open question to verify at start of this phase:** confirm Resend's `scheduled_at` still supports 30 days (per user's research, it does as of design time). Check current Resend docs.

**Estimated bite-sized tasks when expanded:** ~30.

---

## Phase 5: Stranger notes moderation + paid tier (OUTLINE)

**Goal:** Add multi-pass moderation to the existing stranger-note send flow, gate volume by paid/free tier, and enable unlimited replies for paid users.

**Key work:**

1. **Install dependencies:**
   ```bash
   docker compose exec app npm install obscenity openai
   ```

2. **Hindi/Hinglish blocklist**: curate ~50–100 entries in `src/lib/stranger-notes/hindi-blocklist.ts`. Include both Devanagari and roman-script forms of the worst offenders. Source from public lists, review manually before committing.

3. **Moderation module**: `src/lib/stranger-notes/moderation.ts`
   - `moderate(text: string): Promise<{ allowed: boolean; reason?: string }>`
   - Pass 1: `obscenity` for English + the Hindi blocklist.
   - Pass 2: OpenAI Moderation API (`omni-moderation-latest`).
   - Configurable per-category thresholds.

4. **Wire into existing stranger-note send route**: reject (with friendly error) any note that fails either pass. Log the decision (which pass triggered, scores) for tuning.

5. **Paid tier enforcement** on stranger-note send:
   - Free: `lastStrangerNoteSentAt < NOW() - 24h` (already in schema).
   - Paid: max 5 in last 24h. New counter or query existing.

6. **Reply limits**:
   - Add `repliesAllowed` and `replyCount` to `StrangerNote`. Default `repliesAllowed=1` for free recipients, unlimited (sentinel value like `-1` or large cap) for paid.
   - Enforce in reply send route.

7. **"Save as penpal"**: new model `StrangerPenpalLink` — pairs two users by ID, allows future direct stranger-note threads outside the random pool. Paid only.

8. **Conversion UX**: when a free user tries to send a 2nd note in 24h, or wants to reply more than once, show the upgrade modal: *"You and Stranger #4271 just had a beautiful exchange — keep talking?"* Link to Lemon Squeezy checkout.

9. **Report button**: add a flag-this-note action on every stranger note. Surfaces to a moderation queue table for human review. Out of v1 scope to build the moderation queue UI — just the data.

**Verification:**
- Send notes with English profanity (rejected pass 1), Hindi profanity (rejected pass 1), context-bad-but-no-explicit-words like *"I want you to disappear"* (rejected pass 2).
- Free user hits limit at note 2 of the day → upgrade modal.
- Paid user can send 5/day, unlimited replies, save penpals.

**Estimated bite-sized tasks when expanded:** ~18.

---

## Phase 6: Existing entries re-encryption migration (OUTLINE)

**Goal:** Bring users with legacy `encryptionType='server'` entries into the E2EE-only world by client-side re-encrypting their existing entries under their master key.

**Key work:**

1. **Audit endpoint**: `GET /api/me/encryption-status` → returns `{ unencryptedCount, totalEntries, oldestUnencryptedDate }`.

2. **Migration UI**: a settings-page screen "Bring my old entries into encrypted storage." Shows count, estimated time, progress bar.

3. **Migration client flow**:
   - Page over the user's unencrypted entries 50 at a time.
   - For each entry: fetch plaintext (server-side decrypts using `ENCRYPTION_KEY`), client re-encrypts under master key, PUT to `/api/entries/[id]` with `encryptionType='e2ee'` and the new ciphertext.
   - Resumable — track progress in zustand so refresh doesn't restart from zero.

4. **Force migration after grace period**: after N weeks of voluntary migration, gate non-migrated users behind a forced migration modal (same UX as Phase 1 onboarding modal).

5. **Existing-user E2EE onboarding for those who never set it up**: a parallel flow to Phase 1, but for users who already have content. Order: forced E2EE setup → then forced re-encryption.

**Verification:**
- Pre-migration: DB has rows with `encryptionType='server'`, server can decrypt.
- Post-migration: same rows have `encryptionType='e2ee'`, server cannot decrypt without the user's master key.

**Estimated bite-sized tasks when expanded:** ~10.

---

## Phase 7: Deprecation and cleanup (OUTLINE)

**Goal:** Once Phase 6 has run for all (or all-but-stragglers), remove legacy code paths.

**Key work:**

1. **Drop letter fields from `JournalEntry`**: `entryType`, `unlockDate`, `isSealed`, `recipientEmail`, `recipientName`, `senderName`, `letterLocation`, `isDelivered`, `deliveredAt`, `isViewed`, `letterPeekedAt`, `isReceivedLetter`, `originalSenderId`, `originalEntryId`. Each as its own additive-only migration (set DEFAULT to safe value if column dropped breaks anything in flight).
2. **Drop `LetterAccessToken` table** entirely. `LetterDelivery.publicToken` has replaced it.
3. **Drop `encryptionType` column** after confirming no entries remain with `server` type.
4. **Remove dual-read fallbacks** from letter routes — read only from `Letter`/`LetterDelivery`.
5. **Remove `/security` page** as a primary E2EE-setup entry point (or keep as advanced settings only).
6. **Clean up legacy E2EE-optional code paths** throughout the codebase.

**Verification:**
- Schema dump matches target.
- No code references to dropped fields.
- All tests / smoke runs pass.

**Estimated bite-sized tasks when expanded:** ~8.

---

## Cross-cutting concerns

### Privacy copy / user-facing explanations

Update `src/components/landing/spreads.ts` and any other privacy-page content to match the final architecture. Key sentences to include verbatim across the app:

> "Your diary, your self-letters, and your friend letters are end-to-end encrypted. Only you (and your friend, for friend letters) can read them. Even Hearth's servers cannot decrypt them."

> "Stranger notes are encrypted at rest and reviewed by automated filters to keep the community safe."

> "Friend letters can be read for 24 hours after they're opened, then they fade. The link in the email is the key — anyone who has the email can read on or after the unlock date."

> "If you forget your phrase, your recovery key is the only way back. Save it somewhere safe. We don't keep a copy."

### Telemetry to add (without violating E2EE)

All telemetry must be **metadata-only**:
- E2EE setup completion rate
- Daily passphrase unlock rate (correlates to active users)
- Friend-letter send rate by delay (7/15/20/30 days)
- Friend-letter open rate, save-rate
- Stranger-note moderation pass/fail rates per category
- Paid conversion attribution (which feature triggered the upgrade)

### Performance considerations

- Client-side search across decrypted entries: defer to a future plan. For now, server returns metadata-filtered candidate lists; client decrypts in memory.
- Photo decryption is already lazy via `usePhotoSrc` — keep that.
- Initial unlock latency: PBKDF2 derivation is ~200ms on modern devices. Acceptable.

### Support and account recovery

After this rollout, support cannot read user content to debug. Update internal support runbooks:
- "I can't read my diary" → walk user through unlock + recovery key.
- "I forgot my phrase AND lost my recovery key" → confirm data is permanently inaccessible; no shortcut; offer account closure if they want a fresh start.

### Things explicitly OUT of scope

- Passkey/WebAuthn-based device unlock (a UX upgrade for a future plan).
- Encrypted metadata / encrypted indexes (would enable server-side search across E2EE content — much bigger lift).
- Public-key crypto for friend letters where recipient is already a Hearth user (could skip tlock and just encrypt directly to recipient's pubkey). Worth doing in a follow-up; not v1.
- Recipient-side moderation reports queue UI (data captured, no admin tool yet).
- E2EE for stranger notes (fundamentally incompatible with moderation; permanent decision).

---

## Open questions to resolve before each phase starts

When picking up each phase, validate these against current reality:

**Phase 2:** What exact letter rows exist in production today? Run a count query before the backfill to size the migration.

**Phase 4:**
- Confirm Resend's `scheduled_at` still supports 30 days.
- Confirm `tlock-js` is still maintained / not deprecated.
- Confirm Drand mainnet beacon URLs are stable; document them in `tlock.ts`.

**Phase 5:**
- Verify OpenAI Moderation API is still free at the volume we'll use.
- Source a Hindi/Hinglish blocklist (recommend manual curation > grabbing random GitHub list).

**Phase 6:**
- How many users have legacy `encryptionType='server'` content? Sets the urgency of the forced-migration deadline.

---

## Done criteria for the whole rollout

- Every user on the platform has `e2eeEnabled = true`.
- No `JournalEntry` row has `encryptionType = 'server'`.
- No code path produces server-encrypted (non-E2EE) content for diary / self-letter / friend-letter features.
- Friend letters round-trip end-to-end with verifiable tlock encryption (manual test: inspect DB during the wait, confirm `transientCiphertext` is uncorrelated with content even with `ENCRYPTION_KEY` known).
- Stranger notes still work, with moderation rejecting obvious garbage and the paid tier gating volume + replies.
- Privacy copy matches what's actually true.
- A user who forgets their passphrase + loses recovery key cannot recover content — verified in a deliberate dev test.
