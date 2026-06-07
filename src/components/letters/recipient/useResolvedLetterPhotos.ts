// src/components/letters/recipient/useResolvedLetterPhotos.ts
'use client'

import { useEffect, useState } from 'react'
import { decryptWithLetterKey } from '@/lib/letters/answer-crypto'
import type { Photo } from '@/components/desk/PhotoBlock'

interface AssetMeta {
  id: string
  type: string
  position: number
  spread: number
  rotation: number
  ordinal: number
}

interface CachedAsset {
  id: string
  ciphertext: string
  iv: string
}

/**
 * Decrypts a recipient's letter photos (under the LETTER key, not the master
 * key) into `Photo[]` shaped for PostcardBack/PhotoBlock. Each photo gets a
 * blob URL on `url`, which usePhotoSrc renders as-is (no master key needed).
 *
 * Photos are mapped to the two postcard slots (position 1 / 2) in ordinal order
 * — the friend-letter composer allows at most two. Blob URLs are revoked on
 * cleanup.
 */
export function useResolvedLetterPhotos(
  token: string,
  assets: AssetMeta[],
  letterKey: Uint8Array,
  cachedAssets?: CachedAsset[],
): { photos: Photo[]; error: string | null } {
  const photoAssets = assets.filter((a) => a.type === 'photo')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    ;(async () => {
      try {
        const cacheById = new Map(cachedAssets?.map((c) => [c.id, c]) ?? [])
        const ordered = [...photoAssets].sort((a, b) => a.ordinal - b.ordinal)
        const resolved: Photo[] = []
        for (let i = 0; i < ordered.length && i < 2; i++) {
          const a = ordered[i]
          let payload: { ciphertext: string; iv: string }
          const cached = cacheById.get(a.id)
          if (cached) {
            payload = { ciphertext: cached.ciphertext, iv: cached.iv }
          } else {
            const res = await fetch(`/api/letter/${token}/asset/${a.id}`)
            if (!res.ok) throw new Error(`asset ${a.id}: ${res.status}`)
            payload = (await res.json()) as { ciphertext: string; iv: string }
          }
          const bytes = await decryptWithLetterKey(payload.ciphertext, payload.iv, letterKey)
          const blob = new Blob([bytes as BlobPart])
          const url = URL.createObjectURL(blob)
          urls.push(url)
          resolved.push({ url, rotation: a.rotation ?? 0, position: (i + 1) as 1 | 2 })
        }
        if (!cancelled) setPhotos(resolved)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'unknown error')
      }
    })()
    return () => {
      cancelled = true
      urls.forEach(URL.revokeObjectURL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, photoAssets.map((a) => a.id).join(','), letterKey, cachedAssets])

  return { photos, error }
}
