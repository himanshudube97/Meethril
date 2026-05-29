// src/components/letters/lights/LightsView.tsx
'use client'

import { useState } from 'react'
import { useStrangerNotes } from '@/hooks/useStrangerNotes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ComposePaper from './ComposePaper'
import MobileComposePaper from './MobileComposePaper'
import PlanesSky from './PlanesSky'
import CorrespondenceList from './CorrespondenceList'
import ThreadView from './ThreadView'

const SKY_CAP = 5

export default function LightsView() {
  const sn = useStrangerNotes()
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [composeKey, setComposeKey] = useState(0)
  const layoutMode = useLayoutMode()

  if (sn.loading && sn.threads.length === 0) {
    return (
      <div className="flex justify-center p-10 font-serif text-sm italic" style={{ color: 'var(--text-muted)' }}>
        loading…
      </div>
    )
  }
  if (sn.error && sn.threads.length === 0) {
    return <div className="p-6 text-sm text-red-500">{sn.error}</div>
  }

  if (activeThreadId) {
    return (
      <div className="relative flex flex-col items-center gap-6 p-6 pt-32 sm:p-10 sm:pt-36">
        <ThreadView
          threadId={activeThreadId}
          onClose={() => setActiveThreadId(null)}
          onReply={(content) => sn.sendReply(activeThreadId, content)}
          onSkip={async () => {
            await sn.skip(activeThreadId)
            setActiveThreadId(null)
          }}
          onBlock={async () => {
            await sn.block(activeThreadId)
            setActiveThreadId(null)
          }}
          onWavePromptShown={() => sn.waveOffered(activeThreadId)}
          onWave={() => sn.wave(activeThreadId)}
        />
      </div>
    )
  }

  const Compose = layoutMode === 'mobile' ? MobileComposePaper : ComposePaper
  const unread = sn.threads.filter((t) => t.unreadCount > 0).slice(0, SKY_CAP)

  return (
    <div className="relative mx-auto w-full max-w-6xl p-6 pt-32 sm:p-10 sm:pt-36">
      {/* Intro — mirrors the "sent" tab's header so this page reads as a place,
          not an empty form. Explains the ritual in the app's voice. */}
      <header className="mb-12 text-center">
        <h2
          style={{
            fontFamily: 'var(--font-caveat), Caveat, cursive',
            fontSize: 38,
            lineHeight: 1.1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          notes to a stranger
        </h2>
        <p
          className="mx-auto mt-3.5 max-w-xl font-serif italic"
          style={{ color: 'var(--text-primary)', fontSize: 24, lineHeight: 1.35, letterSpacing: 0.3 }}
        >
          <span style={{ fontSize: 13, opacity: 0.55, color: 'var(--accent-primary)' }}>✦</span>{' '}
          say something true to{' '}
          <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>someone you&rsquo;ll never meet</span>{' '}
          <span style={{ fontSize: 13, opacity: 0.55, color: 'var(--accent-primary)' }}>✦</span>
        </p>
        <p
          className="mt-1.5 font-serif italic"
          style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)', fontSize: 13, letterSpacing: 0.4 }}
        >
          release it into the night — somewhere it finds a stranger, who may write back.
        </p>
      </header>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        {/* Compose column */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-lg">
            <Compose
              key={composeKey}
              onSend={(content, country, stateName) => sn.sendNewNote(content, country, stateName)}
              onDismiss={() => setComposeKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* Sky + list column */}
        <div className="flex w-full justify-center lg:justify-start">
          <div className="w-full max-w-md">
            <p
              className="mb-3 text-center font-serif text-[11px] uppercase italic lg:text-left"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                letterSpacing: '0.22em',
              }}
            >
              new arrivals
            </p>
            <PlanesSky threads={unread} onPick={(id) => setActiveThreadId(id)} />

            <p
              className="mb-3 mt-6 text-center font-serif text-[11px] uppercase italic lg:text-left"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                letterSpacing: '0.22em',
              }}
            >
              all correspondence
            </p>
            <CorrespondenceList
              threads={sn.threads}
              onPick={(id) => setActiveThreadId(id)}
              onLoadMore={sn.loadMore}
              hasMore={Boolean(sn.nextCursor)}
              loadingMore={sn.loadingMore}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
