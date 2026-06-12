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
