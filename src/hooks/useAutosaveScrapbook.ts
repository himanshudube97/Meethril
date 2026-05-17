'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScrapbookItem } from '@/lib/scrapbook'
import { useE2EEStore } from '@/store/e2ee'
import { encryptString } from '@/lib/e2ee/crypto'

const DEBOUNCE_MS = 1500
const RETRY_DELAY_MS = 2000

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Options {
  boardId: string
}

interface UseAutosaveScrapbookResult {
  status: SaveStatus
  trigger: (items: ScrapbookItem[], title?: string | null) => void
  flush: () => Promise<void>
}

export function useAutosaveScrapbook({ boardId }: Options): UseAutosaveScrapbookResult {
  const [status, setStatus] = useState<SaveStatus>('idle')

  const draftRef = useRef<{ items: ScrapbookItem[]; title?: string | null } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const dirtyRef = useRef(false)
  // Signature of the last successfully-saved payload. If a trigger fires with
  // an identical draft (e.g. a re-render dispatched the same items array
  // because something else upstream re-emitted), short-circuit instead of
  // burning a PUT on a no-op.
  const lastSavedSigRef = useRef<string | null>(null)

  // performSave lives in a ref so trigger/flush can stay stable across
  // renders (useCallback with []). Without this, every status transition
  // re-renders the hook and returns fresh trigger/flush identities, which
  // re-fires the consumer's `useEffect([items, triggerSave])` and loops
  // saves indefinitely.
  const performSaveRef = useRef<(retryCount?: number) => Promise<void>>(async () => {})

  performSaveRef.current = async (retryCount = 0) => {
    const draft = draftRef.current
    if (!draft) return
    if (inFlightRef.current) {
      dirtyRef.current = true
      return
    }
    // Defer until the E2EE store has hydrated from /api/e2ee/keys. Before
    // that, `isEnabled` is its default `false` even for users who actually
    // have E2EE on, so saving now would silently downgrade the row to
    // server-encrypted — same shape of race that corrupted journal entries.
    {
      const state = useE2EEStore.getState()
      if (!state.initialized) {
        setStatus('idle')
        return
      }
      if (state.isEnabled && (!state.isUnlocked || state.masterKey === null)) {
        setStatus('idle')
        return
      }
    }

    // Cheap dirty check: if the draft is byte-identical to what's already on
    // the server, skip the network round-trip. JSON.stringify is fine — items
    // arrays are at most a few hundred entries.
    const draftSig = JSON.stringify(draft)
    if (draftSig === lastSavedSigRef.current) {
      setStatus('saved')
      return
    }

    inFlightRef.current = true
    setStatus('saving')
    try {
      // Build payload — encrypt when E2EE is unlocked
      const state = useE2EEStore.getState()
      const masterKey = state.masterKey
      const isE2EEReady = state.isEnabled && state.isUnlocked && masterKey !== null

      // All scrapbooks are E2EE — always encrypt before saving.
      if (!isE2EEReady || !masterKey) {
        // E2EE not ready — defer; the guard above already handles this case.
        // This branch is only reached in exceptional mid-session key-expiry.
        setStatus('idle')
        inFlightRef.current = false
        return
      }
      const titleEnc = draft.title ? await encryptString(draft.title, masterKey) : null
      const itemsEnc = await encryptString(JSON.stringify(draft.items), masterKey)
      const payload: Record<string, unknown> = {
        title: titleEnc?.ciphertext ?? null,
        items: itemsEnc.ciphertext,
        e2eeIVs: {
          ...(titleEnc ? { title: titleEnc.iv } : {}),
          items: itemsEnc.iv,
        },
      }

      const res = await fetch(`/api/scrapbooks/${boardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      lastSavedSigRef.current = draftSig
      setStatus('saved')
      if (dirtyRef.current) {
        dirtyRef.current = false
        await performSaveRef.current?.(0)
      }
    } catch (err) {
      console.error('Scrapbook autosave failed:', err)
      setStatus('error')
      if (retryCount < 2) {
        setTimeout(() => performSaveRef.current?.(retryCount + 1), RETRY_DELAY_MS)
      }
    } finally {
      inFlightRef.current = false
    }
  }

  const trigger = useCallback((items: ScrapbookItem[], title?: string | null) => {
    draftRef.current = { items, title }
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      performSaveRef.current?.(0)
    }, DEBOUNCE_MS)
  }, [])

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    await performSaveRef.current?.(0)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { status, trigger, flush }
}
