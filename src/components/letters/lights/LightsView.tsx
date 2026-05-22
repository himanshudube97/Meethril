'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStrangerNotes, type InboxThread } from '@/hooks/useStrangerNotes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ComposePaper from './ComposePaper'
import MobileComposePaper from './MobileComposePaper'
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

  const shelves: { label: string; items: InboxThread[]; emphasis?: 'warm' | 'primary' }[] = [
    { label: 'open exchanges', items: sn.data.active, emphasis: 'warm' },
    { label: 'pen pals', items: sn.data.penpals, emphasis: 'primary' },
    { label: 'awaiting a stranger', items: sn.data.outgoing },
  ]
  const hasAnyShelves = shelves.some((s) => s.items.length > 0)

  return (
    <div className="relative flex flex-col items-center gap-10 p-6 pt-32 sm:p-10 sm:pt-36">
      {layoutMode === 'mobile' ? (
        <MobileComposePaper
          key={composeKey}
          onSend={(content, country, stateName) => sn.sendNewNote(content, country, stateName)}
          onDismiss={() => setComposeKey((k) => k + 1)}
        />
      ) : (
        <ComposePaper
          key={composeKey}
          onSend={(content, country, stateName) => sn.sendNewNote(content, country, stateName)}
          onDismiss={() => setComposeKey((k) => k + 1)}
        />
      )}

      {hasAnyShelves && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <hr
            className="mb-6 border-0"
            style={{
              height: 1,
              background:
                'linear-gradient(to right, transparent, color-mix(in oklab, var(--text-primary) 30%, transparent), transparent)',
            }}
          />
          <div className="flex flex-col gap-4">
            {shelves
              .filter((s) => s.items.length > 0)
              .map((shelf) => (
                <Shelf
                  key={shelf.label}
                  label={shelf.label}
                  items={shelf.items}
                  emphasis={shelf.emphasis}
                  onPick={(id) => setActiveThreadId(id)}
                />
              ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

interface ShelfProps {
  label: string
  items: InboxThread[]
  emphasis?: 'warm' | 'primary'
  onPick: (id: string) => void
}

function Shelf({ label, items, emphasis, onPick }: ShelfProps) {
  const accentVar =
    emphasis === 'primary'
      ? 'var(--accent-primary)'
      : emphasis === 'warm'
      ? 'var(--accent-warm)'
      : 'var(--text-muted)'

  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="px-1 font-serif text-[10px] uppercase italic"
        style={{
          color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
          letterSpacing: '0.22em',
        }}
      >
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onPick(t.id)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left font-serif text-[14px] italic transition-colors"
              style={{
                color: 'var(--text-primary)',
                background:
                  t.unreadCount > 0
                    ? `color-mix(in oklab, ${accentVar} 14%, transparent)`
                    : 'transparent',
                border:
                  t.unreadCount > 0
                    ? `1px solid color-mix(in oklab, ${accentVar} 30%, transparent)`
                    : '1px solid color-mix(in oklab, var(--text-primary) 10%, transparent)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: t.unreadCount > 0 ? accentVar : 'color-mix(in oklab, var(--text-primary) 25%, transparent)',
                  boxShadow:
                    t.unreadCount > 0
                      ? `0 0 10px ${accentVar}, 0 0 4px ${accentVar}`
                      : 'none',
                  flexShrink: 0,
                }}
              />
              <span className="flex-1 truncate">{t.partnerDisplayName}</span>
              {t.preview && (
                <span
                  className="hidden truncate text-[12px] sm:inline-block sm:max-w-40"
                  style={{
                    color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                  }}
                >
                  {t.preview.isMine ? 'you: ' : ''}
                  {t.preview.encryptionTier === 'thread' ? '✦ sealed' : t.preview.body}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
