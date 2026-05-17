'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import PostalSky from './PostalSky'
import Lamp from './Lamp'
import Postbox from './Postbox'
import PostboxControls from './PostboxControls'
import WriteCard from './WriteCard'
import TopHint from './TopHint'
import NewLetterTag from './NewLetterTag'
import LetterFanout from './LetterFanout'
import RevealModal from './RevealModal'
import { MONTHS, MONTH_NAMES, groupInboxByMonth, countUnread } from '../lettersData'
import type { InboxLetter } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'

interface Props {
  onUnreadCountChange: (n: number) => void
}

export default function InboxView({ onUnreadCountChange }: Props) {
  const router = useRouter()
  const [letters, setLetters] = useState<InboxLetter[]>([])
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIdx, setMonthIdx] = useState(today.getMonth())
  const [fanTriggerKey, setFanTriggerKey] = useState(0)
  const [revealLetter, setRevealLetter] = useState<InboxLetter | null>(null)
  const { isE2EEReady } = useE2EE()

  // List view only renders unencrypted metadata (recipient name, dates,
  // isViewed). Don't decrypt here — RevealModal does the single decrypt
  // when the user actually opens a letter. Decrypting in InboxView caused
  // double-decryption: text was decrypted once here, stored as plaintext
  // JSON in state, then RevealModal tried to decrypt the already-decrypted
  // string and atob exploded on `{`.
  useEffect(() => {
    let cancelled = false
    fetch('/api/letters/inbox')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const raw = (d.letters || []) as InboxLetter[]
        setLetters(raw)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isE2EEReady])

  const grouped = useMemo(() => groupInboxByMonth(letters), [letters])

  const yearsWithLetters = Object.keys(grouped).map(Number)
  const yearMin = yearsWithLetters.length ? Math.min(...yearsWithLetters) : today.getFullYear()
  const yearMax = today.getFullYear()
  const monthMaxForCurrentYear = today.getMonth()

  // Once we've loaded the inbox for the first time, jump to the month that
  // actually has letters — preferring the most recent unread, falling back
  // to the most recent overall. Without this, the inbox lands on today's
  // month by default; if the user's letters arrived earlier, the postbox
  // would appear empty and clicking it would do nothing visible.
  const hasSnappedRef = useRef(false)
  useEffect(() => {
    if (hasSnappedRef.current) return
    if (letters.length === 0) return
    hasSnappedRef.current = true

    const sortedDesc = [...letters].sort((a, b) => {
      const at = a.unlockDate ? Date.parse(a.unlockDate) : 0
      const bt = b.unlockDate ? Date.parse(b.unlockDate) : 0
      return bt - at
    })
    const target = sortedDesc.find((l) => !l.isViewed) ?? sortedDesc[0]
    if (!target?.unlockDate) return
    const d = new Date(target.unlockDate)
    setYear(d.getFullYear())
    setMonthIdx(d.getMonth())
  }, [letters])

  const currentLetters: InboxLetter[] =
    grouped[year]?.[MONTHS[monthIdx]] ?? []

  const newCountTotal = countUnread(letters)

  useEffect(() => { onUnreadCountChange(newCountTotal) }, [newCountTotal, onUnreadCountChange])

  // re-fan when month/year/letters count changes
  useEffect(() => { setFanTriggerKey(k => k + 1) }, [year, monthIdx, letters.length])

  return (
    <section
      className="relative h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, var(--bg-1), var(--bg-2))' }}
    >
      <PostalSky />
      <TopHint newCount={newCountTotal} />

      <div className="absolute inset-0 z-[5] flex items-end justify-center w-full pb-[160px]">
        <div className="flex items-end gap-[60px] w-full px-[80px] justify-center">
          <WriteCard onBegin={() => router.push('/letters/write')} />

          <div className="flex items-end gap-[80px]">
            <Lamp />
            <Postbox onClick={() => setFanTriggerKey(k => k + 1)}>
              <PostboxControls
                year={year}
                monthIdx={monthIdx}
                yearMin={yearMin}
                yearMax={yearMax}
                monthMaxForCurrentYear={monthMaxForCurrentYear}
                onYearChange={setYear}
                onMonthChange={setMonthIdx}
              />
              <NewLetterTag count={newCountTotal} />
            </Postbox>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-[20px] left-1/2 -translate-x-1/2 text-center italic"
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          color: 'var(--text-secondary)',
          fontSize: 13,
          letterSpacing: 1.2,
        }}
      >
        — {MONTH_NAMES[monthIdx]} · {year} · {captionFor(currentLetters)} —
      </div>

      <LetterFanout
        letters={currentLetters}
        triggerKey={fanTriggerKey}
        onLetterClick={setRevealLetter}
      />

      <RevealModal
        letter={revealLetter}
        onClose={() => setRevealLetter(null)}
        onMarkRead={(id) => {
          fetch(`/api/letters/${id}/read`, { method: 'POST' }).catch(() => {})
          setLetters(ls => ls.map(l => l.id === id ? { ...l, isViewed: true } : l))
        }}
      />
    </section>
  )
}

function captionFor(letters: InboxLetter[]) {
  const total = letters.length
  const newC = letters.filter(l => !l.isViewed).length
  if (total === 0) return 'the box was empty'
  if (newC === total) return `${newC} new letter${newC === 1 ? '' : 's'} ✦ unread`
  if (newC > 0)      return `${newC} new · ${total - newC} read`
  return `${total} letter${total === 1 ? '' : 's'} arrived`
}
