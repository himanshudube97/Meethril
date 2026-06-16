'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import ScrapbookCanvas from '@/components/scrapbook/ScrapbookCanvas'
import type { ScrapbookItem } from '@/lib/scrapbook'
import { useE2EEStore } from '@/store/e2ee'
import { decryptString } from '@/lib/e2ee/crypto'

interface BoardData {
  id: string
  title: string | null
  items: ScrapbookItem[]
  e2eeIVs?: { title?: string; items: string } | null
}

async function decryptScrapbookIfNeeded(
  data: BoardData,
  masterKey: CryptoKey | null
): Promise<BoardData> {
  // All scrapbooks are E2EE — always attempt decryption.
  if (!masterKey) throw new Error('Unlock E2EE to view this scrapbook.')

  const ivs = data.e2eeIVs as { title?: string; items: string } | null
  if (!ivs) throw new Error('Scrapbook is missing decryption metadata.')

  const title =
    data.title && ivs.title
      ? await decryptString(data.title, ivs.title, masterKey)
      : data.title

  const itemsJson = await decryptString(data.items as unknown as string, ivs.items, masterKey)
  const items = JSON.parse(itemsJson) as ScrapbookItem[]

  return { ...data, title, items }
}

export default function ScrapbookBoardPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const pathname = usePathname()
  // Same page renders at /scrapbook/[id] and /try/scrapbook/[id]; keep the back
  // button inside whichever shell we're in so /try doesn't escape to real routes.
  const listingPath = pathname.startsWith('/try') ? '/try/scrapbook' : '/scrapbook'
  const [board, setBoard] = useState<BoardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const masterKey = useE2EEStore((s) => s.masterKey)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing: reset error on param/key change before refetch
    setError(null)
    fetch(`/api/scrapbooks/${params.id}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error('Board not found')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<BoardData>
      })
      .then(async (data) => {
        const decrypted = await decryptScrapbookIfNeeded(data, masterKey)
        if (!cancelled) setBoard(decrypted)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [params.id, masterKey])

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(58,52,41,0.7)' }}>
        <div style={{ fontFamily: 'var(--font-caveat), cursive', fontSize: 22 }}>
          couldn’t open this scrapbook
        </div>
        <div style={{ marginTop: 6, fontSize: 14 }}>{error}</div>
        <button
          onClick={() => router.push(listingPath)}
          style={{
            marginTop: 16,
            padding: '6px 14px',
            border: '1px solid rgba(58,52,41,0.22)',
            borderRadius: 999,
            background: '#fefdf8',
            cursor: 'pointer',
          }}
        >
          back to scrapbooks
        </button>
      </div>
    )
  }

  if (!board) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(58,52,41,0.55)' }}>
        opening…
      </div>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ padding: '8px 24px' }}>
        <button
          onClick={() => router.push(listingPath)}
          style={{
            padding: '4px 12px',
            border: '1px solid rgba(58,52,41,0.22)',
            borderRadius: 999,
            background: '#fefdf8',
            cursor: 'pointer',
            fontFamily: 'var(--font-caveat), cursive',
            fontSize: 16,
            color: '#3a3429',
          }}
        >
          ← all scrapbooks
        </button>
      </div>
      <ScrapbookCanvas boardId={board.id} initialItems={board.items} />
    </div>
  )
}
