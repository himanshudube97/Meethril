'use client'

import { useState } from 'react'
import { useStrangerNotes } from '@/hooks/useStrangerNotes'
import Mailbox from './Mailbox'
import ComposePaper from './ComposePaper'
import ThreadView from './ThreadView'

type Mode = 'idle' | 'composing' | 'thread'

export default function LightsView() {
  const sn = useStrangerNotes()
  const [mode, setMode] = useState<Mode>('idle')
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  if (sn.loading && !sn.data) {
    return <div className="p-6 text-sm opacity-70">Loading…</div>
  }
  if (sn.error && !sn.data) {
    return <div className="p-6 text-sm text-red-500">{sn.error}</div>
  }
  if (!sn.data) return null

  const totalUnread =
    sn.data.active.reduce((acc, t) => acc + t.unreadCount, 0) +
    sn.data.penpals.reduce((acc, t) => acc + t.unreadCount, 0)

  return (
    <div className="relative flex flex-col items-center gap-8 p-6 sm:p-10">
      <div className="text-center max-w-md">
        <p className="text-sm opacity-70">
          You&apos;ve sent {sn.data.counters.sent} small lights into the world.
          {' '}
          {sn.data.counters.received} have arrived at your door from strangers.
        </p>
      </div>

      <Mailbox
        unreadCount={totalUnread}
        outgoing={sn.data.outgoing}
        active={sn.data.active}
        penpals={sn.data.penpals}
        onCompose={() => setMode('composing')}
        onPickThread={(id) => {
          setActiveThreadId(id)
          setMode('thread')
        }}
      />

      {mode === 'composing' && (
        <ComposePaper
          onCancel={() => setMode('idle')}
          onSend={async (content, country, stateName) => {
            await sn.sendNewNote(content, country, stateName)
            setMode('idle')
          }}
        />
      )}

      {mode === 'thread' && activeThreadId && (
        <ThreadView
          threadId={activeThreadId}
          onClose={() => {
            setMode('idle')
            setActiveThreadId(null)
          }}
          onReply={(content) => sn.sendReply(activeThreadId, content)}
          onSkip={async () => {
            await sn.skip(activeThreadId)
            setMode('idle')
            setActiveThreadId(null)
          }}
          onBlock={async () => {
            await sn.block(activeThreadId)
            setMode('idle')
            setActiveThreadId(null)
          }}
          onWavePromptShown={() => sn.waveOffered(activeThreadId)}
          onWave={() => sn.wave(activeThreadId)}
        />
      )}
    </div>
  )
}
