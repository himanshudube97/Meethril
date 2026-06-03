'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ScrapbookDesktopOnly from '../ScrapbookDesktopOnly'
import ScrapbookTokens from './ScrapbookTokens'
// Reuse the Letters scene backdrop so /scrapbook and /letters share the
// exact same horizon, sun glow, hills, village glints, and particle
// animations — switching tabs feels continuous.
import PostalSky from '@/components/letters/inbox/PostalSky'
import MemoryChest from './MemoryChest'
import ChestControls from './ChestControls'
import ChestActionCard from './ChestActionCard'
import ScrapbookCardFanout from './ScrapbookCardFanout'
import {
  ScrapbookSummary,
  groupByMonth,
  pickerBounds,
  MONTH_NAMES,
} from './listingHelpers'
import { makeDateItem } from '@/lib/scrapbook'
import { useE2EEStore } from '@/store/e2ee'
import { encryptString } from '@/lib/e2ee/crypto'
import { parseLimitError } from '@/lib/billing/limit-error'
import { useLimitPromptStore } from '@/store/limit-prompt'

/**
 * Memory-chest listing scene for /scrapbook. Mirrors the Letters page
 * architecture: horizon backdrop, action card on the left, chest on the
 * right, picker on the brass plate, fanout reveal on click.
 */
export default function ScrapbookListingView() {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const layoutMode = useLayoutMode()

  // Scrapbook is a desktop craft surface; on phones we show a soft
  // "open on desktop" page instead of trying to cram the canvas onto
  // a narrow screen. Listing route hits this just like the canvas does.
  if (layoutMode === 'mobile') return <ScrapbookDesktopOnly />

  const [books, setBooks] = useState<ScrapbookSummary[] | null>(null)
  const [year, setYear] = useState(today.getFullYear())
  const [monthIdx, setMonthIdx] = useState(today.getMonth())
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // initial fetch
  useEffect(() => {
    let cancelled = false
    fetch('/api/scrapbooks')
      .then(r => r.json())
      .then((list: ScrapbookSummary[]) => {
        if (cancelled) return
        setBooks(list)
      })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => groupByMonth(books ?? []), [books])
  const bounds = useMemo(() => pickerBounds(books ?? []), [books])
  const currentBooks = grouped[year]?.[monthIdx] ?? []
  const count = currentBooks.length

  function setMonth(next: number) {
    setMonthIdx(next)
    setActiveId(null)
  }
  function setYearAndReset(next: number) {
    setYear(next)
    setActiveId(null)
  }

  function handleCardClick(id: string) {
    setActiveId(id)
    // Brief visual pop, then navigate.
    setTimeout(() => router.push(`/scrapbook/${id}`), 150)
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const { masterKey, isEnabled, isUnlocked } = useE2EEStore.getState()
      if (!isEnabled || !isUnlocked || !masterKey) {
        throw new Error('Unlock E2EE to create a scrapbook.')
      }
      const initialItems = [makeDateItem(new Date(), [])]
      const itemsEnc = await encryptString(JSON.stringify(initialItems), masterKey)
      const res = await fetch('/api/scrapbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsEnc.ciphertext,
          e2eeIVs: { items: itemsEnc.iv },
        }),
      })
      if (!res.ok) {
        const limit = await parseLimitError(res)
        if (limit) {
          useLimitPromptStore.getState().show(limit)
          setCreating(false)
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const created = await res.json()
      router.push(`/scrapbook/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  const caption =
    books === null ? 'loading…'
    : count === 0  ? 'the chest was empty'
    : count === 1  ? '1 scrapbook tucked away'
                   : `${count} scrapbooks tucked away`

  return (
    <>
      <ScrapbookTokens />
      <section className="chest-page">
        <PostalSky />

        <ScrapbookCardFanout
          open={open}
          books={currentBooks}
          monthIdx={monthIdx}
          activeId={activeId}
          onCardClick={handleCardClick}
        />

        <div className="scene">
          <ChestActionCard
            open={open}
            count={count}
            onCreate={handleCreate}
            creating={creating}
          />

          <MemoryChest open={open} onToggle={() => setOpen(o => !o)}>
            <ChestControls
              year={year}
              monthIdx={monthIdx}
              yearMin={bounds.yearMin}
              yearMax={bounds.yearMax}
              monthMaxForCurrentYear={bounds.monthMaxForCurrentYear}
              onYearChange={setYearAndReset}
              onMonthChange={setMonth}
              newCount={count}
            />
          </MemoryChest>
        </div>

        <div className="caption">
          — {MONTH_NAMES[monthIdx]} · {year} · {caption} —
        </div>

        {error && <div className="error">{error}</div>}

        <style jsx>{`
          .chest-page {
            position: relative;
            height: 100vh;
            width: 100%;
            overflow: hidden;
            background: var(--bg-1);
            font-family: 'Cormorant Garamond', 'Playfair Display', serif;
            color: var(--text-primary);
          }
          .scene {
            position: relative;
            z-index: 2;
            height: 100vh;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 80px;
            padding: 0 80px 160px;
          }
          .caption {
            position: absolute;
            left: 50%;
            bottom: 24px;
            transform: translateX(-50%);
            font-family: 'Cormorant Garamond', serif;
            font-style: italic;
            font-size: 14px;
            letter-spacing: 1.2px;
            color: var(--text-muted);
            z-index: 10;
          }
          .error {
            position: absolute;
            top: 18px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(168, 90, 74, 0.15);
            color: var(--accent-warm);
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-style: italic;
            z-index: 100;
          }
        `}</style>
      </section>
    </>
  )
}
