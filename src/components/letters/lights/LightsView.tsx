'use client'

import { useState } from 'react'
import { useStrangerNotes } from '@/hooks/useStrangerNotes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ComposePaper from './ComposePaper'
import MobileComposePaper from './MobileComposePaper'
import PlanesCluster from './PlanesCluster'
import ThreadView from './ThreadView'

export default function LightsView() {
  const sn = useStrangerNotes()
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  // Bump the key on dismiss so a fresh ComposePaper instance mounts (cleared text, ready to write).
  const [composeKey, setComposeKey] = useState(0)
  const layoutMode = useLayoutMode()

  if (sn.loading && !sn.data) {
    return (
      <div className="flex justify-center p-10 font-serif text-sm italic" style={{ color: 'var(--text-muted)' }}>
        loading…
      </div>
    )
  }
  if (sn.error && !sn.data) {
    return <div className="p-6 text-sm text-red-500">{sn.error}</div>
  }
  if (!sn.data) return null

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

  return (
    <div className="relative mx-auto w-full max-w-6xl p-6 pt-32 sm:p-10 sm:pt-36">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        {/* Compose column — write a new stranger note */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md">
            <Compose
              key={composeKey}
              onSend={(content, country, stateName) => sn.sendNewNote(content, country, stateName)}
              onDismiss={() => setComposeKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* Planes column — sent / received notes as paper planes. Tap to open. */}
        <div className="flex w-full justify-center lg:justify-start">
          <div className="w-full max-w-md">
            <p
              className="mb-4 text-center font-serif text-[11px] uppercase italic lg:text-left"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                letterSpacing: '0.22em',
              }}
            >
              your planes
            </p>
            <PlanesCluster
              active={sn.data.active}
              penpals={sn.data.penpals}
              outgoing={sn.data.outgoing}
              onPick={(id) => setActiveThreadId(id)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
