'use client'

import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { useThemeStore } from '@/store/theme'
import SongEmbed from '@/components/SongEmbed'
import PhotoBlock, { type Photo } from '@/components/desk/PhotoBlock'
import CompactDoodleCanvas from '@/components/desk/CompactDoodleCanvas'
import type { StrokeData } from '@/store/journal'

// ~9 lines × ~36 chars per line (matches PostcardFront)
export const BACK_CHAR_LIMIT = 324
const BACK_LINES = 9

// Intrinsic postcard paper colours — constant by design (not theme-driven)
const PAPER_BG = `
  repeating-linear-gradient(
    transparent, transparent 36px,
    rgba(120, 90, 50, 0.09) 36px, rgba(120, 90, 50, 0.09) 37px
  ),
  linear-gradient(160deg, #fff6f2 0%, #fbe6dd 100%)
`
const PAPER_INK = '#3d342a'
const LINE_COLOR = 'rgba(120, 90, 50, 0.18)'

// Doodle canvas colours — tuned to the paper aesthetic instead of theme-driven
// so the doodle area reads as "drawn on the postcard".
const DOODLE_BG = 'rgba(120, 90, 50, 0.05)'
const DOODLE_BORDER = 'rgba(120, 90, 50, 0.22)'
const DOODLE_COLORS = ['#3d342a', '#b34a3a', '#5a7a5a', '#7a5a3a']

export function PostcardBack({
  entryId = null,
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
}: {
  entryId?: string | null
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
}) {
  const theme = useThemeStore((s) => s.theme)

  // ── Local input buffer for the song URL form (not persisted — only
  // songConfirmed / the `song` prop is the source of truth).
  const [songInput, setSongInput] = useState('')

  // ── TipTap editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false }),
      Placeholder.configure({ placeholder: 'keep writing…' }),
      CharacterCount.configure({ limit: BACK_CHAR_LIMIT }),
    ],
    content: body,
    onUpdate({ editor }) {
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
          'overflow: hidden',
          'height: 100%',
        ].join(';'),
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

  const atCap = (editor?.storage.characterCount.characters() ?? 0) >= BACK_CHAR_LIMIT

  // ── Song handlers ─────────────────────────────────────────────────────────
  const handleSongSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = songInput.trim()
    if (trimmed) {
      onSongChange?.(trimmed)
      setSongInput('')
    }
  }

  const handleSongClear = () => {
    setSongInput('')
    onSongChange?.(null)
  }

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
          background: PAPER_BG,
          borderRadius: 8,
          border: '1px solid rgba(80, 55, 40, 0.16)',
          boxShadow:
            '0 20px 56px rgba(0,0,0,0.40), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)',
          overflow: 'hidden',
          color: PAPER_INK,
        }}
      >
        {/* ── Two-column content area ─────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60% 40%',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* LEFT 60% — writing continuation */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 20px 0 28px',
              overflow: 'hidden',
              borderRight: `1px solid ${LINE_COLOR}`,
            }}
          >
            {/* Lined writing area */}
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
              <EditorContent
                editor={editor}
                style={{ height: '100%', overflow: 'hidden' }}
              />
            </div>

            {/* "your letter is full." whisper */}
            {atCap && (
              <p
                style={{
                  marginTop: 8,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 12,
                  color: 'rgba(120, 90, 50, 0.5)',
                }}
              >
                your letter is full.
              </p>
            )}
          </div>

          {/* RIGHT 40% — media stack: song top, 2 photos middle, doodle bottom */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '16px 16px 8px 14px',
              overflow: 'hidden',
            }}
          >
            {/* ── Song slot (top) ───────────────────────────────────────── */}
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'rgba(120, 90, 50, 0.5)',
                  textTransform: 'lowercase',
                  marginBottom: 6,
                }}
              >
                music
              </div>
              {song ? (
                <div>
                  {/* SongEmbed — reused verbatim, wrapped to cap height */}
                  <div style={{ height: 64, overflow: 'hidden', borderRadius: 8 }}>
                    <SongEmbed url={song} compact />
                  </div>
                  <button
                    onClick={handleSongClear}
                    style={{
                      marginTop: 4,
                      background: 'none',
                      border: 'none',
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 11,
                      color: 'rgba(120, 90, 50, 0.5)',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSongSubmit} style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="url"
                    placeholder="paste a song URL…"
                    value={songInput}
                    onChange={(e) => setSongInput(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(120, 90, 50, 0.06)',
                      border: '1px solid rgba(120, 90, 50, 0.22)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      fontSize: 11,
                      color: PAPER_INK,
                      outline: 'none',
                      minWidth: 0,
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: `1px solid ${theme.accent.primary}`,
                      background: 'transparent',
                      color: theme.accent.primary,
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      fontSize: 11,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    add
                  </button>
                </form>
              )}
            </div>

            {/* ── 2 photo slots (middle) ────────────────────────────────── */}
            <div style={{ flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'rgba(120, 90, 50, 0.5)',
                  textTransform: 'lowercase',
                  marginBottom: 6,
                }}
              >
                photos
              </div>
              {/*
               * PhotoBlock is the journal's polaroid orchestrator. It owns the
               * full upload pipeline (compress → encrypt-if-E2EE → POST
               * /api/photos → emit {url | encryptedRef + encryptedRefIV}).
               * State lives in ComposeView so refs survive autosave + draft
               * resume — see CLAUDE.md's "Photo / Image Storage Flow".
               */}
              <PhotoBlock
                photos={photos}
                onPhotoAdd={onPhotoAdd}
                onPhotoRemove={onPhotoRemove}
              />
            </div>

            {/* ── Doodle (bottom) ───────────────────────────────────────── */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: 10,
                  letterSpacing: 2,
                  color: 'rgba(120, 90, 50, 0.5)',
                  textTransform: 'lowercase',
                  marginBottom: 6,
                  flexShrink: 0,
                }}
              >
                doodle
              </div>
              {/*
               * CompactDoodleCanvas mirrors the journal new-entry doodle:
               * fires onStrokesChange on every stroke (no manual "save"),
               * which is what we want for autosave. The previous DoodleCanvas
               * inline mode only persisted on explicit save click — silently
               * dropping strokes on navigation.
               */}
              <div style={{ flex: 1, minHeight: 0 }}>
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
          </div>
        </div>

        {/* ── FOOTER BAND ─────────────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
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
        .letter-back-editor .ProseMirror {
          outline: none;
          height: 100%;
          overflow: hidden;
          font-family: Caveat, cursive;
          font-size: 19px;
          line-height: 36px;
          color: #3d342a;
        }
        .letter-back-editor .ProseMirror p {
          margin: 0;
        }
        .letter-back-editor .ProseMirror p.is-editor-empty:first-child::before {
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

