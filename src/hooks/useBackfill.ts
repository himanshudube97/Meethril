'use client'
import { useCallback, useRef } from 'react'
import { useE2EEStore } from '@/store/e2ee'
import { encryptDraft } from '@/lib/e2ee/draft-encryptor'
import { encryptBytes, encryptString } from '@/lib/e2ee/crypto'

interface BackfillEntry {
  id: string
  text?: string
  textPreview?: string
  tags?: string[]
  song?: string | null
  doodles?: { id: string; strokes: unknown }[]
  photos?: { id: string; url?: string }[]
}

interface BackfillScrapbook {
  id: string
  title?: string
  items: unknown[]
}

export function useBackfill() {
  // Re-entry guard. The auto-resume effect in E2EEProvider depends on the
  // store's `backfillProgress.status`; once we set it to 'running' below the
  // effect re-fires and calls runBackfill again. Without this guard, every
  // entry migration spawns another concurrent backfill, all racing to PUT
  // the same rows.
  const runningRef = useRef(false)

  const runBackfill = useCallback(async () => {
    if (runningRef.current) return
    // Pull mutable state via getState() so changes to backfillProgress don't
    // invalidate this callback's identity. Stable identity means the
    // E2EEProvider effect has stable deps and won't re-fire mid-run.
    const { masterKey, backfillProgress, setBackfillProgress } = useE2EEStore.getState()
    if (!masterKey) return
    runningRef.current = true
    try {
    setBackfillProgress({ status: 'running' })

    let cursor = backfillProgress.lastCursor
    let migrated = backfillProgress.migrated
    const failedIds = [...backfillProgress.failedIds]

    // ENTRIES loop
    while (true) {
      const url = `/api/entries/backfill-batch${cursor ? `?cursor=${cursor}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        setBackfillProgress({ status: 'error' })
        return
      }
      const { entries, nextCursor } = (await res.json()) as {
        entries: BackfillEntry[]
        nextCursor: string | null
      }
      if (!entries || entries.length === 0) break

      for (const entry of entries) {
        try {
          const draft = {
            text: entry.text ?? '',
            textPreview: entry.textPreview ?? null,
            tags: entry.tags ?? null,
            song: entry.song ?? null,
            doodles: entry.doodles ?? [],
          }
          const encryptedFields = await encryptDraft(draft, masterKey)

          // Migrate photos: download plaintext data URL → encrypt bytes → upload → update encryptedRef
          const newPhotos: Array<{
            id?: string
            url?: string | null
            encryptedRef?: string
            encryptedRefIV?: string
          }> = []
          // Track each handle we successfully uploaded this round so that
          // if the entry PUT below fails, we can record those handles as
          // orphans for the sweep cron to clean up.
          const uploadedHandles: string[] = []

          // Track previously plaintext handles whose bytes need to be deleted
          // *after* the entry PUT succeeds with the new encrypted handle.
          // Doing it before would leave the entry pointing at deleted bytes
          // if the PUT fails.
          const oldHandlesToDelete: string[] = []

          for (const p of entry.photos ?? []) {
            // Two paths produce a plaintext blob the server can read:
            //   1. legacy `data:image/...` URLs inlined in the row
            //   2. `/api/photos/{handle}` URLs from the post-adapter,
            //      pre-E2EE era — bytes sit in Supabase plaintext.
            // Either way, get the bytes into an ArrayBuffer, encrypt, upload
            // ciphertext, and swap the row to use encryptedRef. After the
            // entry PUT lands, delete the old plaintext bytes so the server
            // can't read them anymore.
            const isDataUrl = p.url?.startsWith('data:')
            const isPlainHandle = p.url?.startsWith('/api/photos/')

            if (!isDataUrl && !isPlainHandle) {
              // Already E2EE (encryptedRef set) or some other shape we don't
              // touch — pass through unchanged.
              newPhotos.push(p)
              continue
            }

            try {
              let bytes: Uint8Array
              if (isDataUrl) {
                const b64 = p.url!.split(',')[1]
                bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
              } else {
                // Fetch the plaintext bytes from the storage adapter.
                const dlRes = await fetch(p.url!)
                if (!dlRes.ok) throw new Error(`fetch failed: ${dlRes.status}`)
                bytes = new Uint8Array(await dlRes.arrayBuffer())
              }

              const { ciphertext, iv } = await encryptBytes(bytes.buffer as ArrayBuffer, masterKey)
              const cipherBytes = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
              const upRes = await fetch('/api/photos', {
                method: 'POST',
                body: cipherBytes,
                headers: { 'Content-Type': 'application/octet-stream' },
              })
              if (!upRes.ok) throw new Error('upload failed')
              const { handle } = await upRes.json()
              uploadedHandles.push(handle)

              const refEnc = await encryptString(JSON.stringify({ handle, iv }), masterKey)
              newPhotos.push({
                id: p.id,
                url: null,
                encryptedRef: refEnc.ciphertext,
                encryptedRefIV: refEnc.iv,
              })

              // Queue the old plaintext blob for deletion (only for the
              // handle path — data URLs have no server blob).
              if (isPlainHandle) {
                const oldHandle = p.url!.slice('/api/photos/'.length)
                oldHandlesToDelete.push(oldHandle)
              }
            } catch (err) {
              console.error('photo migration failed', p.id, err)
              newPhotos.push(p)
            }
          }

          const putRes = await fetch(`/api/entries/${entry.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...encryptedFields, photos: newPhotos }),
          })
          if (!putRes.ok) {
            // Entry PUT failed but the encrypted blobs are already uploaded.
            // Record them so the sweep cron deletes them later — otherwise
            // the user pays for storage on data nothing references.
            for (const h of uploadedHandles) {
              await fetch('/api/orphaned-blobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ handle: h, reason: 'backfill_failed' }),
              }).catch(() => {})
            }
            throw new Error('PUT failed')
          }

          // PUT landed — the row now references the encrypted handles, so
          // it's safe to delete the old plaintext bytes from the storage
          // adapter. Fire-and-forget: a failed delete only leaves an
          // unreferenced object behind, the user data is already E2EE.
          for (const h of oldHandlesToDelete) {
            // Slashes in `{userId}/{uuid}.bin` handles must stay as path
            // separators for the catch-all [...handle] route; encode segments,
            // not the whole string.
            fetch(`/api/photos/${h.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }).catch(() => {})
          }
          migrated += 1
          cursor = entry.id
          setBackfillProgress({ migrated, lastCursor: cursor })
        } catch (err) {
          console.error('migration failed for', entry.id, err)
          failedIds.push(entry.id)
          setBackfillProgress({ failedIds })
        }
      }

      if (!nextCursor) break
      cursor = nextCursor
    }

    // SCRAPBOOKS loop — same pattern, simpler payload (no photos)
    let sbCursor: string | null = null
    while (true) {
      const url = `/api/scrapbooks/backfill-batch${sbCursor ? `?cursor=${sbCursor}` : ''}`
      const res = await fetch(url)
      if (!res.ok) break
      const { scrapbooks, nextCursor } = (await res.json()) as {
        scrapbooks: BackfillScrapbook[]
        nextCursor: string | null
      }
      if (!scrapbooks || scrapbooks.length === 0) break

      for (const sb of scrapbooks) {
        try {
          const titleEnc = sb.title ? await encryptString(sb.title, masterKey) : null
          const itemsEnc = await encryptString(JSON.stringify(sb.items), masterKey)
          const putRes = await fetch(`/api/scrapbooks/${sb.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: titleEnc?.ciphertext,
              items: itemsEnc.ciphertext,
              encryptionType: 'e2ee',
              e2eeIVs: {
                ...(titleEnc ? { title: titleEnc.iv } : {}),
                items: itemsEnc.iv,
              },
            }),
          })
          if (!putRes.ok) throw new Error('PUT failed')
        } catch (err) {
          console.error('scrapbook migration failed', sb.id, err)
          failedIds.push(`scrapbook:${sb.id}`)
          setBackfillProgress({ failedIds })
        }
      }

      if (!nextCursor) break
      sbCursor = nextCursor
    }

    setBackfillProgress({ status: 'done' })
    } finally {
      runningRef.current = false
    }
  }, [])

  // Reset failed-IDs and re-run the migration. The backfill-batch endpoints
  // already return only entries/scrapbooks that aren't yet on E2EE, so a
  // re-run picks up exactly the items we previously failed on without
  // double-encrypting anything that succeeded.
  const retryFailedIds = useCallback(async () => {
    useE2EEStore.getState().setBackfillProgress({ status: 'idle', lastCursor: null, failedIds: [] })
    await runBackfill()
  }, [runBackfill])

  return { runBackfill, retryFailedIds }
}
