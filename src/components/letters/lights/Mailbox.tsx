'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { Theme } from '@/lib/themes'
import type { InboxThread } from '@/hooks/useStrangerNotes'

interface Props {
  unreadCount: number
  outgoing: InboxThread[]
  active: InboxThread[]
  penpals: InboxThread[]
  onCompose: () => void
  onPickThread: (id: string) => void
}

export default function Mailbox({ unreadCount, outgoing, active, penpals, onCompose, onPickThread }: Props) {
  const { theme } = useThemeStore()
  const [open, setOpen] = useState(false)

  const hasItems = outgoing.length + active.length + penpals.length > 0

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.button
        type="button"
        onClick={() => hasItems && setOpen((v) => !v)}
        className="relative w-32 h-40 rounded-xl flex items-center justify-center text-5xl"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
          backdropFilter: `blur(${theme.glass.blur})`,
          color: theme.text.primary,
          cursor: hasItems ? 'pointer' : 'default',
          opacity: hasItems ? 1 : 0.6,
        }}
        whileHover={hasItems ? { scale: 1.03 } : {}}
        animate={
          unreadCount > 0
            ? {
                boxShadow: [
                  `0 0 12px ${theme.accent.warm}40`,
                  `0 0 24px ${theme.accent.warm}80`,
                  `0 0 12px ${theme.accent.warm}40`,
                ],
              }
            : { boxShadow: 'none' }
        }
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Lantern of stranger notes"
      >
        <span aria-hidden>🪔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            {unreadCount}
          </span>
        )}
      </motion.button>

      {open && hasItems && (
        <div
          className="w-full max-w-sm rounded-xl p-3 flex flex-col gap-3"
          style={{
            background: theme.glass.bg,
            border: `1px solid ${theme.glass.border}`,
            backdropFilter: `blur(${theme.glass.blur})`,
          }}
        >
          <Shelf title="Lights you sent" items={outgoing} theme={theme} onPick={onPickThread} muted />
          <Shelf title="Open exchanges" items={active} theme={theme} onPick={onPickThread} />
          <Shelf title="Pen pals" items={penpals} theme={theme} onPick={onPickThread} highlight />
        </div>
      )}

      <button
        type="button"
        onClick={onCompose}
        className="px-6 py-3 rounded-full text-sm font-medium transition-opacity"
        style={{ background: theme.accent.primary, color: theme.bg.primary }}
      >
        Send a small light
      </button>
    </div>
  )
}

function Shelf({
  title,
  items,
  theme,
  onPick,
  muted = false,
  highlight = false,
}: {
  title: string
  items: InboxThread[]
  theme: Theme
  onPick: (id: string) => void
  muted?: boolean
  highlight?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wider opacity-60" style={{ color: theme.text.muted }}>
        {title}
      </p>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className="text-left text-sm py-2 px-3 rounded-md hover:opacity-80 transition-opacity"
          style={{
            color: theme.text.secondary,
            background:
              t.unreadCount > 0
                ? `${theme.accent.warm}15`
                : highlight
                ? `${theme.accent.primary}10`
                : 'transparent',
            opacity: muted ? 0.7 : 1,
          }}
          onClick={() => onPick(t.id)}
        >
          <div className="font-medium">{t.partnerDisplayName}</div>
          {t.preview && (
            <div className="text-xs opacity-70 truncate">
              {t.preview.isMine ? 'You: ' : ''}
              {t.preview.encryptionTier === 'thread' ? '[encrypted]' : t.preview.body}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
