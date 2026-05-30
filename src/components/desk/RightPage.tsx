'use client'

import React, { memo, useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { motion } from 'framer-motion'
import { getStroke } from 'perfect-freehand'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { useJournalStore, StrokeData } from '@/store/journal'
import { useDeskStore } from '@/store/desk'
import { getRandomPrompt } from '@/lib/themes'
import { htmlToSplitPlainText } from '@/lib/text-utils'
import { findLargestFittingPrefix } from '@/lib/text-fit'
import {
  isCaretOnFirstVisualRow,
  getCaretLeftOffset,
  findPositionOnFirstRow,
} from '@/lib/textarea-caret'
import { resolveFontFamily, resolveFontSize, parseStyle, type EntryStyle } from '@/lib/entry-style'
import PhotoBlock from './PhotoBlock'
import CompactDoodleCanvas from './CompactDoodleCanvas'

const LINE_HEIGHT = 32

// SVG path from stroke points
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return ''
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
      return acc
    },
    ['M', ...stroke[0], 'Q']
  )
  d.push('Z')
  return d.join(' ')
}

interface Photo {
  id?: string
  url?: string
  encryptedRef?: string
  encryptedRefIV?: string
  rotation: number
  position: 1 | 2
}

interface Entry {
  id: string
  text: string
  song?: string | null
  photos?: Photo[]
  doodles?: Array<{ strokes: StrokeData[] }>
  createdAt: string
  style?: EntryStyle | null
}

interface RightPageProps {
  entry: Entry | null
  isNewEntry: boolean
  photos?: Photo[]
  onPhotoAdd?: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  onPhotoRemove?: (position: 1 | 2) => void
  onNavigateLeft?: (targetLeft?: number) => void
  onBackspaceAcrossSpine?: () => void
}

export interface RightPageHandle {
  focusAtEnd: () => void
  focusAtStart: () => void
  focusAtFirstRow: (targetLeft: number) => void
  focusAtAfterPrepend: (prependLength: number) => void
}

// Doodle Preview for existing entries
const DoodlePreview = memo(function DoodlePreview({
  strokes,
  canvasBackground,
  canvasBorder,
}: {
  strokes: StrokeData[]
  canvasBackground: string
  canvasBorder: string
}) {
  if (!strokes || strokes.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  strokes.forEach(stroke => {
    stroke.points.forEach(([x, y]) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
  })

  const padding = 10
  const width = maxX - minX + padding * 2
  const height = maxY - minY + padding * 2

  return (
    <div
      className="h-24 rounded-lg overflow-hidden"
      style={{
        background: canvasBackground,
        border: `1px solid ${canvasBorder}`,
      }}
    >
      <svg
        viewBox={`${minX - padding} ${minY - padding} ${width} ${height}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {strokes.map((stroke, index) => {
          const outlinePoints = getStroke(stroke.points, {
            size: stroke.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
          })
          const pathData = getSvgPathFromStroke(outlinePoints)
          return <path key={index} d={pathData} fill={stroke.color} opacity={0.9} />
        })}
      </svg>
    </div>
  )
})

const RightPage = memo(forwardRef<RightPageHandle, RightPageProps>(function RightPage({
  entry,
  isNewEntry,
  photos = [],
  onPhotoAdd,
  onPhotoRemove,
  onNavigateLeft,
  onBackspaceAcrossSpine,
}: RightPageProps, ref) {
  const { theme } = useThemeStore()
  const colors = getGlassDiaryColors(theme)
  const { currentDoodleStrokes, setDoodleStrokes } = useJournalStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState('')

  // Draft text lives in desk store so typing doesn't re-render BookSpread.
  const text = useDeskStore((s) => s.rightPageDraft)
  const leftPageText = useDeskStore((s) => s.leftPageDraft)
  const setRightPageDraft = useDeskStore((s) => s.setRightPageDraft)
  // Subscribed here directly (not via prop from BookSpread) so save
  // transitions don't re-render the flipbook and steal textarea focus.
  const autosaveStatus = useDeskStore((s) => s.autosaveStatus)
  const setText = setRightPageDraft

  const accentColor = theme.accent.warm
  const textColor = colors.bodyText
  const mutedColor = theme.text.muted

  const entryStyleDraft = useDeskStore((s) => s.entryStyleDraft)
  const activeStyle: EntryStyle = isNewEntry
    ? entryStyleDraft
    : parseStyle(entry?.style ?? null)
  const fontFamily = resolveFontFamily(activeStyle.font)
  const fontSize = resolveFontSize(activeStyle.font, 21)

  const linePattern = `repeating-linear-gradient(
    180deg,
    transparent 0px,
    transparent ${LINE_HEIGHT - 1}px,
    ${colors.ruledLine} ${LINE_HEIGHT - 1}px,
    ${colors.ruledLine} ${LINE_HEIGHT}px
  )`

  useEffect(() => {
    setPrompt(getRandomPrompt())
  }, [])

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
    focusAtFirstRow: (targetLeft: number) => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const pos = findPositionOnFirstRow(t, targetLeft)
      t.setSelectionRange(pos, pos)
    },
    focusAtAfterPrepend: (prependLength: number) => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const pos = Math.min(prependLength, t.value.length)
      t.setSelectionRange(pos, pos)
    },
  }))

  // Cross-spine navigation: when the caret is at the leading edge of the right
  // textarea, arrow keys and backspace operate on the left page instead.
  // - ArrowLeft / Backspace at position 0
  // - ArrowUp on the visual first row (preserves visual column)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget
    const atStart =
      textarea.selectionStart === 0 && textarea.selectionEnd === 0
    if (e.key === 'ArrowLeft') {
      if (atStart) {
        e.preventDefault()
        onNavigateLeft?.()
      }
      return
    }
    if (e.key === 'Backspace') {
      if (atStart) {
        e.preventDefault()
        onBackspaceAcrossSpine?.()
      }
      return
    }
    if (e.key === 'ArrowUp') {
      if (isCaretOnFirstVisualRow(textarea)) {
        e.preventDefault()
        onNavigateLeft?.(getCaretLeftOffset(textarea))
      }
    }
  }, [onNavigateLeft, onBackspaceAcrossSpine])

  const handleStrokesChange = useCallback((strokes: StrokeData[]) => {
    setDoodleStrokes(strokes)
  }, [setDoodleStrokes])

  const handlePhotoAdd = useCallback((position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => {
    onPhotoAdd?.(position, photo)
  }, [onPhotoAdd])

  const refreshPrompt = useCallback(() => {
    setPrompt(getRandomPrompt())
  }, [setPrompt])

  // INVARIANTS for the right page writing surface:
  //   1. The textarea NEVER scrolls. Its CSS uses `overflow: hidden` and a
  //      fixed height (driven by `flex-1 min-h-0` inside the spread). Don't
  //      add `overflow: auto/scroll` or remove the fixed-height constraint
  //      without thinking about what the user can write into invisible space.
  //   2. Typing past the visible bottom is silently rejected (no keystroke,
  //      no cursor move).
  //   3. Pasting more than fits truncates to what fits — existing content
  //      before the paste is preserved (the `floor` argument enforces this).
  //   4. There is no "page 3" — this is the last writing surface in the
  //      spread; overflow has nowhere to go.
  // Behavioral regressions in (2) and (3) trip the unit tests in
  // src/__tests__/text-fit.test.ts. CSS regressions in (1) need a manual
  // smoke test (Vitest+jsdom can't compute layout).
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    const newCursorPos = e.target.selectionStart

    const textarea = textareaRef.current
    if (!textarea) {
      setText(newText)
      return
    }

    // Shrinking or unchanged length — always accept (delete/replace).
    if (newText.length <= text.length) {
      setText(newText)
      return
    }

    // Use textarea height as the monotonic fit predicate. Set value via the
    // raw DOM during measurement, then restore before letting React render.
    const prevValue = textarea.value
    const fits = (prefix: string): boolean => {
      textarea.value = prefix
      return textarea.scrollHeight <= textarea.clientHeight + 1
    }

    const fittingLen = findLargestFittingPrefix(newText, fits, text.length)
    textarea.value = prevValue

    if (fittingLen === newText.length) {
      setText(newText)
      return
    }

    const fitsText = newText.slice(0, fittingLen)
    setText(fitsText)

    // Restore caret to the user's intended position, clamped to the kept text.
    requestAnimationFrame(() => {
      const t = textareaRef.current
      if (!t) return
      t.focus()
      const pos = Math.min(newCursorPos, fitsText.length)
      t.setSelectionRange(pos, pos)
    })
  }, [text, setText])

  if (isNewEntry) {
    const captionDate = entry?.createdAt ? new Date(entry.createdAt) : new Date()
    const dateCaption = captionDate
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toLowerCase()
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="h-full flex flex-col overflow-hidden"
      >
        {/* Photo Block */}
        <div className="mb-3 flex-shrink-0">
          <div
            className="text-[10px] uppercase tracking-[0.15em] mb-2 font-medium"
            style={{ color: colors.sectionLabel }}
          >
            Add Photos
          </div>
          <PhotoBlock
            photos={photos}
            onPhotoAdd={handlePhotoAdd}
            onPhotoRemove={onPhotoRemove}
            dateCaption={dateCaption}
          />
        </div>

        {/* Writing Area with Prompt */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-start gap-2 mb-1 flex-shrink-0">
            <div
              className="text-sm italic flex-1 leading-relaxed"
              style={{ color: colors.prompt }}
            >
              {prompt}
            </div>
            <button
              onClick={refreshPrompt}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: accentColor }}
              title="New prompt"
            >
              ↻
            </button>
          </div>
          <div className="flex-1 min-h-0 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder="Begin writing..."
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

        {/* Doodle Area */}
        <div className="mt-2 flex-shrink-0" style={{ height: '140px' }}>
          <div
            className="text-[10px] uppercase tracking-[0.15em] mb-1 font-medium"
            style={{ color: colors.sectionLabel }}
          >
            Draw
          </div>
          <div style={{ height: '120px' }}>
            <CompactDoodleCanvas
              strokes={currentDoodleStrokes}
              onStrokesChange={handleStrokesChange}
              doodleColors={[theme.text.primary, theme.accent.primary, theme.accent.warm, theme.text.muted]}
              canvasBackground={colors.doodleBg}
              canvasBorder={colors.doodleBorder}
              textColor={textColor}
              mutedColor={mutedColor}
            />
          </div>
        </div>

        {/* Footer: char count + autosave status */}
        <div className="mt-2 flex justify-between items-center flex-shrink-0">
          <div className="text-xs" style={{ color: mutedColor }}>
            {(text.length + leftPageText.length) > 0 && `${text.length + leftPageText.length} chars`}
          </div>
          <div className="text-xs italic" style={{ color: mutedColor, opacity: 0.7 }}>
            {autosaveStatus === 'saving' && 'saving…'}
            {autosaveStatus === 'saved' && 'saved'}
            {autosaveStatus === 'error' && "couldn't save"}
          </div>
        </div>
      </motion.div>
    )
  }

  // Viewing existing entry — uses the persisted page-break marker when
  // present so the boundary matches what the user saw while typing.
  const [, rightPlainText] = htmlToSplitPlainText(entry?.text || '')
  const plainText = rightPlainText

  const entryPhotos = entry?.photos || []
  const entryDoodle = entry?.doodles?.[0]

  const captionDate = entry?.createdAt ? new Date(entry.createdAt) : new Date()
  const dateCaption = captionDate
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Photos — same UI as new entry template */}
      <div className="mb-3 flex-shrink-0">
        <div
          className="text-[10px] uppercase tracking-[0.15em] mb-2 font-medium"
          style={{ color: mutedColor }}
        >
          {entryPhotos.length > 0 ? 'Photos' : 'Add Photos'}
        </div>
        <PhotoBlock
          photos={entryPhotos}
          disabled
          dateCaption={dateCaption}
        />
      </div>

      {/* Whisper prompt + text — match new-entry layout for flip consistency.
          "Begin writing..." placeholder only shows when the saved entry has
          no right-page content. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          className="text-sm italic mb-1 flex-shrink-0 leading-relaxed"
          style={{ color: colors.prompt }}
        >
          {prompt}
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
          {plainText || 'Begin writing...'}
        </div>
      </div>

      {/* Doodle — same UI as new entry template */}
      <div className="mt-2 flex-shrink-0" style={{ height: '140px' }}>
        <div
          className="text-[10px] uppercase tracking-[0.15em] mb-1 font-medium"
          style={{ color: mutedColor }}
        >
          {entryDoodle?.strokes && entryDoodle.strokes.length > 0 ? 'Doodle' : 'Draw'}
        </div>
        <div style={{ height: '120px' }}>
          {entryDoodle?.strokes && entryDoodle.strokes.length > 0 ? (
            <DoodlePreview
              strokes={entryDoodle.strokes}
              canvasBackground={colors.doodleBg}
              canvasBorder={colors.doodleBorder}
            />
          ) : (
            <div
              className="h-full relative rounded-lg overflow-hidden flex items-center justify-center"
              style={{
                background: colors.doodleBg,
                border: `1px solid ${colors.doodleBorder}`,
              }}
            >
              <span className="text-[10px]" style={{ color: colors.sectionLabel }}>Draw here</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-2 pt-2 border-t flex-shrink-0" style={{ borderColor: `${mutedColor}20` }}>
        <div className="flex justify-between items-center">
          <div className="text-xs" style={{ color: mutedColor }}>
            {plainText.length} characters
          </div>
          <div className="text-xs" style={{ color: mutedColor }}>
            {entry && new Date(entry.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}))

RightPage.displayName = 'RightPage'

export default RightPage
