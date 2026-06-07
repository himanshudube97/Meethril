import { create } from 'zustand'
import {
  loadMasterKeyLocally,
  storeMasterKeyLocally,
  clearMasterKeyLocally,
  hasMasterKeyLocally,
} from '@/lib/e2ee/crypto'
import type { E2EEKeyData } from '@/lib/e2ee/types'

interface E2EEState {
  // Status
  isEnabled: boolean
  isUnlocked: boolean
  masterKey: CryptoKey | null
  keyData: E2EEKeyData | null

  // UI state
  showSetupModal: boolean
  showUnlockModal: boolean
  showRecoveryModal: boolean

  // Loading
  loading: boolean
  initialized: boolean

  // Backfill progress
  backfillProgress: {
    status: 'idle' | 'running' | 'paused' | 'done' | 'error'
    migrated: number
    total: number
    lastCursor: string | null
    failedIds: string[]
  }

  // Actions
  setEnabled: (enabled: boolean) => void
  setMasterKey: (key: CryptoKey | null) => void
  setKeyData: (data: E2EEKeyData | null) => void
  setShowSetupModal: (show: boolean) => void
  setShowUnlockModal: (show: boolean) => void
  setShowRecoveryModal: (show: boolean) => void
  setLoading: (loading: boolean) => void
  setBackfillProgress: (patch: Partial<E2EEState['backfillProgress']>) => void

  // Async actions
  // Note: the master key is stored in localStorage with a fixed 1h TTL (see
  // crypto.ts). `ttlDays` is retained for caller-compat but ignored — the TTL
  // is a single policy in crypto.ts, not per-caller.
  storeMasterKey: (key: CryptoKey, ttlDays?: number) => Promise<void>
  loadMasterKey: () => Promise<CryptoKey | null>
  clearMasterKey: () => void
  initialize: () => Promise<void>
  fetchKeyData: () => Promise<E2EEKeyData | null>
}

export const useE2EEStore = create<E2EEState>((set, get) => ({
  // Initial state
  isEnabled: false,
  isUnlocked: false,
  masterKey: null,
  keyData: null,
  showSetupModal: false,
  showUnlockModal: false,
  showRecoveryModal: false,
  loading: false,
  initialized: false,
  backfillProgress: {
    status: 'idle' as const,
    migrated: 0,
    total: 0,
    lastCursor: null,
    failedIds: [] as string[],
  },

  // Setters
  setEnabled: (enabled) => set({ isEnabled: enabled }),
  setMasterKey: (key) => set({ masterKey: key, isUnlocked: key !== null }),
  setKeyData: (data) => set({ keyData: data }),
  setShowSetupModal: (show) => set({ showSetupModal: show }),
  setShowUnlockModal: (show) => set({ showUnlockModal: show }),
  setShowRecoveryModal: (show) => set({ showRecoveryModal: show }),
  setLoading: (loading) => set({ loading }),
  setBackfillProgress: (patch) =>
    set(s => {
      const next = { ...s.backfillProgress, ...patch }
      try { localStorage.setItem('meethril-backfill-progress', JSON.stringify(next)) } catch {}
      return { backfillProgress: next }
    }),

  // Store master key in localStorage with a 1h TTL (see crypto.ts).
  // ttlDays is accepted but ignored — the TTL is a fixed policy in crypto.ts.
  storeMasterKey: async (key, _ttlDays) => {
    await storeMasterKeyLocally(key)
    set({ masterKey: key, isUnlocked: true })
  },

  // Load master key from browser storage
  loadMasterKey: async () => {
    const key = await loadMasterKeyLocally()
    if (key) {
      set({ masterKey: key, isUnlocked: true })
    }
    return key
  },

  // Clear master key from memory and storage
  clearMasterKey: () => {
    clearMasterKeyLocally()
    set({ masterKey: null, isUnlocked: false })
  },

  // Fetch E2EE key data from server
  fetchKeyData: async () => {
    try {
      const res = await fetch('/api/e2ee/keys')
      if (!res.ok) return null
      const data: E2EEKeyData = await res.json()
      set({ keyData: data, isEnabled: data.e2eeEnabled })
      return data
    } catch {
      return null
    }
  },

  // Initialize E2EE state on app load
  initialize: async () => {
    const state = get()
    if (state.initialized) return

    set({ loading: true })

    try {
      // Hydrate backfill progress from localStorage
      try {
        const raw = localStorage.getItem('meethril-backfill-progress')
        if (raw) set({ backfillProgress: JSON.parse(raw) })
      } catch {}

      // Fetch E2EE status from server
      const keyData = await state.fetchKeyData()

      if (keyData?.e2eeEnabled) {
        // E2EE is enabled, try to load key from storage
        const hasLocalKey = hasMasterKeyLocally()

        if (hasLocalKey) {
          // Try to load the key
          const key = await state.loadMasterKey()
          if (key) {
            set({ isUnlocked: true })
          } else {
            // Key was invalid, need to unlock
            set({ showUnlockModal: true })
          }
        } else {
          // No local key, show unlock modal
          set({ showUnlockModal: true })
        }
      }

      set({ initialized: true })
    } catch (error) {
      console.error('Failed to initialize E2EE:', error)
    } finally {
      set({ loading: false })
    }
  },
}))
