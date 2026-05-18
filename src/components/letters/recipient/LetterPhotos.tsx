// src/components/letters/recipient/LetterPhotos.tsx
'use client'

import { useEffect, useState } from 'react'
import { decryptWithLetterKey } from '@/lib/letters/answer-crypto'

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

interface Props {
  token: string
  assets: AssetMeta[]
  letterKey: Uint8Array
  cachedAssets?: CachedAsset[]
}

interface ResolvedPhoto extends AssetMeta {
  blobUrl: string
}

export function LetterPhotos({ token, assets, letterKey, cachedAssets }: Props) {
  const photoAssets = assets.filter((a) => a.type === 'photo')
  const [photos, setPhotos] = useState<ResolvedPhoto[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    ;(async () => {
      try {
        const cacheById = new Map(cachedAssets?.map((c) => [c.id, c]) ?? [])
        const resolved: ResolvedPhoto[] = []
        for (const a of photoAssets) {
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
          resolved.push({ ...a, blobUrl: url })
        }
        if (!cancelled) setPhotos(resolved)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'unknown error')
      }
    })()
    return () => {
      cancelled = true
      urls.forEach(URL.revokeObjectURL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, photoAssets.map((a) => a.id).join(','), letterKey, cachedAssets])

  if (err) return <p style={{ color: '#a00', fontSize: 13 }}>Photos: {err}</p>
  if (photos.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 32, justifyContent: 'center' }}>
      {photos
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((p) => (
          <div
            key={p.id}
            style={{
              transform: `rotate(${p.rotation}deg)`,
              padding: 8,
              paddingBottom: 24,
              background: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <img src={p.blobUrl} style={{ display: 'block', width: 200, height: 250, objectFit: 'cover' }} alt="" />
          </div>
        ))}
    </div>
  )
}
