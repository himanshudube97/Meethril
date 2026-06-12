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
