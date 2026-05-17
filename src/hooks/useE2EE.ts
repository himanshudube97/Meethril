import { useCallback } from 'react'
import { useE2EEStore } from '@/store/e2ee'
import { encryptDraft, decryptEntry, type EncryptableDraft } from '@/lib/e2ee/draft-encryptor'
import type { JournalEntry } from '@/store/journal'

export function useE2EE() {
  const { isEnabled, isUnlocked, masterKey, initialized } = useE2EEStore()
  const isE2EEReady = isEnabled && isUnlocked && masterKey !== null

  const encryptEntryData = useCallback(
    async (draft: EncryptableDraft): Promise<Record<string, unknown>> => {
      if (!isE2EEReady || !masterKey) {
        // E2EE not ready — return plaintext draft without encryption metadata.
        // The autosave hook defers saves until the master key is available, so
        // this path is only reached in exceptional cases (e.g. key expired mid-session).
        return { ...draft }
      }
      try {
        const encrypted = await encryptDraft(draft, masterKey)
        return encrypted as unknown as Record<string, unknown>
      } catch (error) {
        console.error('E2EE encryption failed:', error)
        return { ...draft }
      }
    },
    [isE2EEReady, masterKey]
  )

  const decryptEntryFromServer = useCallback(
    async (entry: JournalEntry): Promise<JournalEntry> => {
      // All entries are E2EE — always attempt decryption.
      if (!isE2EEReady || !masterKey) {
        return {
          ...entry,
          text: '[Encrypted — unlock to view]',
          textPreview: '[Encrypted]',
        }
      }
      try {
        const decrypted = await decryptEntry(entry as unknown as Parameters<typeof decryptEntry>[0], masterKey)
        return { ...entry, ...decrypted } as JournalEntry
      } catch (error) {
        console.error('E2EE decryption failed for entry:', entry.id, error)
        return {
          ...entry,
          text: '[Decryption failed]',
          textPreview: '[Decryption failed]',
        }
      }
    },
    [isE2EEReady, masterKey]
  )

  const decryptEntriesFromServer = useCallback(
    async (entries: JournalEntry[]): Promise<JournalEntry[]> => {
      return Promise.all(entries.map(decryptEntryFromServer))
    },
    [decryptEntryFromServer]
  )

  return {
    isE2EEEnabled: isEnabled,
    isE2EEReady,
    isE2EEInitialized: initialized,
    encryptEntryData,
    decryptEntryFromServer,
    decryptEntriesFromServer,
  }
}
