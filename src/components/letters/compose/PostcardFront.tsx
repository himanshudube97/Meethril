'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

// ~9 lines × ~36 chars per line
export const FRONT_CHAR_LIMIT = 324
const FRONT_LINES = 9

function timeOfDay(d: Date): string {
  const h = d.getHours()
  if (h < 5) return 'late night'
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

function formatDateLabel(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'long' })
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${day}, ${md} · ${timeOfDay(d)}`
}

// Intrinsic postcard paper colours — constant by design (not theme-driven)
const PAPER_BG = 'linear-gradient(160deg, #fff6f2 0%, #fbe6dd 100%)'
const PAPER_INK = '#3d342a'
const LINE_COLOR = 'rgba(120, 90, 50, 0.18)'

export function PostcardFront({
  salutationName = 'future me',
  body = '',
  onBodyChange,
  onTurnOver,
  onCancel,
  createdAt,
}: {
  salutationName?: string
  body?: string
  onBodyChange?: (next: string) => void
  onTurnOver: () => void
  onCancel?: () => void
  createdAt: Date
}) {
  const theme = useThemeStore((s) => s.theme)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: '' }),
      CharacterCount.configure({ limit: FRONT_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      onBodyChange?.(editor.getText())
    },
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
  })

  const lastSeededRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    if (lastSeededRef.current === body) return
    editor.commands.setContent(body)
    lastSeededRef.current = body
  }, [body, editor])

  const atCap =
    (editor?.storage.characterCount.characters() ?? 0) >= FRONT_CHAR_LIMIT

  return (
    <div
      className="face front"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        position: 'absolute',
        inset: 0,
        background: PAPER_BG,
        borderRadius: 8,
        border: '1px solid rgba(80, 55, 40, 0.16)',
        boxShadow:
          '0 20px 56px rgba(0,0,0,0.40), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
        color: PAPER_INK,
        overflow: 'hidden',
      }}
    >
      {/* HEADER BAND — date left, stamp right (~64 px tall) */}
      <div
        style={{
          height: 64,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          borderBottom: `1px solid ${LINE_COLOR}`,
        }}
      >
        {/* Date label — italic, muted */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'rgba(61, 52, 42, 0.55)',
            letterSpacing: 0.4,
          }}
        >
          {formatDateLabel(createdAt)}
        </div>

        {/* Hearth stamp */}
        <div
          style={{
            width: 64,
            height: 74,
            border: '2px dashed rgba(120, 90, 50, 0.45)',
            borderRadius: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            background: 'rgba(120, 90, 50, 0.04)',
          }}
        >
          <span
            style={{
              fontFamily: 'Caveat, cursive',
              fontSize: 18,
              color: theme.accent.primary,
              lineHeight: 1,
            }}
          >
            ✦
          </span>
          <span
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 8,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: 'rgba(120, 90, 50, 0.55)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            HEARTH
          </span>
        </div>
      </div>

      {/* WRITING SURFACE — salutation + lined editor */}
      <div
        style={{
          flex: 1,
          padding: '16px 28px 0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Pre-printed salutation (non-editable) */}
        <div
          style={{
            fontFamily: 'Caveat, cursive',
            fontSize: 22,
            lineHeight: '36px',
            color: PAPER_INK,
            flexShrink: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Dear {salutationName},
        </div>

        {/* Lined writing area */}
        <div
          style={{
            flex: 1,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, ${LINE_COLOR} 35px, ${LINE_COLOR} 36px)`,
            height: `${FRONT_LINES * 36}px`,
            overflow: 'hidden',
          }}
        >
          <EditorContent
            editor={editor}
            style={{
              fontFamily: 'Caveat, cursive',
              fontSize: 19,
              lineHeight: '36px',
            }}
          />
        </div>
      </div>

      {/* FOOTER BAND — cancel left, turn-over right */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderTop: `1px solid ${LINE_COLOR}`,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '7px 18px',
            borderRadius: 999,
            border: '1.5px solid rgba(120, 90, 50, 0.3)',
            background: 'transparent',
            color: PAPER_INK,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 13,
            letterSpacing: 0.4,
            cursor: 'pointer',
            fontStyle: 'italic',
            opacity: 0.8,
          }}
        >
          ← cancel
        </button>

        <motion.button
          type="button"
          onClick={onTurnOver}
          animate={atCap ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
          transition={
            atCap
              ? { duration: 2, repeat: Infinity }
              : { duration: 0.3 }
          }
          style={{
            padding: '7px 22px',
            borderRadius: 999,
            border: 'none',
            background: theme.accent.primary,
            color: '#fff',
            fontFamily: 'Caveat, cursive',
            fontSize: 19,
            cursor: 'pointer',
            boxShadow: atCap
              ? `0 4px 18px ${theme.accent.primary}88`
              : '0 4px 14px rgba(0,0,0,0.18)',
            letterSpacing: 0.2,
          }}
        >
          turn over →
        </motion.button>
      </div>
    </div>
  )
}

