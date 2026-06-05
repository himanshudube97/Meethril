'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { findLargestFittingPrefix } from '@/lib/text-fit'
import { PostcardFrame } from './PostcardFrame'

// The portrait postcard puts the WHOLE letter on the front, so the writing
// area now fills whatever vertical room the card has. The visible line count
// is measured at runtime (see the ResizeObserver below) and snapped to a whole
// number of 36px lines, so "the lines you can SEE" and "the lines you can type"
// stay the same number on any viewport — no internal scroll, ever.
//
// FRONT_CHAR_LIMIT is just a generous CharacterCount safety net; the measured
// visual cap in onUpdate is the real source of truth for "the front is full".
export const FRONT_CHAR_LIMIT = 2400
const LINE_HEIGHT = 36
const FALLBACK_LINES = 14

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
  readOnly = false,
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
  // Read-only reveal mode: no editing, no cancel button.
  readOnly?: boolean
}) {
  const theme = useThemeStore((s) => s.theme)
  const accent = theme.accent.primary
  // Match the journal pages exactly: solid theme colour as the page base,
  // a tinted overlay on top. Same tokens (pageBg / pageBgSolid) from the
  // same helper that drives .diary-page in globals.css.
  const diaryColors = getGlassDiaryColors(theme)

  const [atVisualCap, setAtVisualCap] = useState(false)
  const trimmingRef = useRef(false)

  // INVARIANTS for the postcard-front writing area:
  //   1. The contentEditable surface is `linedHeight` tall (a whole number of
  //      36px lines that fits the card), clipped by `overflow: hidden`. No
  //      internal scroll, ever.
  //   2. Enter at the cap is pre-blocked (handleKeyDown below) so the user
  //      doesn't see a "type, then undo" flicker on the most common
  //      overflow attempt.
  //   3. On any other visual overflow (typing on the last line that wraps,
  //      paste of more than fits) we binary-search the longest text prefix
  //      that still fits and snap the editor to that. Paste keeps what it
  //      can; the rest is silently dropped (NOT undone wholesale).
  //   4. The "turn over" pulse fires once the surface is within 2px of the
  //      cap — see `setAtVisualCap` below. Don't gate that on chars.
  // The trim algorithm is covered by src/__tests__/text-fit.test.ts. CSS
  // regressions in (1) need a manual smoke test (Vitest+jsdom has no layout).
  //
  // The cap height is measured (the portrait card height varies with the
  // viewport). `maxHeightRef` is read inside the editor callbacks so they
  // always see the latest value; `linedHeight` drives the ruled block's height.
  const writingSurfaceRef = useRef<HTMLDivElement>(null)
  const maxHeightRef = useRef(FALLBACK_LINES * LINE_HEIGHT)
  const [linedHeight, setLinedHeight] = useState(FALLBACK_LINES * LINE_HEIGHT)

  useEffect(() => {
    const el = writingSurfaceRef.current
    if (!el) return
    const measure = () => {
      // The ruled block fills the whole writing surface (clientHeight minus the
      // 12px top padding) so the lines run all the way down to the footer. The
      // typing cap stays a whole number of lines (floor) so text never lands on
      // the partial sliver clipped at the very bottom.
      const avail = el.clientHeight - 12
      maxHeightRef.current = Math.max(4, Math.floor(avail / LINE_HEIGHT)) * LINE_HEIGHT
      setLinedHeight(avail)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: '' }),
      CharacterCount.configure({ limit: FRONT_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      if (trimmingRef.current) return

      const editorDom = editor.view.dom as HTMLElement
      const maxHeight = maxHeightRef.current

      if (editorDom.offsetHeight > maxHeight + 2) {
        trimmingRef.current = true
        try {
          const fullText = editor.getText()
          const fits = (prefix: string): boolean => {
            editor.commands.setContent(prefix, { emitUpdate: false })
            return editorDom.offsetHeight <= maxHeight + 2
          }
          const fittingLen = findLargestFittingPrefix(fullText, fits)
          editor.commands.setContent(fullText.slice(0, fittingLen), { emitUpdate: false })
          editor.commands.focus('end')
        } finally {
          trimmingRef.current = false
        }
      }

      // Pulse the "turn over" prompt + button once the surface is fully
      // consumed (within 2px). Does NOT block further typing on the last
      // line — typing more chars on the same line doesn't add height.
      const isFull = editorDom.offsetHeight >= maxHeight - 2
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
        if (dom.offsetHeight >= maxHeightRef.current - 2) {
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
      {/* Decorative illuminated frame — double rule + corner flourishes. */}
      <PostcardFrame accent={accent} />

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

      {/* WRITING SURFACE — lined editor with vertical column rule on the left.
          Fills the remaining card height; the measured line count derives from
          this element's height (see the ResizeObserver above). */}
      <div
        ref={writingSurfaceRef}
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

        {/* Lined writing area — fills the whole writing surface so the ruled
            lines run down to the footer. Typing is capped at a whole number of
            lines (maxHeightRef) so text never lands on the bottom sliver, but
            the empty rules below still show, filling the page. Clicking
            anywhere in the block places the cursor. */}
        <div
          onClick={() => editor?.commands.focus()}
          style={{
            cursor: 'text',
            backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, ${LINE_COLOR} 35px, ${LINE_COLOR} 36px)`,
            height: `${linedHeight}px`,
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
              // Match the journal body text size (resolveFontSize base 21).
              fontSize: 21,
              lineHeight: '36px',
            }}
          />
        </div>
      </div>

      {/* FOOTER BAND — cancel left, turn-over right. The "turn over" button
          pulses (below) once the front is full, which replaces the old floret
          + hint that used to sit above it. */}
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
        {readOnly ? <span /> : (
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
        )}

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
