'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StrokeData } from '@/store/journal'
import type { EntryStyle } from '@/lib/entry-style'
import { useDeskStore, type AutosaveStatus } from '@/store/desk'
import { getClientTz } from '@/lib/entry-lock-client'
import { useE2EE } from './useE2EE'

const DEBOUNCE_MS = 1500
const RETRY_DELAY_MS = 2000

export interface AutosaveDraft {
  text: string
  song: string | null
  // Optional — when omitted the server skips the destructive replace block
  // entirely, preserving any photos/doodles already on the entry. Letter
  // compose omits these so PostcardBack's CollagePhoto uploads are not wiped
  // on the next autosave tick.
  photos?: {
    url?: string                 // mark optional to support E2EE-uploaded photos
    encryptedRef?: string        // set when E2EE photo upload
    encryptedRefIV?: string      // IV for encryptedRef
    position: number
    rotation: number
    spread: number
  }[]
  doodles?: { strokes: StrokeData[]; spread: number }[]
  // Per-entry display style. Always present in the draft (possibly empty {}),
  // sent to the server only when non-empty so existing letter saves don't
  // pick up an empty `style: {}` over the wire.
  style?: EntryStyle
  // Letter-only fields. Absent for normal journal entries; present (possibly
  // null) for letter drafts so the server can persist recipient/scheduling.
  entryType?: string
  recipientEmail?: string | null
  recipientName?: string | null
  senderName?: string | null
  letterLocation?: string | null
  unlockDate?: string | null
}

// Re-exported so existing callers that imported `AutosaveStatus` from this
// hook keep working — the canonical type now lives in the desk store.
export type { AutosaveStatus }

export interface UseAutosaveResult {
  entryId: string | null
  flush: () => Promise<void>
  reset: (nextEntryId?: string | null) => void
  trigger: (draft: AutosaveDraft) => void
}

function isDraftEmpty(d: AutosaveDraft): boolean {
  if (d.text && d.text.trim().length > 0) return false
  if (d.song && d.song.trim().length > 0) return false
  if (d.photos && d.photos.length > 0) return false
  if (d.doodles && d.doodles.some(x => x.strokes.length > 0)) return false
  return true
}

export function useAutosaveEntry(initialEntryId: string | null = null): UseAutosaveResult {
  const [entryId, setEntryId] = useState<string | null>(initialEntryId)
  // Status is written straight to the desk store so consumers of this hook
  // (notably BookSpread) don't re-render on every save transition. Read it
  // from `useDeskStore((s) => s.autosaveStatus)` where it's actually needed.
  const setStatus = useDeskStore.getState().setAutosaveStatus

  // All save bookkeeping lives in refs so the save closure is stable across
  // renders and always sees the latest draft / entry id.
  const entryIdRef = useRef<string | null>(initialEntryId)
  const draftRef = useRef<AutosaveDraft | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const dirtyRef = useRef(false)
  // Signature of the last successfully-saved draft. If a trigger fires with
  // an identical draft (e.g. a store subscription re-emitted the same value,
  // or a stray effect ran on mount), short-circuit instead of burning a PUT
  // on a no-op.
  const lastSavedSigRef = useRef<string | null>(null)

  const { encryptEntryData, isE2EEReady, isE2EEEnabled, isE2EEInitialized } = useE2EE()
  const encryptEntryDataRef = useRef(encryptEntryData)
  const isE2EEReadyRef = useRef(isE2EEReady)
  const isE2EEEnabledRef = useRef(isE2EEEnabled)
  const isE2EEInitializedRef = useRef(isE2EEInitialized)
  encryptEntryDataRef.current = encryptEntryData
  isE2EEReadyRef.current = isE2EEReady
  isE2EEEnabledRef.current = isE2EEEnabled
  isE2EEInitializedRef.current = isE2EEInitialized

  const performSaveRef = useRef<(retryCount?: number) => Promise<void>>(async () => {})

  performSaveRef.current = async (retryCount = 0) => {
    const draft = draftRef.current
    if (!draft) return
    if (isDraftEmpty(draft) && !entryIdRef.current) {
      // Nothing to save and no entry yet — stay idle.
      return
    }
    if (inFlightRef.current) {
      dirtyRef.current = true
      return
    }

    // Defer saves while the E2EE store is still hydrating from /api/e2ee/keys.
    // Until that fetch resolves, `isEnabled` is its default `false` even for
    // users who actually have E2EE on — so the `isEnabled && !isReady` guard
    // below would let plaintext slip through into an e2ee-flagged row.
    if (!isE2EEInitializedRef.current) {
      setStatus('idle')
      return
    }

    // E2EE is enabled but the master key isn't loaded yet (e.g. user hasn't
    // unlocked, or page just mounted). Saving now would push plaintext to a
    // server that thinks the entry is E2EE — corrupting the row beyond
    // recovery. Defer until the next trigger, by which point the user has
    // hopefully unlocked.
    if (isE2EEEnabledRef.current && !isE2EEReadyRef.current) {
      setStatus('idle')
      return
    }

    // Cheap dirty check: if the draft is byte-identical to what's already on
    // the server (or to the last thing we PUT), skip the round-trip. The
    // signature is keyed on the post-shape draft only — entryId is tracked
    // separately, so re-saving the same content for a different entry still
    // goes through the network.
    const draftSig = JSON.stringify({
      entryId: entryIdRef.current,
      text: draft.text,
      song: draft.song,
      photos: draft.photos,
      doodles: draft.doodles,
      style: draft.style,
      entryType: draft.entryType,
      recipientEmail: draft.recipientEmail,
      recipientName: draft.recipientName,
      senderName: draft.senderName,
      letterLocation: draft.letterLocation,
      unlockDate: draft.unlockDate,
    })
    if (draftSig === lastSavedSigRef.current) {
      setStatus('saved')
      return
    }

    inFlightRef.current = true
    dirtyRef.current = false
    setStatus('saving')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-TZ': getClientTz(),
    }

    const baseDraft: Record<string, unknown> = {
      text: draft.text,
      textPreview: createTextPreview(draft.text),
      song: draft.song,
      // Pass through letter metadata only when present in the draft
      ...(draft.senderName !== undefined ? { senderName: draft.senderName } : {}),
      ...(draft.recipientName !== undefined ? { recipientName: draft.recipientName } : {}),
      ...(draft.letterLocation !== undefined ? { letterLocation: draft.letterLocation } : {}),
      // Doodles transit through encryption — strokes JSON gets encrypted.
      // Omit entirely when the caller didn't supply doodles (e.g. letter
      // compose) so the server skips its destructive deleteMany block.
      ...(draft.doodles !== undefined ? { doodles: draft.doodles } : {}),
    }

    const encryptedFields = isE2EEReadyRef.current
      ? await encryptEntryDataRef.current(baseDraft as Parameters<typeof encryptEntryDataRef.current>[0])
      : null

    const body = JSON.stringify({
      ...(encryptedFields ?? baseDraft),
      // Photos stay outside the encryption layer. Omit the key entirely when
      // the caller didn't supply photos (e.g. letter compose) so the server
      // skips its destructive deleteMany + createMany block.
      ...(draft.photos !== undefined ? {
        photos: draft.photos.map(p => ({
          url: p.url,
          encryptedRef: p.encryptedRef,
          encryptedRefIV: p.encryptedRefIV,
          position: p.position,
          rotation: p.rotation,
          spread: p.spread ?? 1,
        })),
      } : {}),
      ...(draft.style && Object.keys(draft.style).length > 0 ? { style: draft.style } : {}),
      ...(draft.entryType !== undefined ? { entryType: draft.entryType } : {}),
      ...(draft.recipientEmail !== undefined ? { recipientEmail: draft.recipientEmail } : {}),
      ...(draft.unlockDate !== undefined ? { unlockDate: draft.unlockDate } : {}),
    })

    try {
      const id = entryIdRef.current
      // Surface what's actually being sent so a missing photo here vs.
      // server-side proves where the loss happens.
      const photosLen = Array.isArray(draft.photos) ? draft.photos.length : 'n/a'
      const photosShape = Array.isArray(draft.photos)
        ? draft.photos.map((p) => ({ pos: p.position, hasUrl: !!p.url, hasEref: !!p.encryptedRef }))
        : null
      console.log('[hearth] autosave →', id ? 'PUT' : 'POST', { entryId: id, photosLen, photosShape })
      const res = id
        ? await fetch(`/api/entries/${id}`, { method: 'PUT', headers, body })
        : await fetch('/api/entries', { method: 'POST', headers, body })
      console.log('[hearth] autosave ←', res.status, id ?? '(new)')

      if (res.ok) {
        if (!id) {
          const data = await res.json()
          if (data?.id) {
            entryIdRef.current = data.id
            setEntryId(data.id)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('hearth:entry-saved', {
                detail: { entryId: data.id, isFirstSaveOfSession: true },
              }))
            }
          }
        }
        // Re-key the signature with the (now-known) entryId so future no-op
        // triggers for the same content short-circuit correctly.
        lastSavedSigRef.current = JSON.stringify({
          entryId: entryIdRef.current,
          text: draft.text,
          song: draft.song,
          photos: draft.photos,
          doodles: draft.doodles,
          style: draft.style,
          entryType: draft.entryType,
          recipientEmail: draft.recipientEmail,
          recipientName: draft.recipientName,
          senderName: draft.senderName,
          letterLocation: draft.letterLocation,
          unlockDate: draft.unlockDate,
        })
        inFlightRef.current = false
        if (dirtyRef.current) {
          // Another change came in while we were saving — kick off another round.
          performSaveRef.current?.(0)
        } else {
          setStatus('saved')
        }
        return
      }

      // Lock-violation: don't retry, surface error.
      if (res.status === 403) {
        inFlightRef.current = false
        setStatus('error')
        return
      }

      throw new Error(`HTTP ${res.status}`)
    } catch {
      inFlightRef.current = false
      if (retryCount < 1) {
        setTimeout(() => performSaveRef.current?.(1), RETRY_DELAY_MS)
      } else {
        setStatus('error')
      }
    }
  }

  const trigger = useCallback((draft: AutosaveDraft) => {
    draftRef.current = draft
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

  const reset = useCallback((nextEntryId: string | null = null) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    draftRef.current = null
    entryIdRef.current = nextEntryId
    inFlightRef.current = false
    dirtyRef.current = false
    setEntryId(nextEntryId)
    setStatus('idle')
  }, [])

  // Cancel pending save on unmount.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Re-fire any deferred save when E2EE finishes initializing or unlocks.
  // Without this, photos/song/text added before the master key was loaded
  // sit in `draftRef.current` forever — the guard in performSave returns
  // silently and nothing else triggers a retry, so the change is lost on
  // refresh. Watching the ready transition catches that.
  const wasE2EEReadyRef = useRef(isE2EEReady)
  useEffect(() => {
    const wasReady = wasE2EEReadyRef.current
    wasE2EEReadyRef.current = isE2EEReady
    if (!wasReady && isE2EEReady && draftRef.current) {
      performSaveRef.current?.(0)
    }
  }, [isE2EEReady])

  return { entryId, flush, reset, trigger }
}

function createTextPreview(html: string, max = 150): string {
  const text = html.replace(/<[^>]*>/g, '').trim()
  return text.length <= max ? text : text.slice(0, max).trim() + '...'
}
