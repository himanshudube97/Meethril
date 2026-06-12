# E2EE Hard Unlock Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On an authenticated app surface, when E2EE is enabled and the journal is locked, render a full-screen lock gate instead of the app — so no entry/letter/scrapbook/photo UI mounts and nothing is fetched until the daily key is entered. This structurally eliminates the cross-device `[Encrypted — unlock to view]` overwrite bug.

**Architecture:** A single render gate in `E2EEProvider`. A pure helper `e2eeGateState()` maps store state to `'pending' | 'locked' | 'open'`. When not `'open'`, `E2EEProvider` returns `<LockGate/>` (+ `RecoveryModal`) instead of `{children}`, so the editors never mount while locked. The daily-key form is extracted into a shared `UnlockForm` consumed by both `LockGate` and the residual `UnlockModal`.

**Tech Stack:** Next.js 16 / React 19, Zustand stores, Web Crypto (existing `lib/e2ee/crypto.ts`), Vitest (jsdom), Tailwind + inline theme styles, Framer Motion.

---

## File Structure

New:
- `src/lib/e2ee/gate.ts` — `e2eeGateState()` pure decision helper + `E2EEGateState` type.
- `src/__tests__/e2ee-gate.test.ts` — unit tests for the helper.
- `src/components/e2ee/UnlockForm.tsx` — shared daily-key form (input + unlock + recovery link + optional logout).
- `src/components/e2ee/LockGate.tsx` — full-screen themed lock/splash screen.

Modified:
- `src/components/e2ee/UnlockModal.tsx` — render `<UnlockForm/>` inside its modal chrome.
- `src/components/e2ee/E2EEProvider.tsx` — compute gate state, branch render.

Unchanged on purpose (defense-in-depth): `useAutosaveEntry.ts`, `BookSpread.tsx`, `MobileJournalEntry.tsx` guards.

---

## Task 1: Pure gate-state helper (TDD)

**Files:**
- Create: `src/lib/e2ee/gate.ts`
- Test: `src/__tests__/e2ee-gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/e2ee-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { e2eeGateState } from '@/lib/e2ee/gate'

const base = {
  hasUser: true,
  allowsModals: true,
  initialized: true,
  isEnabled: true,
  isUnlocked: false,
}

describe('e2eeGateState', () => {
  it('is open when there is no user (logged out)', () => {
    expect(e2eeGateState({ ...base, hasUser: false })).toBe('open')
  })

  it('is open on a public / pre-auth route (modals not allowed)', () => {
    expect(e2eeGateState({ ...base, allowsModals: false })).toBe('open')
  })

  it('is pending on an app surface before initialization finishes', () => {
    expect(e2eeGateState({ ...base, initialized: false })).toBe('pending')
  })

  it('is locked when E2EE is enabled, initialized, and not unlocked', () => {
    expect(e2eeGateState(base)).toBe('locked')
  })

  it('is open when E2EE is enabled and unlocked', () => {
    expect(e2eeGateState({ ...base, isUnlocked: true })).toBe('open')
  })

  it('is open when E2EE is not enabled (no encrypted content to gate)', () => {
    expect(e2eeGateState({ ...base, isEnabled: false })).toBe('open')
  })

  it('pending takes precedence over locked before init even when enabled+locked', () => {
    expect(e2eeGateState({ ...base, initialized: false, isEnabled: true, isUnlocked: false })).toBe('pending')
  })

  it('a logged-out user on an app surface that is not initialized is still open', () => {
    expect(e2eeGateState({ ...base, hasUser: false, initialized: false })).toBe('open')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec app npx vitest run src/__tests__/e2ee-gate.test.ts`
Expected: FAIL — cannot resolve `@/lib/e2ee/gate` / `e2eeGateState is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/e2ee/gate.ts`:

```ts
export type E2EEGateState = 'pending' | 'locked' | 'open'

export interface E2EEGateInput {
  /** A logged-in user is present. */
  hasUser: boolean
  /** Current route is an authed app surface where E2EE modals may show
   *  (i.e. allowsE2EEModals(pathname)). False for public / pre-auth routes. */
  allowsModals: boolean
  /** E2EE store has finished initialize() (fetched /api/e2ee/keys). */
  initialized: boolean
  /** User has E2EE configured server-side. */
  isEnabled: boolean
  /** Master key is loaded in this tab. */
  isUnlocked: boolean
}

/**
 * Decide whether the app shell should render, or be replaced by a lock gate.
 *
 * - 'open'    → render the app ({children}) as normal.
 * - 'pending' → show a neutral splash while we figure out E2EE status; the app
 *               must NOT mount yet (prevents any fetch before we know).
 * - 'locked'  → show the daily-key unlock screen; the app must NOT mount.
 *
 * Off an app surface (logged out, or a public/pre-auth route) the gate never
 * applies — always 'open'.
 */
export function e2eeGateState(input: E2EEGateInput): E2EEGateState {
  const onAppSurface = input.hasUser && input.allowsModals
  if (!onAppSurface) return 'open'
  if (!input.initialized) return 'pending'
  if (input.isEnabled && !input.isUnlocked) return 'locked'
  return 'open'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec app npx vitest run src/__tests__/e2ee-gate.test.ts`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/e2ee/gate.ts src/__tests__/e2ee-gate.test.ts
git commit -m "feat(e2ee): add pure e2eeGateState() unlock-gate decision helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extract shared `UnlockForm` from `UnlockModal`

Pull the daily-key form (header, input, unlock logic, recovery link, optional logout) out of `UnlockModal` so `LockGate` and `UnlockModal` share one implementation. No behavior change for the modal yet — verified manually after Task 4.

**Files:**
- Create: `src/components/e2ee/UnlockForm.tsx`
- Modify: `src/components/e2ee/UnlockModal.tsx`

- [ ] **Step 1: Create `UnlockForm.tsx`**

Create `src/components/e2ee/UnlockForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { useAuthStore } from '@/store/auth'
import { PasswordToggle } from '@/components/PasswordToggle'
import {
  deriveKeyFromPassphrase,
  parseSalt,
  unwrapMasterKey,
} from '@/lib/e2ee/crypto'

interface UnlockFormProps {
  /** Show a "Log out" button under the recovery link (used by the full-screen
   *  lock gate, where the user might be stuck without their key). */
  showLogout?: boolean
}

export function UnlockForm({ showLogout = false }: UnlockFormProps) {
  const { theme } = useThemeStore()
  const {
    keyData,
    storeMasterKey,
    setShowUnlockModal,
    setShowRecoveryModal,
  } = useE2EEStore()
  const logout = useAuthStore((s) => s.logout)

  const [dailyKey, setDailyKey] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleUnlock = async () => {
    if (!keyData?.encryptedMasterKey || !keyData?.masterKeyIV || !keyData?.masterKeySalt) {
      setError('E2EE key data not available')
      return
    }

    setLoading(true)
    setError('')

    try {
      const salt = parseSalt(keyData.masterKeySalt)
      const wrappingKey = await deriveKeyFromPassphrase(dailyKey, salt)
      const masterKey = await unwrapMasterKey(
        keyData.encryptedMasterKey,
        wrappingKey,
        keyData.masterKeyIV
      )
      // Store master key (sessionStorage — cleared on tab close). Setting it
      // flips isUnlocked → true, which opens the gate and mounts the app.
      await storeMasterKey(masterKey)
      setShowUnlockModal(false)
      setDailyKey('')
    } catch {
      setError('Incorrect daily key. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotKey = () => {
    setShowUnlockModal(false)
    setShowRecoveryModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-4">
          <svg className="w-16 h-16 mx-auto" viewBox="0 0 24 24" fill="none" stroke={theme.accent.primary} strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2 className="text-xl font-light mb-2" style={{ color: theme.text.primary }}>
          Unlock Your Journal
        </h2>
        <p className="text-base" style={{ color: theme.text.secondary }}>
          Enter your daily key to decrypt your entries.
        </p>
        <p className="text-sm mt-2" style={{ color: theme.text.muted }}>
          This device stays unlocked until you close the tab.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2" style={{ color: theme.text.secondary }}>
            Daily Key
          </label>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={dailyKey}
              onChange={(e) => setDailyKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dailyKey) handleUnlock()
              }}
              placeholder="Enter your daily key..."
              autoFocus
              className="w-full p-4 rounded-xl text-base outline-none"
              style={{
                background: theme.glass.bg,
                border: `1px solid ${theme.glass.border}`,
                color: theme.text.primary,
                paddingRight: '2.75rem',
              }}
            />
            <PasswordToggle shown={show} onToggle={() => setShow((v) => !v)} color={theme.text.muted} />
          </div>
        </div>

        {error && (
          <p className="text-base text-center" style={{ color: theme.accent.warm }}>
            {error}
          </p>
        )}
      </div>

      <button
        onClick={handleUnlock}
        disabled={loading || !dailyKey}
        className="w-full py-3 rounded-xl text-base font-medium"
        style={{
          background: theme.accent.primary,
          color: '#fff',
          opacity: loading || !dailyKey ? 0.5 : 1,
        }}
      >
        {loading ? 'Unlocking...' : 'Unlock'}
      </button>

      <button
        onClick={handleForgotKey}
        className="w-full text-base"
        style={{ color: theme.text.secondary }}
      >
        Forgot your daily key? Use recovery key
      </button>

      {showLogout && (
        <button
          onClick={() => logout()}
          className="w-full text-sm"
          style={{ color: theme.text.muted }}
        >
          Log out
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace `UnlockModal` body with `UnlockForm`**

Overwrite `src/components/e2ee/UnlockModal.tsx` with:

```tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { UnlockForm } from './UnlockForm'

export default function UnlockModal() {
  const { theme } = useThemeStore()
  const showUnlockModal = useE2EEStore((s) => s.showUnlockModal)

  if (!showUnlockModal) return null

  return (
    <AnimatePresence>
      {showUnlockModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto p-6 rounded-2xl"
            style={{
              background: theme.bg.primary,
              border: `1px solid ${theme.glass.border}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <UnlockForm />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: PASS (no type errors). If `theme.glass`/`theme.accent.warm` are flagged, they already exist — confirm against the original `UnlockModal.tsx` which used the same fields.

- [ ] **Step 4: Commit**

```bash
git add src/components/e2ee/UnlockForm.tsx src/components/e2ee/UnlockModal.tsx
git commit -m "refactor(e2ee): extract shared UnlockForm from UnlockModal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `LockGate` full-screen lock / splash screen

**Files:**
- Create: `src/components/e2ee/LockGate.tsx`

- [ ] **Step 1: Create `LockGate.tsx`**

Create `src/components/e2ee/LockGate.tsx`:

```tsx
'use client'

import { motion } from 'framer-motion'
import Background from '@/components/Background'
import { useThemeStore } from '@/store/theme'
import { UnlockForm } from './UnlockForm'

interface LockGateProps {
  /** true while we are still figuring out E2EE status (before init finishes):
   *  show a neutral splash, no input. false → show the unlock form. */
  pending?: boolean
}

export default function LockGate({ pending = false }: LockGateProps) {
  const { theme } = useThemeStore()

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden">
      {/* Theme particles — matches the active theme, no hardcoded bg. Body bg
          colour is already set globally by LayoutContent's useEffect. */}
      <Background />

      <div className="relative z-10 w-full max-w-md mx-auto px-6">
        {pending ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.svg
              className="w-16 h-16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.accent.primary}
              strokeWidth="1.5"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </motion.svg>
            <p className="text-base" style={{ color: theme.text.secondary }}>
              Unlocking…
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="p-6 rounded-2xl"
            style={{
              background: theme.bg.primary,
              border: `1px solid ${theme.glass.border}`,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <UnlockForm showLogout />
          </motion.div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/e2ee/LockGate.tsx
git commit -m "feat(e2ee): add full-screen LockGate (themed splash + unlock card)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire the gate into `E2EEProvider`

Make `E2EEProvider` branch on `e2eeGateState`: render `<LockGate/>` + `<RecoveryModal/>` instead of `{children}` whenever the gate is not `'open'`. This is the step that actually stops the editors from mounting (and fetching) while locked.

**Files:**
- Modify: `src/components/e2ee/E2EEProvider.tsx`

- [ ] **Step 1: Add imports and the gate computation**

In `src/components/e2ee/E2EEProvider.tsx`, add the new imports after the existing ones (keep existing imports intact):

```tsx
import { e2eeGateState } from '@/lib/e2ee/gate'
import LockGate from './LockGate'
```

- [ ] **Step 2: Read `isEnabled` from the store**

The component already reads `isUnlocked` via a selector (`const isUnlocked = useE2EEStore(s => s.isUnlocked)`) and gets `initialized` from the destructured `useE2EEStore()` call. Add an `isEnabled` selector right after the `isUnlocked` line:

```tsx
const isEnabled = useE2EEStore(s => s.isEnabled)
```

- [ ] **Step 3: Compute gate state after `modalsAllowed`**

Immediately after the existing `const modalsAllowed = allowsE2EEModals(pathname)` line, add:

```tsx
const gate = e2eeGateState({
  hasUser: !!user,
  allowsModals: modalsAllowed,
  initialized,
  isEnabled,
  isUnlocked,
})
```

(All three `useEffect` hooks above stay exactly where they are — they must keep running so `initialize()`, the logout key-clear, and backfill-resume still fire. The early return below comes only after all hooks.)

- [ ] **Step 4: Replace the `return (...)` block**

Replace the entire existing `return (...)` JSX at the bottom of the component with:

```tsx
  // Gate: while pending (figuring out E2EE status) or locked (E2EE on, not
  // unlocked) on an authed app surface, do NOT mount {children}. The journal
  // editors and every other E2EE-content fetcher live inside {children}, so
  // withholding it means nothing is fetched or decrypted before the daily key
  // is entered — on every device. RecoveryModal stays mounted because the
  // lock screen's "use recovery key" link drives it.
  if (gate !== 'open') {
    return (
      <>
        <LockGate pending={gate === 'pending'} />
        <RecoveryModal />
      </>
    )
  }

  return (
    <>
      {children}
      {modalsAllowed && (
        <>
          <SetupModal />
          <UnlockModal />
          <RecoveryModal />
          <BackfillToast />
        </>
      )}
    </>
  )
```

- [ ] **Step 5: Typecheck**

Run: `docker compose exec app npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `docker compose exec app npx vitest run`
Expected: PASS (including the new `e2ee-gate.test.ts`; nothing else should regress).

- [ ] **Step 7: Commit**

```bash
git add src/components/e2ee/E2EEProvider.tsx
git commit -m "feat(e2ee): hard unlock gate — withhold app shell until journal unlocked

Render LockGate instead of {children} on authed surfaces when E2EE is
locked or still initializing, so the journal editors never mount and no
entry/letter/scrapbook/photo fetch happens before the daily key is
entered. Eliminates the cross-device [Encrypted...] overwrite at its
source (the desktop BookSpread mount-time fetch).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Hearth review + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Dispatch the `hearth-reviewer` agent on the diff**

Run the `hearth-reviewer` agent against the branch diff (`git diff main...HEAD`). Resolve every 🔴/🟠 finding (theme-awareness of `LockGate`, no hardcoded bg, dual-editor parity unaffected, E2EE tier untouched).

- [ ] **Step 2: Restart the app**

Run: `docker compose restart app`

- [ ] **Step 3: Manual verify on the test account (active theme + one contrasting theme)**

Log in with `.dev-creds.local` (`DEV_TEST_EMAIL` / `DEV_TEST_PASSWORD`, daily key `DEV_TEST_E2EE_DAILY_KEY`). With DevTools → Network open:

1. Fresh load while locked → brief "Unlocking…" splash → lock card. Confirm **no** request to `/api/entries` (nor letters/scrapbook/photos) fires before unlock.
2. Enter the daily key → app mounts, entries decrypt and render real content.
3. Resize to a mobile viewport (or open on a phone): write an entry on the desktop view, then open the mobile view while locked → unlock → content is intact, **no** `[Encrypted — unlock to view]` overwrite.
4. Trigger "Lock diary" (or clear the master key) mid-session → the gate reappears automatically.
5. From the lock screen: the "Forgot your daily key? Use recovery key" link opens `RecoveryModal`; the "Log out" button logs out and lands on `/login`.
6. Sanity: a non-E2EE flow / public route (`/`, `/pricing`, `/login`) is unaffected — no gate, no splash.
7. Repeat steps 1–2 on one contrasting theme (e.g. rivendell dark vs rose light) to confirm `LockGate` colours follow the theme.

- [ ] **Step 4: Confirm gates green and finish the branch**

Run: `docker compose exec app npx vitest run && docker compose exec app npx tsc --noEmit`
Expected: both PASS. Then use the `superpowers:finishing-a-development-branch` skill to decide merge/PR.

---

## Self-Review

**Spec coverage:**
- Render gate in `E2EEProvider` → Task 4. ✓
- Pure `e2eeGateState()` helper + unit test → Task 1. ✓
- `LockGate` component (themed, pending splash + locked card, logout + recovery) → Task 3. ✓
- Shared `UnlockForm` refactor; `UnlockModal` consumes it → Task 2. ✓
- Modal rendering: gated branch renders only `LockGate` + `RecoveryModal`, not `UnlockModal` → Task 4 Step 4. ✓
- Defense-in-depth guards left untouched → stated in File Structure; no task modifies them. ✓
- Testing (unit truth table + manual matrix, no-fetch-before-unlock check) → Tasks 1 & 5. ✓
- Non-goal (no data repair of already-corrupted rows) → not in plan, correct. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". All code blocks complete.

**Type consistency:** `e2eeGateState` signature/`E2EEGateInput` fields identical across Task 1 (def), Task 1 test, and Task 4 (call site): `hasUser, allowsModals, initialized, isEnabled, isUnlocked`. `UnlockForm` prop `showLogout` consistent across Tasks 2 and 3. `LockGate` prop `pending` consistent across Tasks 3 and 4. Store fields (`keyData`, `storeMasterKey`, `setShowUnlockModal`, `setShowRecoveryModal`, `isEnabled`, `isUnlocked`, `initialized`) match `src/store/e2ee.ts`. `logout` matches `src/store/auth.ts`.
