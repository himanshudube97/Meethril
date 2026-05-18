'use client'

import React, { memo, useState, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { useJournalStore } from '@/store/journal'
import { useDeskStore } from '@/store/desk'
import SongEmbed from '@/components/SongEmbed'
import SongPicker from '@/components/SongPicker'
import { htmlToSplitPlainText } from '@/lib/text-utils'
import {
  isCaretOnLastVisualRow,
  getCaretLeftOffset,
  findPositionOnLastRow,
} from '@/lib/textarea-caret'
import PenMenu from './PenMenu'
import { resolveFontFamily, resolveFontSize, parseStyle, type EntryStyle } from '@/lib/entry-style'
import { isEntryLocked } from '@/lib/entry-lock-client'

// Line height must match the line pattern spacing
const LINE_HEIGHT = 32

// Empty-song placeholder for locked entries: a record-sleeve sticker with the
// vinyl peeking out and a handwritten "untitled" caption. Sized to fill the
// section so the locked state doesn't feel like dead space.
function VinylStickerPlaceholder({ accent }: { accent: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: -3 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      style={{ transformOrigin: 'center center' }}
    >
      <svg
        width="190"
        height="140"
        viewBox="0 0 220 160"
        aria-hidden
        style={{ filter: 'drop-shadow(0 4px 7px rgba(0,0,0,0.22))' }}
      >
        {/* Vinyl disc — peeks out the right edge of the sleeve */}
        <g>
          <circle cx="155" cy="80" r="58" fill="#1c1410" />
          {/* Concentric grooves */}
          <g fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.6">
            <circle cx="155" cy="80" r="52" />
            <circle cx="155" cy="80" r="46" />
            <circle cx="155" cy="80" r="40" />
            <circle cx="155" cy="80" r="34" />
            <circle cx="155" cy="80" r="28" />
          </g>
          {/* Sheen */}
          <path
            d="M118 56 A 42 42 0 0 1 184 50"
            stroke="rgba(255,255,255,0.13)"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* Center label + spindle hole */}
          <circle cx="155" cy="80" r="20" fill={accent} />
          <circle cx="155" cy="80" r="20" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="0.6" />
          <circle cx="155" cy="80" r="2.2" fill="#fbf7ec" />
        </g>

        {/* Square sleeve — sits in front of the vinyl, hiding its left half */}
        <g>
          {/* Sleeve back/shadow edge */}
          <rect x="8" y="14" width="120" height="132" rx="2" fill="rgba(60,40,20,0.18)" />
          {/* Sleeve face */}
          <rect x="6" y="12" width="120" height="132" rx="2" fill="#f5efdc" stroke="rgba(60,40,20,0.18)" strokeWidth="0.8" />
          {/* Inner border line for record-store feel */}
          <rect x="14" y="20" width="104" height="116" rx="1" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.45" />
          {/* Handwritten caption */}
          <text
            x="66"
            y="80"
            textAnchor="middle"
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: '24px',
              fill: 'rgba(60,40,20,0.7)',
            }}
          >
            untitled
          </text>
          {/* Small note glyph below caption */}
          <text
            x="66"
            y="108"
            textAnchor="middle"
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: '20px',
              fill: accent,
              opacity: 0.7,
            }}
          >
            ♪
          </text>
        </g>
      </svg>
    </motion.div>
  )
}

interface Entry {
  id: string
  text: string
  song?: string | null
  createdAt: string
  style?: EntryStyle | null
}

interface LeftPageProps {
  entry: Entry | null
  isNewEntry: boolean
  onPageFull?: (overflowText: string, cursorStaysOnLeft: boolean) => void
  onNavigateRight?: (targetLeft?: number) => void
}

export interface LeftPageHandle {
  focusAtEnd: () => void
  focusAtStart: () => void
  focusAtLastRow: (targetLeft: number) => void
}

const LeftPage = memo(forwardRef<LeftPageHandle, LeftPageProps>(function LeftPage({
  entry,
  isNewEntry,
  onPageFull,
  onNavigateRight,
}: LeftPageProps, ref) {
  const { theme } = useThemeStore()
  const colors = getGlassDiaryColors(theme)
  const { currentSong, setCurrentSong } = useJournalStore()
  // Draft text lives in desk store so typing doesn't re-render BookSpread.
  const text = useDeskStore((s) => s.leftPageDraft)
  const setLeftPageDraft = useDeskStore((s) => s.setLeftPageDraft)
  const entryStyleDraft = useDeskStore((s) => s.entryStyleDraft)
  const setEntryStyleDraft = useDeskStore((s) => s.setEntryStyleDraft)
  const onTextChange = setLeftPageDraft
  const [songInput, setSongInput] = useState(entry?.song || currentSong || '')
  const [isEditingSong, setIsEditingSong] = useState(!songInput)
  const [menuOpen, setMenuOpen] = useState(false)
  const penButtonRef = useRef<HTMLButtonElement>(null)

  const accentColor = theme.accent.warm
  const textColor = colors.bodyText
  const mutedColor = theme.text.muted

  const activeStyle: EntryStyle = isNewEntry
    ? entryStyleDraft
    : parseStyle(entry?.style ?? null)
  const fontFamily = resolveFontFamily(activeStyle.font)
  const fontSize = resolveFontSize(activeStyle.font, 21)
  const lockedForEntry = !isNewEntry && entry
    ? isEntryLocked(entry.createdAt, { entryType: 'normal' })
    : false
  const linePattern = `repeating-linear-gradient(
    180deg,
    transparent 0px,
    transparent ${LINE_HEIGHT - 1}px,
    ${colors.ruledLine} ${LINE_HEIGHT - 1}px,
    ${colors.ruledLine} ${LINE_HEIGHT}px
  )`

  const handleSongChange = useCallback((value: string) => {
    setSongInput(value)
    setCurrentSong(value)
    if (value && (/^https?:\/\//i.test(value) || value.startsWith('{'))) {
      setIsEditingSong(false)
    }
  }, [setCurrentSong])

  // Sync song input when entry changes
  const entrySong = entry?.song
  useEffect(() => {
    if (entrySong) {
      setSongInput(entrySong)
      setIsEditingSong(false)
    } else if (isNewEntry && currentSong) {
      setSongInput(currentSong)
      setIsEditingSong(false)
    } else {
      setIsEditingSong(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrySong, isNewEntry])

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Imperative focus API. Lives on the page component itself so the parent
  // (BookSpread) doesn't have to hold focus state — any setState in BookSpread
  // would re-render the flipbook, whose updateFromHtml destroys/recreates page
  // DOM and kills focus.
  useImperativeHandle(ref, () => ({
    focusAtEnd: () => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const len = t.value.length
      t.setSelectionRange(len, len)
    },
    focusAtStart: () => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      t.setSelectionRange(0, 0)
    },
    focusAtLastRow: (targetLeft: number) => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const pos = findPositionOnLastRow(t, targetLeft)
      t.setSelectionRange(pos, pos)
    },
  }))

  // Arrow key navigation: cross the spine into the right page when the caret
  // is at the trailing edge of the left textarea.
  // - ArrowRight at end-of-value
  // - ArrowDown on the visual last row
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    if (e.key === 'ArrowRight') {
      if (textarea.selectionStart === textarea.value.length && textarea.selectionEnd === textarea.value.length) {
        e.preventDefault()
        onNavigateRight?.()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      if (isCaretOnLastVisualRow(textarea)) {
        e.preventDefault()
        onNavigateRight?.(getCaretLeftOffset(textarea))
      }
    }
  }, [onNavigateRight])

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    const newCursorPos = e.target.selectionStart

    const textarea = textareaRef.current
    if (!textarea) {
      onTextChange?.(newText)
      return
    }

    // Use DOM measurement to detect overflow instead of character-count formula
    const prevValue = textarea.value
    textarea.value = newText

    if (textarea.scrollHeight <= textarea.clientHeight + 1) {
      // No overflow — accept all text
      textarea.value = prevValue
      onTextChange?.(newText)
      return
    }

    // Overflow detected — binary search for the max chars that fit
    let lo = 0
    let hi = newText.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2)
      textarea.value = newText.slice(0, mid)
      if (textarea.scrollHeight <= textarea.clientHeight + 1) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }

    // Snap to a word/newline boundary so we don't split mid-word
    let splitAt = lo
    while (splitAt > 0 && newText[splitAt] !== ' ' && newText[splitAt] !== '\n') {
      splitAt--
    }
    if (splitAt === 0) splitAt = lo

    textarea.value = prevValue

    const fitsText = newText.slice(0, splitAt)
    const overflowText = newText.slice(splitAt).replace(/^\s+/, '')

    // If the user's caret sits in the kept-left portion (e.g. Enter on the
    // second-to-last line pushes the LAST line off, but the caret should
    // remain on the new empty line), keep focus on the left page. Same when
    // the overflow is just stripped whitespace (the change effectively
    // nooped on the right) — there's no reason to yank focus across.
    const cursorStaysOnLeft = overflowText.length === 0 || newCursorPos <= splitAt

    onTextChange?.(fitsText)
    if (onPageFull) {
      onPageFull(overflowText, cursorStaysOnLeft)
    }

    if (cursorStaysOnLeft) {
      // Wait for React to commit fitsText to the textarea, then restore the
      // caret — setting textarea.value via React often resets the selection.
      requestAnimationFrame(() => {
        const t = textareaRef.current
        if (!t) return
        t.focus()
        const pos = Math.min(newCursorPos, t.value.length)
        t.setSelectionRange(pos, pos)
      })
    }
  }, [onTextChange, onPageFull])

  if (isNewEntry) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="h-full flex flex-col overflow-hidden"
      >
        {/* Music Section — fixed height to prevent textarea resize on song add */}
        <div className="mb-2 flex-shrink-0" style={{ minHeight: '68px' }}>
          {isEditingSong || !songInput ? (
            <>
              <div
                className="text-[10px] uppercase tracking-[0.15em] mb-2 font-medium flex items-center justify-between"
                style={{ color: mutedColor }}
              >
                <span>Add a Song</span>
                {songInput && (/^https?:\/\//i.test(songInput) || songInput.startsWith('{')) && (
                  <button
                    onClick={() => setIsEditingSong(false)}
                    className="text-[10px] normal-case tracking-normal opacity-60 hover:opacity-100 transition-opacity"
                    style={{ color: mutedColor }}
                    title="Back to player"
                  >
                    ← back to player
                  </button>
                )}
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
            <div className="relative">
              <SongEmbed url={songInput} compact audioOnly />
              <button
                onClick={() => setIsEditingSong(true)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-50 hover:opacity-100 transition-opacity"
                style={{
                  background: `${mutedColor}20`,
                  color: mutedColor,
                }}
                title="Change song"
              >
                ✎
              </button>
            </div>
          )}
        </div>

        {/* Writing Area */}
        <div className="flex-1 min-h-0 flex flex-col relative">
          <div
            className="text-[10px] uppercase tracking-[0.15em] mb-1 font-medium flex-shrink-0"
            style={{ color: mutedColor }}
          >
            Write your thoughts
          </div>

          {/* Pen-nib icon — only on entries the user can still style. The
              new-entry spread always qualifies; viewing branches gate this
              themselves (the v1 viewing branch below doesn't render this
              block). The lockedForEntry check is belt-and-suspenders for
              future cases where existing entries are also editable. */}
          {!lockedForEntry && (
            <>
              <button
                ref={penButtonRef}
                onClick={() => setMenuOpen((v) => !v)}
                className="absolute right-0 top-0 px-1.5 h-6 flex items-center justify-center rounded-md transition-opacity"
                style={{
                  color: accentColor,
                  opacity: menuOpen ? 1 : 0.65,
                  fontSize: '13px',
                  letterSpacing: '0.02em',
                }}
                title="Font"
                aria-label="Font"
                aria-expanded={menuOpen}
              >
                aA
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <PenMenu
                    value={entryStyleDraft}
                    onChange={setEntryStyleDraft}
                    onClose={() => setMenuOpen(false)}
                    bodyText={colors.bodyText}
                    panelBg={colors.doodleBg}
                    panelBorder={colors.doodleBorder}
                    triggerRef={penButtonRef}
                  />
                )}
              </AnimatePresence>
            </>
          )}

          <div className="flex-1 min-h-0 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind today..."
              className="absolute inset-0 w-full h-full resize-none outline-none"
              style={{
                color: textColor,
                fontFamily,
                fontSize,
                lineHeight: `${LINE_HEIGHT}px`,
                caretColor: accentColor,
                backgroundColor: 'transparent',
                backgroundImage: linePattern,
                backgroundAttachment: 'local',
                overflow: 'hidden',
              }}
            />
          </div>
        </div>
      </motion.div>
    )
  }

  // Viewing existing entry — uses the persisted page-break marker when
  // present so the boundary matches what the user saw while typing.
  const [leftPlainText] = htmlToSplitPlainText(entry?.text || '')
  const plainText = leftPlainText

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2, duration: 0.5 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Song section — show "Listening to" embed if the entry has a song.
          Empty state on locked entries renders a small paused cassette tape
          so the section feels like a physical object instead of dead UI. */}
      <div className="mb-2 flex-shrink-0" style={{ minHeight: '68px' }}>
        {entry?.song ? (
          <>
            <div
              className="text-[10px] uppercase tracking-[0.15em] mb-2 font-medium"
              style={{ color: colors.sectionLabel }}
            >
              Listening to
            </div>
            <SongEmbed url={entry.song} compact audioOnly />
          </>
        ) : (
          <div className="flex items-center justify-center" style={{ minHeight: '150px' }}>
            <VinylStickerPlaceholder accent={accentColor} />
          </div>
        )}
      </div>

      {/* Writing area — same labels as new entry; placeholder text only
          surfaces when the saved entry has no left-page content. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="text-[10px] uppercase tracking-[0.15em] mb-1 font-medium flex-shrink-0"
          style={{ color: colors.sectionLabel }}
        >
          Write your thoughts
        </div>
        <div
          className="flex-1 min-h-0 w-full whitespace-pre-wrap overflow-hidden"
          style={{
            color: plainText ? textColor : mutedColor,
            fontFamily,
            fontSize,
            lineHeight: `${LINE_HEIGHT}px`,
            fontStyle: plainText ? 'normal' : 'italic',
            backgroundColor: 'transparent',
            backgroundImage: linePattern,
            backgroundAttachment: 'local',
          }}
        >
          {plainText || "What's on your mind today..."}
        </div>
      </div>
    </motion.div>
  )
}))

LeftPage.displayName = 'LeftPage'

export default LeftPage
