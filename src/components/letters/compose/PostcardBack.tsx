'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import SongEmbed from '@/components/SongEmbed'
import SongPicker from '@/components/SongPicker'
import PhotoBlock, { type Photo } from '@/components/desk/PhotoBlock'
import CompactDoodleCanvas from '@/components/desk/CompactDoodleCanvas'
import type { StrokeData } from '@/store/journal'
import { findLargestFittingPrefix } from '@/lib/text-fit'

// Back side. The writing area sits below the music slot in the left column,
// so it gets fewer lines than the front. ~11 lines × ~36 chars per line.
export const BACK_CHAR_LIMIT = 396
const BACK_LINES = 11

// Postcard paper picks up its colour from getGlassDiaryColors() (see
// PostcardFront for the matching pattern). Lines belong ONLY in the writing
// area, not the whole paper.
const PAPER_INK = '#3d342a'
const LINE_COLOR = 'rgba(120, 90, 50, 0.18)'

// Doodle canvas colours — tuned to the paper aesthetic instead of theme-driven
// so the doodle area reads as "drawn on the postcard".
const DOODLE_BG = 'rgba(120, 90, 50, 0.05)'
const DOODLE_BORDER = 'rgba(120, 90, 50, 0.22)'
const DOODLE_COLORS = ['#3d342a', '#b34a3a', '#5a7a5a', '#7a5a3a']

export function PostcardBack({
  body = '',
  onBodyChange,
  photos = [],
  onPhotoAdd,
  onPhotoRemove,
  doodleStrokes = [],
  onDoodleStrokesChange,
  song = null,
  onSongChange,
  onTurnBack,
  onSeal,
  canSeal,
  active = true,
}: {
  body?: string
  onBodyChange?: (next: string) => void
  photos?: Photo[]
  onPhotoAdd?: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  onPhotoRemove?: (position: 1 | 2) => void
  doodleStrokes?: StrokeData[]
  onDoodleStrokesChange?: (strokes: StrokeData[]) => void
  song?: string | null
  onSongChange?: (next: string | null) => void
  onTurnBack?: () => void
  onSeal?: () => void
  canSeal?: boolean
  // When false, the face is rotated away — turn off pointer-events so clicks
  // don't leak through to the invisible face.
  active?: boolean
}) {
  const theme = useThemeStore((s) => s.theme)
  // Same journal page tokens — solid theme bg + tinted overlay. Matches
  // .diary-page exactly.
  const diaryColors = getGlassDiaryColors(theme)

  // Music input — same pattern as the journal's LeftPage: a single text input
  // that auto-collapses into <SongEmbed> the moment a valid URL is detected.
  // No "add" button — paste a URL and it just becomes a player.
  const [songInput, setSongInput] = useState(song ?? '')
  const [isEditingSong, setIsEditingSong] = useState(!song)

  const handleSongChange = (value: string) => {
    setSongInput(value)
    onSongChange?.(value || null)
    if (value && (/^https?:\/\//i.test(value) || value.startsWith('{'))) {
      setIsEditingSong(false)
    }
  }

  const [atVisualCap, setAtVisualCap] = useState(false)
  const trimmingRef = useRef(false)

  // INVARIANTS for the postcard-back writing area:
  //   1. The contentEditable surface is `BACK_LINES * 36px` tall, clipped by
  //      `overflow: hidden`. No internal scroll, ever.
  //   2. Enter at the cap is pre-blocked (handleKeyDown below) to spare a
  //      flicker on the most common overflow attempt.
  //   3. On any other visual overflow (typing on the last line that wraps,
  //      paste of more than fits) we binary-search the longest text prefix
  //      that still fits and snap the editor to that. Paste keeps what it
  //      can; the rest is silently dropped (NOT undone wholesale).
  // The trim algorithm is covered by src/__tests__/text-fit.test.ts. CSS
  // regressions in (1) need a manual smoke test (Vitest+jsdom has no layout).
  const MAX_EDITOR_HEIGHT = BACK_LINES * 36

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: 'keep writing…' }),
      CharacterCount.configure({ limit: BACK_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
      if (trimmingRef.current) return

      const editorDom = editor.view.dom as HTMLElement

      if (editorDom.offsetHeight > MAX_EDITOR_HEIGHT + 2) {
        trimmingRef.current = true
        try {
          const fullText = editor.getText()
          const fits = (prefix: string): boolean => {
            editor.commands.setContent(prefix, { emitUpdate: false })
            return editorDom.offsetHeight <= MAX_EDITOR_HEIGHT + 2
          }
          const fittingLen = findLargestFittingPrefix(fullText, fits)
          editor.commands.setContent(fullText.slice(0, fittingLen), { emitUpdate: false })
          editor.commands.focus('end')
        } finally {
          trimmingRef.current = false
        }
      }

      const isFull = editorDom.offsetHeight >= MAX_EDITOR_HEIGHT - 2
      setAtVisualCap(isFull)
      onBodyChange?.(editor.getText())
    },
    editorProps: {
      attributes: {
        class: 'letter-back-editor focus:outline-none',
        style: [
          'font-family: Caveat, cursive',
          'font-size: 19px',
          'line-height: 36px',
          'color: #3d342a',
        ].join(';'),
      },
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

  // Body-sync: resume async draft without fighting user typing
  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    if (lastSeededRef.current === body) return
    editor.commands.setContent(body)
    lastSeededRef.current = body
  }, [body, editor])

  const atCap =
    (editor?.storage.characterCount.characters() ?? 0) >= BACK_CHAR_LIMIT ||
    atVisualCap

  const handleTurnBack = onTurnBack
  const sealEnabled = canSeal ?? true

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxSizing: 'border-box',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          position: 'absolute',
          inset: 0,
          transform: 'rotateY(180deg)',
          backgroundColor: diaryColors.pageBgSolid,
          backgroundImage: `linear-gradient(${diaryColors.pageBg}, ${diaryColors.pageBg})`,
          borderRadius: 8,
          border: '1px solid rgba(80, 55, 40, 0.16)',
          boxShadow:
            '0 20px 56px rgba(0,0,0,0.40), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
          overflow: 'hidden',
          color: PAPER_INK,
          pointerEvents: active ? 'auto' : 'none',
        }}
      >
        {/* ── Two-column content area — 50/50 split ─────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '50% 50%',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* LEFT 50% — music top, writing area below */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 24px 0 28px',
              overflow: 'hidden',
              borderRight: `1px solid ${LINE_COLOR}`,
              gap: 14,
            }}
          >
            {/* MUSIC slot — journal-style: single input that auto-collapses
                into <SongEmbed> the moment a valid URL is detected. No "add"
                button; pasting a link is the commit action. */}
            <div style={{ flexShrink: 0, minHeight: 76 }}>
              {isEditingSong || !songInput ? (
                <>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 11,
                      letterSpacing: 2,
                      color: 'rgba(120, 90, 50, 0.55)',
                      textTransform: 'lowercase',
                      marginBottom: 6,
                    }}
                  >
                    add a song
                  </div>
                  <SongPicker
                    value={songInput}
                    onChange={(next) => {
                      handleSongChange(next ?? '')
                      if (next && (/^https?:\/\//i.test(next) || next.startsWith('{'))) {
                        setIsEditingSong(false)
                      }
                    }}
                    placeholder="Search a song or paste a link…"
                  />
                </>
              ) : (
                <div style={{ position: 'relative' }}>
                  <SongEmbed url={songInput} compact audioOnly />
                  <button
                    onClick={() => setIsEditingSong(true)}
                    title="Change song"
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(120, 90, 50, 0.15)',
                      color: 'rgba(120, 90, 50, 0.7)',
                      fontSize: 12,
                      cursor: 'pointer',
                      opacity: 0.6,
                    }}
                  >
                    ✎
                  </button>
                </div>
              )}
            </div>

            {/* Lined writing area — fixed height = BACK_LINES × 36 so the
                line cap and the visible lines are the same number. */}
            <div
              onClick={() => editor?.commands.focus()}
              style={{
                cursor: 'text',
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent 35px, ${LINE_COLOR} 35px, ${LINE_COLOR} 36px)`,
                height: `${BACK_LINES * 36}px`,
                flexShrink: 0,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <EditorContent editor={editor} />
            </div>

            {atCap && (
              <p
                style={{
                  marginTop: 4,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 12,
                  color: 'rgba(120, 90, 50, 0.5)',
                  flexShrink: 0,
                }}
              >
                your letter is full.
              </p>
            )}
          </div>

          {/* RIGHT 50% — photos top, doodle below */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              padding: '22px 28px 0 24px',
              overflow: 'hidden',
            }}
          >
            {/* PHOTOS — slightly larger than before (scale 1.15) */}
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 11,
                  letterSpacing: 2,
                  color: 'rgba(120, 90, 50, 0.55)',
                  textTransform: 'lowercase',
                  marginBottom: 6,
                }}
              >
                photos
              </div>
              <div
                style={{
                  transform: 'scale(1.3)',
                  transformOrigin: 'top center',
                  marginTop: 16,
                  marginBottom: 50, // accommodate scale overflow below
                }}
              >
                <PhotoBlock
                  photos={photos}
                  onPhotoAdd={onPhotoAdd}
                  onPhotoRemove={onPhotoRemove}
                />
              </div>
            </div>

            {/* Separator between photos and doodle — visual divide so the
                doodle reads as its own block, not stacked tight under photos. */}
            <div
              style={{
                borderTop: `1px solid ${LINE_COLOR}`,
                marginTop: 4,
                flexShrink: 0,
              }}
            />

            {/* DOODLE — slim band, pushed down by the separator margin. */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 11,
                  letterSpacing: 2,
                  color: 'rgba(120, 90, 50, 0.55)',
                  textTransform: 'lowercase',
                  marginBottom: 6,
                }}
              >
                doodle
              </div>
              <div style={{ height: 160 }}>
                <CompactDoodleCanvas
                  strokes={doodleStrokes}
                  onStrokesChange={(s) => onDoodleStrokesChange?.(s)}
                  doodleColors={DOODLE_COLORS}
                  canvasBackground={DOODLE_BG}
                  canvasBorder={DOODLE_BORDER}
                  textColor={PAPER_INK}
                  mutedColor="rgba(120, 90, 50, 0.5)"
                />
              </div>
            </div>

            {/* SIGN-OFF — fills the leftover space below the doodle so the
                right column doesn't read as empty. Decorative, part of the
                letter's vibe but not user-editable. */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: theme.accent.primary,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: 11,
                  letterSpacing: 6,
                  textTransform: 'uppercase',
                  opacity: 0.55,
                }}
              >
                ❦ ✦ ❦
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-caveat), Caveat, cursive',
                  fontStyle: 'italic',
                  fontSize: 22,
                  opacity: 0.85,
                  lineHeight: 1,
                }}
              >
                with love &amp; ink
              </div>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 10,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  opacity: 0.5,
                }}
              >
                — sealed by hearth —
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER BAND — matches PostcardFront's 84px height */}
        <div
          style={{
            flexShrink: 0,
            height: 84,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px 18px',
            borderTop: `1px solid ${LINE_COLOR}`,
          }}
        >
          <button
            type="button"
            onClick={handleTurnBack}
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
            ← turn back
          </button>

          <button
            type="button"
            disabled={!sealEnabled}
            onClick={onSeal}
            style={{
              padding: '7px 22px 8px',
              borderRadius: 999,
              border: 'none',
              background: sealEnabled ? theme.accent.primary : 'rgba(120, 90, 50, 0.25)',
              color: sealEnabled ? '#fff' : 'rgba(120, 90, 50, 0.45)',
              fontFamily: 'Caveat, cursive',
              fontSize: 19,
              cursor: sealEnabled ? 'pointer' : 'not-allowed',
              boxShadow: sealEnabled ? '0 4px 14px rgba(0,0,0,0.18)' : 'none',
              letterSpacing: 0.2,
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            fold and seal →
          </button>
        </div>
      </div>

      <style jsx global>{`
        .letter-back-editor.ProseMirror {
          outline: none;
          font-family: Caveat, cursive;
          font-size: 19px;
          line-height: 36px;
          color: #3d342a;
        }
        .letter-back-editor.ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgba(120, 90, 50, 0.38);
          pointer-events: none;
          float: left;
          height: 0;
          font-style: italic;
        }
      `}</style>
    </>
  )
}

