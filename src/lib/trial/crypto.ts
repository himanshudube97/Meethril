// src/lib/trial/crypto.ts
//
// Trial renders the real scenes, which gate on useE2EE().isE2EEReady. We satisfy
// that with a throwaway in-tab AES-GCM key, PERSISTED in sessionStorage (same
// slot the real app uses) so the same key encrypts+decrypts across reloads
// within the tab — and powers the photo-ref encryption flow. The key is gone on
// tab close. primeTrialCrypto returns restore() that clears it and restores the
// prior store state. Anonymous-only: the caller (TryModeProvider) guarantees no
// real session is present, so overwriting the key slot is safe.

import { useE2EEStore } from '@/store/e2ee'

export async function primeTrialCrypto(): Promise<() => void> {
  const store = useE2EEStore.getState()
  const prev = {
    isEnabled: store.isEnabled,
    isUnlocked: store.isUnlocked,
    masterKey: store.masterKey,
    initialized: store.initialized,
  }

  // Reuse a persisted key if we already primed this tab (survives reload);
  // otherwise generate a fresh extractable AES-GCM key and persist it.
  let key = await store.loadMasterKey()
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable — storeMasterKey serializes it to sessionStorage
      ['encrypt', 'decrypt'],
    )
    await store.storeMasterKey(key)
  }
  useE2EEStore.setState({ isEnabled: true, initialized: true })

  return () => {
    useE2EEStore.getState().clearMasterKey()
    useE2EEStore.setState({ isEnabled: prev.isEnabled, initialized: prev.initialized })
  }
}
