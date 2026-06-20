'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { StrokeData } from '@/store/journal'
import type { EntryStyle } from '@/lib/entry-style'
import { useDeskStore, type AutosaveStatus } from '@/store/desk'
import { useE2EE } from './useE2EE'

const DEBOUNCE_MS = 1500
const RETRY_DELAY_MS = 2000

export interface LetterDraftAutosavePayload {
  // letterType drives /api/letters/drafts POST/PUT. Toggles between self
  // and friend as the user fills in (or removes) a recipient.
  letterType: 'self' | 'friend'
  text: string
  song: string | null
  // Photo refs travel outside the encryption layer — same as journal entries.
  photos: {
    url?: string | null
    encryptedRef?: string | null
    encryptedRefIV?: string | null
    position: number
    rotation: number
    spread: number
  }[]
  doodleStrokes: StrokeData[]
  recipientName?: string | null
  recipientEmail?: string | null
  letterLocation?: string | null
  style?: EntryStyle
}

export type { AutosaveStatus }

export interface UseAutosaveLetterDraftResult {
  draftId: string | null
  /** Forces a pending save and resolves with the draft id (from the ref, not
   *  React state) so callers can seal immediately after a first save without
   *  waiting for a re-render. */
  flush: () => Promise<string | null>
  reset: (nextDraftId?: string | null) => void
  trigger: (payload: LetterDraftAutosavePayload) => void
}

function isPayloadEmpty(p: LetterDraftAutosavePayload): boolean {
  if (p.text && p.text.trim().length > 0) return false
  if (p.song && p.song.trim().length > 0) return false
  if (p.photos.length > 0) return false
  if (p.doodleStrokes.length > 0) return false
  return true
}

// Map an encryptDraft result back to the letter-row column shape.
// encryptDraft uses `text`/`song`/`doodles` field names plus an
// `e2eeIVs` map — letters store the body in contentCiphertext/contentIVs and
// the song in draftSong/draftSongIV. Photos pass through as-is.
function buildWireBody(args: {
  encrypted: Record<string, unknown> | null
  plaintext: LetterDraftAutosavePayload
}): Record<string, unknown> {
  const { encrypted, plaintext } = args

  if (encrypted) {
    const ivs = (encrypted.e2eeIVs ?? {}) as Record<string, string | undefined>
    return {
      letterType: plaintext.letterType,
      contentCiphertext: (encrypted.text as string | undefined) ?? null,
      contentIVs: ivs.text ? { content: ivs.text } : null,
      draftSong: (encrypted.song as string | undefined) ?? null,
      draftSongIV: ivs.song ?? null,
      draftPhotos: plaintext.photos.map((p) => ({
        url: p.url ?? null,
        encryptedRef: p.encryptedRef ?? null,
        encryptedRefIV: p.encryptedRefIV ?? null,
        position: p.position,
        rotation: p.rotation,
        spread: p.spread,
      })),
      draftDoodles: encrypted.doodles ?? null,
      draftStyle: plaintext.style && Object.keys(plaintext.style).length > 0 ? plaintext.style : null,
      recipientName: plaintext.recipientName ?? null,
      recipientEmail: plaintext.recipientEmail ?? null,
      letterLocation: plaintext.letterLocation ?? null,
    }
  }

  // E2EE-off path (currently only exercised before the master key initialises;
  // performSave defers in that case so this branch is mostly defensive).
  return {
    letterType: plaintext.letterType,
    contentCiphertext: plaintext.text,
    contentIVs: null,
    draftSong: plaintext.song,
    draftSongIV: null,
    draftPhotos: plaintext.photos,
    draftDoodles:
      plaintext.doodleStrokes.length > 0
        ? [{ strokes: plaintext.doodleStrokes, spread: 1, positionInEntry: 0 }]
        : null,
    draftStyle: plaintext.style && Object.keys(plaintext.style).length > 0 ? plaintext.style : null,
    recipientName: plaintext.recipientName ?? null,
    recipientEmail: plaintext.recipientEmail ?? null,
    letterLocation: plaintext.letterLocation ?? null,
  }
}

export function useAutosaveLetterDraft(
  initialDraftId: string | null = null,
): UseAutosaveLetterDraftResult {
  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const setStatus = useDeskStore.getState().setAutosaveStatus

  const draftIdRef = useRef<string | null>(initialDraftId)
  const payloadRef = useRef<LetterDraftAutosavePayload | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const dirtyRef = useRef(false)
  const lastSavedSigRef = useRef<string | null>(null)
  // Guard setState / dispatchEvent against fire-after-unmount. The first POST
  // creates the draft row; if the component unmounts before it resolves the
  // returned id would be set on a dead instance, orphaning the draft.
  const mountedRef = useRef(true)

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
    const p = payloadRef.current
    if (!p) return
    if (isPayloadEmpty(p) && !draftIdRef.current) {
      return
    }
    if (inFlightRef.current) {
      dirtyRef.current = true
      return
    }

    if (!isE2EEInitializedRef.current) {
      setStatus('idle')
      return
    }
    if (isE2EEEnabledRef.current && !isE2EEReadyRef.current) {
      setStatus('idle')
      return
    }

    const sig = JSON.stringify({
      id: draftIdRef.current,
      letterType: p.letterType,
      text: p.text,
      song: p.song,
      photos: p.photos,
      doodleStrokes: p.doodleStrokes,
      recipientName: p.recipientName,
      recipientEmail: p.recipientEmail,
      letterLocation: p.letterLocation,
      style: p.style,
    })
    if (sig === lastSavedSigRef.current) {
      setStatus('saved')
      return
    }

    inFlightRef.current = true
    dirtyRef.current = false
    setStatus('saving')

    // encryptDraft only knows about `text`, `song`, and `doodles` — pass those
    // three fields and remap the result into the letter wire shape.
    const encryptable = {
      text: p.text,
      song: p.song,
      doodles:
        p.doodleStrokes.length > 0
          ? [{ strokes: p.doodleStrokes, spread: 1, positionInEntry: 0 }]
          : undefined,
    }
    const encrypted = isE2EEReadyRef.current
      ? await encryptEntryDataRef.current(encryptable)
      : null

    const body = JSON.stringify(buildWireBody({ encrypted, plaintext: p }))

    try {
      const id = draftIdRef.current
      console.log('[hearth] letter-draft autosave →', id ? 'PUT' : 'POST', { draftId: id })
      const res = id
        ? await fetch(`/api/letters/drafts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        : await fetch('/api/letters/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
      console.log('[hearth] letter-draft autosave ←', res.status, id ?? '(new)')

      if (res.ok) {
        if (!id) {
          const data = await res.json()
          if (data?.id && mountedRef.current) {
            draftIdRef.current = data.id
            setDraftId(data.id)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('hearth:letter-draft-saved', {
                  detail: { draftId: data.id, isFirstSaveOfSession: true },
                }),
              )
            }
          }
        }
        lastSavedSigRef.current = sig
        inFlightRef.current = false
        if (!mountedRef.current) return
        if (dirtyRef.current) {
          performSaveRef.current?.(0)
        } else {
          setStatus('saved')
        }
        return
      }

      if (res.status === 403 || res.status === 404) {
        inFlightRef.current = false
        if (mountedRef.current) setStatus('error')
        return
      }

      throw new Error(`HTTP ${res.status}`)
    } catch {
      inFlightRef.current = false
      if (!mountedRef.current) return
      if (retryCount < 1) {
        retryTimeoutRef.current = setTimeout(
          () => performSaveRef.current?.(1),
          RETRY_DELAY_MS,
        )
      } else {
        setStatus('error')
      }
    }
  }

  const trigger = useCallback((payload: LetterDraftAutosavePayload) => {
    payloadRef.current = payload
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      performSaveRef.current?.(0)
    }, DEBOUNCE_MS)
  }, [])

  const flush = useCallback(async (): Promise<string | null> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    await performSaveRef.current?.(0)
    // If a create POST was already in flight, performSave deferred rather than
    // starting a second one — wait briefly for that in-flight create to set the
    // id (resolves in ms against the local trial interceptor / fast server).
    for (let i = 0; i < 40 && !draftIdRef.current && inFlightRef.current; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    // Return the id from the ref — performSave sets draftIdRef synchronously on
    // the POST response, before React commits setDraftId. Callers (seal) can use
    // this immediately without waiting for a re-render.
    return draftIdRef.current
  }, [])

  const reset = useCallback((nextDraftId: string | null = null) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    payloadRef.current = null
    draftIdRef.current = nextDraftId
    inFlightRef.current = false
    dirtyRef.current = false
    setDraftId(nextDraftId)
    setStatus('idle')
  }, [])

  useEffect(() => {
    // Set true on mount, not just false on unmount: under React StrictMode the
    // dev double-invoke runs mount → cleanup(false) → remount, and without
    // re-setting true here mountedRef stays false forever — which silently
    // dropped the create-POST's draft id (`if (data?.id && mountedRef.current)`),
    // so seal saw no draftId ("Draft has not been saved yet").
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  }, [])

  // Re-fire any deferred save once E2EE finishes initialising — mirrors
  // useAutosaveEntry. Without this, a draft started before the master key
  // loads sits in payloadRef forever and is lost on unmount/refresh.
  const wasE2EEReadyRef = useRef(isE2EEReady)
  useEffect(() => {
    const wasReady = wasE2EEReadyRef.current
    wasE2EEReadyRef.current = isE2EEReady
    if (!wasReady && isE2EEReady && payloadRef.current) {
      performSaveRef.current?.(0)
    }
  }, [isE2EEReady])

  return { draftId, flush, reset, trigger }
}
