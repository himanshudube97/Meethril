'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { RecipientChoice } from '../letterTypes'

export function RecipientPicker({
  onSubmit,
  onCancel,
}: {
  onSubmit: (choice: RecipientChoice) => void
  onCancel: () => void
}) {
  const theme = useThemeStore((s) => s.theme)
  const [mode, setMode] = useState<'idle' | 'friend-name'>('idle')
  const [name, setName] = useState('')
  const [hovered, setHovered] = useState<'self' | 'friend' | null>(null)

  function handleFriendSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit({ recipient: 'friend', name: trimmed })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{ color: theme.text.primary, backgroundColor: theme.bg.primary }}
    >
      <div className="w-full max-w-xl text-center">
        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-serif text-2xl mb-10 italic"
          style={{ color: theme.text.primary }}
        >
          Who&apos;s this letter for?
        </motion.h2>

        <AnimatePresence mode="wait">
          {mode === 'idle' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 gap-5"
            >
              <button
                type="button"
                onClick={() => onSubmit({ recipient: 'self' })}
                onMouseEnter={() => setHovered('self')}
                onMouseLeave={() => setHovered(null)}
                className="rounded-2xl p-7 transition-colors text-left"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: hovered === 'self'
                    ? `${theme.accent.primary}22`
                    : `${theme.bg.primary}80`,
                }}
              >
                <div className="text-lg font-serif mb-1">Future me</div>
                <div className="text-sm" style={{ color: theme.text.muted }}>
                  a note to yourself, later
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('friend-name')}
                onMouseEnter={() => setHovered('friend')}
                onMouseLeave={() => setHovered(null)}
                className="rounded-2xl p-7 transition-colors text-left"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: hovered === 'friend'
                    ? `${theme.accent.primary}22`
                    : `${theme.bg.primary}80`,
                }}
              >
                <div className="text-lg font-serif mb-1">A friend</div>
                <div className="text-sm" style={{ color: theme.text.muted }}>
                  delivered to their email, within 30 days
                </div>
              </button>
            </motion.div>
          )}

          {mode === 'friend-name' && (
            <motion.form
              key="name"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleFriendSubmit}
              className="mx-auto max-w-sm"
            >
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="who is this for?"
                className="w-full text-center text-lg italic px-4 py-3 rounded-xl outline-none"
                style={{
                  border: `1px solid ${theme.text.primary}33`,
                  backgroundColor: `${theme.bg.primary}b3`,
                  color: theme.text.primary,
                }}
              />
              <div className="mt-5 flex items-center justify-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setMode('idle')
                    setName('')
                  }}
                  className="opacity-70 hover:opacity-100"
                  style={{ color: theme.text.primary }}
                >
                  ← back
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-5 py-2 rounded-full text-sm disabled:opacity-30"
                  style={{
                    backgroundColor: theme.accent.primary,
                    color: theme.bg.primary,
                  }}
                >
                  continue
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onCancel}
          className="mt-10 text-sm opacity-60 hover:opacity-100"
          style={{ color: theme.text.primary }}
        >
          ← cancel
        </button>
      </div>
    </div>
  )
}
