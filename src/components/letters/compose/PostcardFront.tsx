'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'

// ~12 lines × ~36 chars per line. Sized to match the visible writing area on
// the 660-px-tall postcard so the line cap and the lines you can SEE are the
// same number — no more "I can see empty lines but Enter is blocked."
export const FRONT_CHAR_LIMIT = 432
const FRONT_LINES = 12

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

// Postcard paper picks up its colour from the active theme via
// getGlassDiaryColors() — same tokens that drive .diary-page in globals.css.
// Ink / line colours stay constant so the type and rules read against any
// theme tint underneath.
const PAPER_INK = '#3d342a'
const PAPER_INK_MUTED = 'rgba(61, 52, 42, 0.55)'
const LINE_COLOR = 'rgba(120, 90, 50, 0.18)'

export function PostcardFront({
  salutationName = 'future me',
  body = '',
  onBodyChange,
  onTurnOver,
  onCancel,
  createdAt,
  active = true,
}: {
  salutationName?: string
  body?: string
  onBodyChange?: (next: string) => void
  onTurnOver: () => void
  onCancel?: () => void
  createdAt: Date
  // When false, the face is rotated away from the viewer — we must turn off
  // pointer-events so clicks don't leak through to the invisible face.
  active?: boolean
}) {
  const theme = useThemeStore((s) => s.theme)
  const accent = theme.accent.primary
  // Match the journal pages exactly: solid theme colour as the page base,
  // a tinted overlay on top. Same tokens (pageBg / pageBgSolid) from the
  // same helper that drives .diary-page in globals.css.
  const diaryColors = getGlassDiaryColors(theme)

  const [atVisualCap, setAtVisualCap] = useState(false)

  // Hard line cap. We measure the editor's own contentEditable offsetHeight
  // (NOT the lined-area wrapper's scrollHeight, which is floored at
  // clientHeight). Strategy:
  //   • Allow typing on the last visible line — the user must be able to
  //     fill it. We only intervene when the change actually overflows.
  //   • Pre-block Enter once the editor is already at the cap, because
  //     adding another paragraph CAN'T fit — saves a flicker for the most
  //     common overflow attempt.
  //   • For everything else (chars, paste), let it land, measure, and undo
  //     if it overflowed.
  const MAX_EDITOR_HEIGHT = FRONT_LINES * 36

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: '' }),
      CharacterCount.configure({ limit: FRONT_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      const editorDom = editor.view.dom as HTMLElement
      const editorHeight = editorDom.offsetHeight

      if (editorHeight > MAX_EDITOR_HEIGHT + 2) {
        setAtVisualCap(true)
        editor.commands.undo()
        return
      }
      // Show the "turn over" prompt + button pulse once the writing area is
      // fully consumed (within 2px). Does NOT block further typing on the
      // last line — typing more chars on the same line doesn't add height.
      const isFull = editorHeight >= MAX_EDITOR_HEIGHT - 2
      setAtVisualCap(isFull)
      onBodyChange?.(editor.getText())
    },
    editorProps: {
      attributes: { class: 'letter-front-editor focus:outline-none' },
      // Pre-block Enter when the editor is already at the cap — adding a
      // new paragraph would unavoidably overflow, and pre-blocking avoids
      // the brief flicker of "type-then-undo".
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter' || event.shiftKey) return false
        const dom = view.dom as HTMLElement
        if (dom.offsetHeight >= MAX_EDITOR_HEIGHT - 2) {
          event.preventDefault()
          return true
        }
        return false
      },
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
    (editor?.storage.characterCount.characters() ?? 0) >= FRONT_CHAR_LIMIT ||
    atVisualCap

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
        backgroundColor: diaryColors.pageBgSolid,
        backgroundImage: `linear-gradient(${diaryColors.pageBg}, ${diaryColors.pageBg})`,
        borderRadius: 8,
        border: '1px solid rgba(80, 55, 40, 0.16)',
        boxShadow:
          '0 20px 56px rgba(0,0,0,0.40), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
        color: PAPER_INK,
        overflow: 'hidden',
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      {/* Decorative inner frame — thin accent border inset from the edge */}
      <div
        style={{
          position: 'absolute',
          inset: 12,
          border: `1px solid ${accent}38`,
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* TOP BAND — salutation block on the left, date on the right (where the
          bookmark/chapter used to live). Single row, drop-cap height drives
          the band height. */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '28px 40px 8px 36px',
          position: 'relative',
          zIndex: 2,
          gap: 20,
        }}
      >
        {/* Salutation: illuminated drop cap + cursive name + subtitle */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flex: '1 1 auto', minWidth: 0 }}>
          {/* Illuminated drop cap "D" — accent-tinted block, corner sparkles */}
          <div
            style={{
              position: 'relative',
              width: 70,
              height: 70,
              flexShrink: 0,
              background: `linear-gradient(160deg, ${accent} 0%, ${accent}dd 100%)`,
              color: '#fbe6dd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 56,
              fontWeight: 500,
              lineHeight: 1,
              boxShadow: '2px 3px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',
              borderRadius: 2,
            }}
          >
            D
            <span style={{ position: 'absolute', top: 5, left: 6, fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✦</span>
            <span style={{ position: 'absolute', top: 5, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✦</span>
            <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✦</span>
            <span style={{ position: 'absolute', bottom: 5, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1 }}>✦</span>
          </div>

          <div style={{ flex: 1, paddingTop: 6, overflow: 'hidden', minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-caveat), Caveat, cursive',
                fontStyle: 'italic',
                fontSize: 38,
                lineHeight: 1.05,
                color: PAPER_INK,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              ear{' '}
              <em style={{ color: accent, fontStyle: 'italic' }}>
                {salutationName}
              </em>
              ,
            </div>
            <div
              style={{
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: 10,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color: accent,
                opacity: 0.7,
                marginTop: 4,
              }}
            >
              — An illuminated letter —
            </div>
          </div>
        </div>

        {/* Date — moved to where the bookmark + chapter used to sit. */}
        <div
          style={{
            flexShrink: 0,
            paddingTop: 12,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 13,
            color: PAPER_INK_MUTED,
            letterSpacing: 0.3,
            whiteSpace: 'nowrap',
          }}
        >
          {formatDateLabel(createdAt)}
        </div>
      </div>

      {/* WRITING SURFACE — lined editor with vertical column rule on the left */}
      <div
        style={{
          flex: 1,
          padding: '12px 36px 0 56px',
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Vertical column rule — marks the left margin */}
        <div
          style={{
            position: 'absolute',
            left: 38,
            top: -4,
            bottom: 8,
            width: 1,
            background: `${accent}55`,
            zIndex: 1,
          }}
        />

        {/* Lined writing area — fixed at FRONT_LINES × 36px so the lines a
            user can see is exactly the number of lines they can type. The
            outer writing surface stays flex:1 (fills the card), but the
            lined block sits at the top and any extra space below is just
            empty paper. */}
        <div
          style={{
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, ${LINE_COLOR} 35px, ${LINE_COLOR} 36px)`,
            height: `${FRONT_LINES * 36}px`,
            overflow: 'hidden',
            position: 'relative',
            zIndex: 2,
            flexShrink: 0,
          }}
        >
          <EditorContent
            editor={editor}
            style={{
              fontFamily: 'var(--font-caveat), Caveat, cursive',
              fontSize: 19,
              lineHeight: '36px',
            }}
          />
        </div>
      </div>

      {/* Floret ornament — fades out when the front fills up */}
      <motion.div
        initial={false}
        animate={{ opacity: atCap ? 0 : 0.7 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          bottom: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          color: accent,
          fontSize: 14,
          letterSpacing: 10,
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          zIndex: 2,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        ❦ ✦ ❦
      </motion.div>

      {/* Turn-over hint — appears in the floret's spot when the front is full */}
      <motion.div
        initial={false}
        animate={{ opacity: atCap ? 1 : 0 }}
        transition={{ duration: 0.35 }}
        style={{
          position: 'absolute',
          bottom: 100,
          left: '50%',
          transform: 'translateX(-50%)',
          color: accent,
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontStyle: 'italic',
          fontSize: 14,
          letterSpacing: 0.4,
          zIndex: 2,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        the front is full — turn over →
      </motion.div>

      {/* FOOTER BAND — cancel left, turn-over right */}
      <div
        style={{
          height: 84,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px 18px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '7px 18px',
            borderRadius: 999,
            border: `1.5px solid ${accent}55`,
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
            background: accent,
            color: '#fff',
            fontFamily: 'var(--font-caveat), Caveat, cursive',
            fontSize: 19,
            cursor: 'pointer',
            boxShadow: atCap
              ? `0 4px 18px ${accent}88`
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
