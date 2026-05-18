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

interface Props {
  token: string
  assets: AssetMeta[]
  K: Uint8Array
}

interface ResolvedPhoto extends AssetMeta {
  blobUrl: string
}

export function LetterPhotos({ token, assets, K }: Props) {
  const photoAssets = assets.filter((a) => a.type === 'photo')
  const [photos, setPhotos] = useState<ResolvedPhoto[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    ;(async () => {
      try {
        const resolved: ResolvedPhoto[] = []
        for (const a of photoAssets) {
          const res = await fetch(`/api/letter/${token}/asset/${a.id}`)
          if (!res.ok) throw new Error(`asset ${a.id}: ${res.status}`)
          const data = (await res.json()) as { ciphertext: string; iv: string }
          const bytes = await decryptWithLetterKey(data.ciphertext, data.iv, K)
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
  }, [token, photoAssets.map((a) => a.id).join(','), K])

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
