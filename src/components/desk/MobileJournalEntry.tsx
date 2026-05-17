// src/components/desk/MobileJournalEntry.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useJournalStore, StrokeData } from '@/store/journal'
import { JOURNAL, getMobileWritingLinesPerPage, getMobileTotalWritingPages, countVisualLines } from '@/lib/journal-constants'
import { htmlToPlainText } from '@/lib/text-utils'
import { getRandomPrompt } from '@/lib/themes'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import SongEmbed from '@/components/SongEmbed'
import PhotoBlock from './PhotoBlock'
import CompactDoodleCanvas from './CompactDoodleCanvas'
import EntrySelector from './EntrySelector'
import { getClientTz, isEntryLocked } from '@/lib/entry-lock-client'
import { useAutosaveEntry } from '@/hooks/useAutosaveEntry'
import { useDeskStore, type AutosaveStatus } from '@/store/desk'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'
import { useShareableCapture } from '@/components/share/ShareableCapture'
import JournalShareCard from '@/components/share/JournalShareCard'

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
}

interface MobileJournalEntryProps {
  onClose: () => void
}

/**
 * Split a string into pages capped at `linesPerPage` visual lines each,
 * where a line counts both manual `\n` breaks and the natural soft-wrap at
 * `charsPerLine` chars. Breaks on the last whitespace before the boundary
 * so words don't split mid-page.
 *
 * Why visual-line based and not char-count: a user typing many newlines
 * (poetry, lists) fills a page visually well before they hit any char cap,
 * and we want pagination to fire when the page LOOKS full, not when an
 * arbitrary char counter trips.
 */
function paginate(text: string, linesPerPage: number, charsPerLine: number): string[] {
  if (text.length === 0) return ['']
  const pages: string[] = []
  let i = 0
  while (i < text.length) {
    // Binary search for the largest j such that text.slice(i, j) fits.
    let lo = i + 1
    let hi = text.length
    let best = i + 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (countVisualLines(text.slice(i, mid), charsPerLine) <= linesPerPage) {
        best = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    let j = best
    if (j < text.length) {
      const slice = text.slice(i, j)
      const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
      if (lastBreak > 0 && lastBreak > slice.length * 0.5) {
        j = i + lastBreak + 1
      }
    }
    if (j <= i) j = i + 1 // safety: always advance
    pages.push(text.slice(i, j))
    i = j
  }
  return pages.length === 0 ? [''] : pages
}

/** Pad a pages array up to `min` entries with empty strings. */
function padPages(pages: string[], min: number): string[] {
  if (pages.length >= min) return pages
  return [...pages, ...Array.from({ length: min - pages.length }, () => '')]
}

export default function MobileJournalEntry({ onClose }: MobileJournalEntryProps) {
  const { theme } = useThemeStore()
  const colors = useMemo(() => getGlassDiaryColors(theme), [theme])
  const {
    currentSong,
    setCurrentSong,
    currentDoodleStrokes,
    setDoodleStrokes,
    resetCurrentEntry,
  } = useJournalStore()

  const [viewportHeight, setViewportHeight] = useState<number>(
    typeof window !== 'undefined' ? window.innerHeight : 720
  )
  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const linesPerPage = getMobileWritingLinesPerPage(viewportHeight)
  const totalWritingPages = getMobileTotalWritingPages(linesPerPage)
  const charsPerLine = JOURNAL.CHARS_PER_LINE

  const [entries, setEntries] = useState<Entry[]>([])
  const [todayEntries, setTodayEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null)
  // Initial pages array padded to totalWritingPages so the user sees all
  // their available "diary pages" as dots from the moment they open a fresh
  // entry — same up-front sense as the desktop's left+right page pair.
  const [pages, setPages] = useState<string[]>(() =>
    Array.from({ length: getMobileTotalWritingPages(getMobileWritingLinesPerPage(
      typeof window !== 'undefined' ? window.innerHeight : 720
    )) }, () => '')
  )
  const [activePage, setActivePage] = useState(0)
  const [songInput, setSongInput] = useState(currentSong || '')
  const [pendingPhotos, setPendingPhotos] = useState<Photo[]>([])
  const [prompt, setPrompt] = useState('')

  const autosave = useAutosaveEntry(null)
  const { trigger: autosaveTrigger, flush: autosaveFlush, reset: autosaveReset } = autosave
  const autosaveStatus = useDeskStore((s) => s.autosaveStatus)

  // Auto-load gating + hydration gating. Refs because they don't need to
  // trigger re-renders.
  const hasAutoLoadedRef = useRef(false)
  const lastHydratedIdRef = useRef<string | null>(null)
  // Skip the first autosave trigger right after we hydrate from server data —
  // it would just PUT the same content back to the server.
  const skipNextAutosaveRef = useRef(false)
  // Set when forward-typing pushed text into a new page. Picked up by the
  // focus effect to move the cursor onto the freshly-advanced page.
  const justAutoAdvancedRef = useRef(false)
  // Ref to the currently-mounted writing textarea (only one is mounted at a
  // time — AnimatePresence mode="wait" unmounts the previous page).
  const writingTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const photosDoodleIndex = pages.length // last "page" (synthetic)
  const totalPages = pages.length + 1

  useEffect(() => { setPrompt(getRandomPrompt()) }, [])

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
      // One diary = one calendar month. Scope the fetch to the current
      // month so the mobile entry view can't navigate into last month.
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const res = await fetch(`/api/entries?month=${currentMonth}&limit=50`, {
        headers: { 'X-User-TZ': getClientTz() },
      })
      if (res.ok) {
        const data = await res.json()
        const raw = (data.entries || []) as Entry[]
        // Decrypt E2EE entries client-side; non-e2ee passes through unchanged.
        const fetched = (await decryptEntriesFromServer(
          raw as unknown as JournalEntry[]
        )) as unknown as Entry[]
        setEntries(fetched)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
        setTodayEntries(fetched.filter((e: Entry) => {
          const d = new Date(e.createdAt)
          return d >= today && d <= todayEnd
        }))
      }
    } finally {
      setLoading(false)
    }
  }, [decryptEntriesFromServer])
  useEffect(() => { fetchEntries() }, [fetchEntries, isE2EEReady])

  const currentEntry = currentEntryId
    ? entries.find(e => e.id === currentEntryId) || null
    : null
  const isPastEntry = currentEntry ? isEntryLocked(currentEntry.createdAt) : false

  // On first arrival of today's entries, auto-load the latest one — so
  // continuing an entry that was started on desktop "just works."
  useEffect(() => {
    if (hasAutoLoadedRef.current) return
    if (todayEntries.length === 0) return
    hasAutoLoadedRef.current = true
    const latest = [...todayEntries].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0]
    setCurrentEntryId(latest.id)
  }, [todayEntries])

  // Hydrate the editor when the user (or auto-load) selects a today's entry.
  // Past entries skip hydration — they render in the read-only branch below.
  useEffect(() => {
    if (!currentEntry) return
    if (lastHydratedIdRef.current === currentEntry.id) return
    if (isPastEntry) {
      lastHydratedIdRef.current = currentEntry.id
      return
    }
    lastHydratedIdRef.current = currentEntry.id
    skipNextAutosaveRef.current = true
    const plain = htmlToPlainText(currentEntry.text || '')
    setPages(padPages(paginate(plain, linesPerPage, charsPerLine), totalWritingPages))
    setActivePage(0)
    setSongInput(currentEntry.song || '')
    setCurrentSong(currentEntry.song || '')
    setPendingPhotos((currentEntry.photos || []).map(p => ({
      id: p.id,
      url: p.url,
      encryptedRef: p.encryptedRef,
      encryptedRefIV: p.encryptedRefIV,
      position: p.position,
      rotation: p.rotation,
    })))
    setDoodleStrokes(currentEntry.doodles?.[0]?.strokes || [])
    autosaveReset(currentEntry.id)
  }, [currentEntry, isPastEntry, linesPerPage, charsPerLine, totalWritingPages, autosaveReset, setCurrentSong, setDoodleStrokes])

  // Trigger autosave whenever a draft field changes. Covers both new entries
  // (POST on first content) and today's entries (PUT on every change).
  useEffect(() => {
    if (loading) return
    if (isPastEntry) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    // Strip pagination padding before saving: when the user hits Enter
    // multiple times to push past a mobile page, those newlines get baked
    // into the text. On desktop those blank lines push real content onto
    // the right page artificially. Collapse 3+ consecutive newlines to 1
    // (preserves intentional paragraph breaks of \n or \n\n) and trim the
    // very-end newlines too so cross-device the text reads as the user
    // wrote it, not as the mobile pager structured it.
    const rawText = pages.join('')
    const fullText = rawText.replace(/\n{3,}/g, '\n').replace(/^\n+|\n+$/g, '')
    const hasContent = fullText.trim().length > 0
      || (songInput && /https?:\/\//.test(songInput))
      || pendingPhotos.length > 0
      || currentDoodleStrokes.length > 0
    // Don't POST a new entry until there's actually something to save.
    if (!hasContent && !currentEntryId) return
    const html = '<p>' + fullText.replace(/\n/g, '</p><p>') + '</p>'
    autosaveTrigger({
      text: html,
      song: songInput && /https?:\/\//.test(songInput) ? songInput : null,
      photos: pendingPhotos.map(p => ({
        url: p.url,
        encryptedRef: p.encryptedRef,
        encryptedRefIV: p.encryptedRefIV,
        position: p.position,
        rotation: p.rotation,
        spread: 1,
      })),
      doodles: currentDoodleStrokes.length > 0
        ? [{ strokes: currentDoodleStrokes, spread: 1 }]
        : [],
    })
  }, [pages, songInput, pendingPhotos, currentDoodleStrokes, currentEntryId, isPastEntry, loading, autosaveTrigger])

  // When the autosave hook creates a fresh entry (POST → 200), pull the new
  // id into local state and refetch so the EntrySelector reflects it. Mark
  // the entry as already-hydrated so we don't bounce the editor.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { entryId?: string; isFirstSaveOfSession?: boolean }
      if (detail?.isFirstSaveOfSession && detail.entryId) {
        lastHydratedIdRef.current = detail.entryId
        setCurrentEntryId(detail.entryId)
        fetchEntries()
      }
    }
    window.addEventListener('hearth:entry-saved', handler)
    return () => window.removeEventListener('hearth:entry-saved', handler)
  }, [fetchEntries])

  // Share-capture surface for the current entry — renders a JournalShareCard
  // off-screen, captures it, and opens the OS share sheet / download.
  const { CameraButton: ShareCameraButton, Capture: ShareCapture } = useShareableCapture({
    cardContent: currentEntry ? <JournalShareCard entry={currentEntry as unknown as import('@/store/journal').JournalEntry} /> : null,
    surface: 'diary',
    date: currentEntry ? new Date(currentEntry.createdAt) : new Date(),
  })

  // Pagination — splits text by VISUAL LINES (newlines + soft-wrap), so
  // pressing Enter Enter Enter properly fills a page and triggers a flip.
  // Auto-advances only on forward-typing overflow at the active page so
  // mid-edits to earlier pages don't yank the user forward.
  const handlePageTextChange = useCallback((index: number, value: string, cursorAtEnd: boolean) => {
    setPages(prev => {
      const next = [...prev]
      // Combine all text from this page onward, then re-paginate from `index`.
      // Empty trailing pads contribute nothing to the join; they get re-added
      // by padPages at the end so the dot count stays stable.
      const tail = [value, ...next.slice(index + 1)].join('')
      const repaginated = paginate(tail, linesPerPage, charsPerLine)
      const merged = [...next.slice(0, index), ...repaginated]
      return padPages(merged, totalWritingPages)
    })
    if (cursorAtEnd && countVisualLines(value, charsPerLine) > linesPerPage) {
      const splitOfThisPage = paginate(value, linesPerPage, charsPerLine)
      if (splitOfThisPage.length > 1) {
        justAutoAdvancedRef.current = true
        setActivePage(prev => prev === index ? index + splitOfThisPage.length - 1 : prev)
      }
    }
  }, [linesPerPage, charsPerLine, totalWritingPages])

  // After auto-advance, focus the new page's textarea + drop the cursor at
  // its end so typing continues seamlessly. Manual swipes don't trigger
  // this (justAutoAdvancedRef stays false), so reading earlier pages is
  // not interrupted.
  useEffect(() => {
    if (!justAutoAdvancedRef.current) return
    const id = setTimeout(() => {
      justAutoAdvancedRef.current = false
      const ta = writingTextareaRef.current
      if (!ta) return
      ta.focus()
      const len = ta.value.length
      ta.setSelectionRange(len, len)
    }, 280) // slightly after AnimatePresence's 250ms x-transition
    return () => clearTimeout(id)
  }, [activePage])

  const handleSongChange = useCallback((value: string) => {
    setSongInput(value)
    setCurrentSong(value)
  }, [setCurrentSong])

  const handlePhotoAdd = useCallback((position: 1 | 2, photoData: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => {
    const rotation = position === 1
      ? -8 + Math.floor(Math.random() * 6)
      : 5 + Math.floor(Math.random() * 6)
    setPendingPhotos(prev => [
      ...prev.filter(p => p.position !== position),
      { ...photoData, position, rotation },
    ])
  }, [])

  const handleStrokesChange = useCallback((strokes: StrokeData[]) => {
    setDoodleStrokes(strokes)
  }, [setDoodleStrokes])

  const handleEntrySelect = useCallback(async (entryId: string | null) => {
    // Flush any pending changes for the entry we're leaving.
    await autosaveFlush()
    if (entryId === null) {
      // New entry: clear local state, autosave will POST on first content.
      // Pad pages so the dot strip still shows the full writing capacity.
      skipNextAutosaveRef.current = true
      setPages(Array.from({ length: totalWritingPages }, () => ''))
      setActivePage(0)
      setSongInput('')
      setCurrentSong('')
      setPendingPhotos([])
      setDoodleStrokes([])
      resetCurrentEntry()
      autosaveReset(null)
      lastHydratedIdRef.current = null
      setCurrentEntryId(null)
      return
    }
    // Hydration effect handles loading state for the chosen entry.
    setCurrentEntryId(entryId)
  }, [autosaveFlush, autosaveReset, resetCurrentEntry, setCurrentSong, setDoodleStrokes, totalWritingPages])

  // Swipe between pages
  const handleSwipeEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 && activePage < totalPages - 1) {
      setActivePage(p => p + 1)
    } else if (info.offset.x > 60 && activePage > 0) {
      setActivePage(p => p - 1)
    }
  }, [activePage, totalPages])

  // Hide the editor flash while we wait for auto-load to settle on today's
  // most recent entry.
  const isAutoLoadPending = todayEntries.length > 0 && !hasAutoLoadedRef.current

  if (loading || isAutoLoadPending) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: theme.bg.primary }}>
        <span style={{ color: colors.prompt }}>Loading...</span>
      </div>
    )
  }

  // Read-only view for past entries (older than today's calendar day).
  if (currentEntry && isPastEntry) {
    const plainText = htmlToPlainText(currentEntry.text)
    const entryPhotos = currentEntry.photos || []
    const captionDate = currentEntry?.createdAt ? new Date(currentEntry.createdAt) : new Date()
    const dateCaption = captionDate
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toLowerCase()
    return (
      <>
        <div className="fixed inset-0 overflow-y-auto z-40" style={{ background: theme.bg.primary }}>
          <div className="max-w-lg mx-auto px-4 py-6 pb-20" style={{ position: 'relative' }}>
            <div className="flex items-center justify-between mb-4">
              <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-full"
                style={{ background: colors.buttonBg, color: colors.bodyText, border: `1px solid ${colors.buttonBorder}` }}>
                Close
              </button>
              <span className="text-sm" style={{ color: colors.date }}>
                {new Date(currentEntry.createdAt).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                })}
              </span>
            </div>
            {todayEntries.length > 0 && (
              <div className="flex justify-center mb-4">
                <EntrySelector entries={todayEntries} currentEntryId={currentEntryId}
                  onEntrySelect={handleEntrySelect} />
              </div>
            )}
            {currentEntry.song && (
              <div className="mb-4"><SongEmbed url={currentEntry.song} compact audioOnly /></div>
            )}
            <div className="whitespace-pre-wrap mb-4" style={{
              color: colors.bodyText, fontFamily: 'var(--font-caveat), Georgia, serif',
              fontSize: '20px', lineHeight: '32px',
            }}>
              {plainText || <span style={{ color: colors.prompt, fontStyle: 'italic' }}>No text</span>}
            </div>
            {entryPhotos.length > 0 && <div className="mb-4"><PhotoBlock photos={entryPhotos} disabled dateCaption={dateCaption} /></div>}
            {currentEntry?.id && (
              <div
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 30 }}
                className="pointer-events-auto"
              >
                {ShareCameraButton}
              </div>
            )}
          </div>
        </div>
        {ShareCapture}
      </>
    )
  }

  // Editable view: new entry OR today's entry. Autosave drives persistence.
  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: theme.bg.primary }}>
      {/* Header — left/right spacers reserve room for the floating hamburger
          (top-4 left-4) and gear (top-6 right-6) so the centered date never
          slides under them. */}
      <div className="flex items-center justify-between gap-2 px-16 py-3" style={{ minHeight: 56 }}>
        <div className="w-0 shrink-0" aria-hidden />
        <div className="flex flex-col items-center gap-0.5 min-w-0">
          <span className="text-xs italic truncate" style={{ color: colors.date, fontFamily: 'Georgia, serif' }}>
            {currentEntry?.createdAt
              ? new Date(currentEntry.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <AutosaveIndicator status={autosaveStatus} color={colors.prompt} />
        </div>
        <div className="w-0 shrink-0" aria-hidden />
      </div>

      {/* Selector — switch between today's entries / start new */}
      {todayEntries.length > 0 && (
        <div className="flex justify-center px-4 pb-2">
          <EntrySelector
            entries={todayEntries}
            currentEntryId={currentEntryId}
            onEntrySelect={handleEntrySelect}
          />
        </div>
      )}

      {/* Pager — page card fills the viewport so each page reads like a real
          diary page; pagination + auto-advance handle the breaks. */}
      <motion.div
        className="flex-1 overflow-hidden px-3"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleSwipeEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activePage}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            {activePage < photosDoodleIndex ? (
              <WritingPage
                colors={colors}
                isFirstPage={activePage === 0}
                pageText={pages[activePage]}
                onPageTextChange={(value, cursorAtEnd) => handlePageTextChange(activePage, value, cursorAtEnd)}
                linesPerPage={linesPerPage}
                prompt={prompt}
                songInput={songInput}
                onSongChange={handleSongChange}
                onSongClear={() => handleSongChange('')}
                textareaRef={writingTextareaRef}
              />
            ) : (
              <PhotosDoodlePage
                colors={colors}
                photos={pendingPhotos}
                onPhotoAdd={handlePhotoAdd}
                doodleStrokes={currentDoodleStrokes}
                onStrokesChange={handleStrokesChange}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Pagination dots */}
      <div className="flex items-center justify-center gap-2 py-4" style={{ minHeight: 56 }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <button
            key={i}
            onClick={() => setActivePage(i)}
            className="rounded-full transition-all"
            style={{
              width: i === activePage ? 8 : 6,
              height: i === activePage ? 8 : 6,
              background: i === activePage ? colors.date : colors.prompt,
              opacity: i === activePage ? 1 : 0.4,
            }}
            aria-label={`Go to page ${i + 1} of ${totalPages}`}
          />
        ))}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

function AutosaveIndicator({ status, color }: { status: AutosaveStatus; color: string }) {
  const label = status === 'saving' ? 'Saving…'
    : status === 'saved' ? 'Saved'
    : status === 'error' ? 'Save failed'
    : ''
  return (
    <span
      className="text-[10px] italic"
      style={{
        color: status === 'error' ? '#c0392b' : color,
        opacity: label ? 0.7 : 0,
        minWidth: 64,
        textAlign: 'center',
        transition: 'opacity 200ms',
      }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}

// ----------------------------------------------------------------------------

function WritingPage({
  colors, isFirstPage, pageText, onPageTextChange, linesPerPage,
  prompt, songInput, onSongChange, onSongClear, textareaRef,
}: {
  colors: ReturnType<typeof getGlassDiaryColors>
  isFirstPage: boolean
  pageText: string
  onPageTextChange: (value: string, cursorAtEnd: boolean) => void
  linesPerPage: number
  prompt: string
  songInput: string
  onSongChange: (value: string) => void
  onSongClear: () => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div
      className="h-full p-4 rounded-2xl flex flex-col"
      style={{
        background: colors.pageBg,
        backdropFilter: `blur(${colors.pageBlur})`,
        WebkitBackdropFilter: `blur(${colors.pageBlur})`,
        border: `1px solid ${colors.pageBorder}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
      }}
    >
      {isFirstPage && (
        <div className="mb-3" style={{ minHeight: 88 }}>
          <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
            style={{ color: colors.sectionLabel }}>
            Add a Song
          </div>
          {songInput && /https?:\/\//.test(songInput) ? (
            <div className="relative">
              <SongEmbed url={songInput} compact audioOnly />
              <button onClick={onSongClear}
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                style={{ background: colors.buttonBg, color: colors.prompt }}>
                ×
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={songInput}
              onChange={e => onSongChange(e.target.value)}
              placeholder="Paste Spotify, YouTube, or SoundCloud..."
              className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
              style={{
                border: `1px solid ${colors.pageBorder}`,
                color: colors.bodyText,
                background: 'rgba(255,255,255,0.03)',
              }}
            />
          )}
        </div>
      )}

      <div className="text-[10px] uppercase tracking-[0.18em] mb-1 font-medium"
        style={{ color: colors.sectionLabel }}>
        Write your thoughts
      </div>
      {isFirstPage && (
        <div className="text-xs italic mb-2" style={{ color: colors.prompt, fontFamily: 'Georgia, serif' }}>
          {prompt}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={pageText}
        onChange={e => {
          const cursorAtEnd = e.target.selectionStart === e.target.value.length
          onPageTextChange(e.target.value, cursorAtEnd)
        }}
        placeholder={isFirstPage ? "What's on your mind today..." : ''}
        rows={linesPerPage}
        className="w-full resize-none outline-none rounded-lg p-3"
        style={{
          // Fixed height = exactly linesPerPage tall, no internal scroll.
          // Pagination guarantees content never exceeds this height; the
          // overflow: hidden is a belt-and-braces against a 1-frame flash
          // before re-paginate runs.
          height: linesPerPage * JOURNAL.LINE_HEIGHT + 24,
          overflow: 'hidden',
          color: colors.bodyText,
          fontFamily: 'var(--font-caveat), Georgia, serif',
          fontSize: `${JOURNAL.FONT_SIZE}px`,
          lineHeight: `${JOURNAL.LINE_HEIGHT}px`,
          caretColor: colors.saveButton,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${colors.pageBorder}`,
          backgroundImage: `repeating-linear-gradient(transparent, transparent ${JOURNAL.LINE_HEIGHT - 1}px, ${colors.ruledLine} ${JOURNAL.LINE_HEIGHT - 1}px, ${colors.ruledLine} ${JOURNAL.LINE_HEIGHT}px)`,
          backgroundPosition: '0 12px',
        }}
      />

    </div>
  )
}

// ----------------------------------------------------------------------------

function PhotosDoodlePage({
  colors, photos, onPhotoAdd, doodleStrokes, onStrokesChange,
}: {
  colors: ReturnType<typeof getGlassDiaryColors>
  photos: Photo[]
  onPhotoAdd: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  doodleStrokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
}) {
  const captionDate = new Date()
  const dateCaption = captionDate
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()
  return (
    <div
      className="h-full p-4 rounded-2xl flex flex-col gap-3 overflow-y-auto"
      style={{
        background: colors.pageBg,
        backdropFilter: `blur(${colors.pageBlur})`,
        WebkitBackdropFilter: `blur(${colors.pageBlur})`,
        border: `1px solid ${colors.pageBorder}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.3)',
      }}
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
          style={{ color: colors.sectionLabel }}>
          Photos
        </div>
        <PhotoBlock photos={photos} onPhotoAdd={onPhotoAdd} dateCaption={dateCaption} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
          style={{ color: colors.sectionLabel }}>
          Draw
        </div>
        <div style={{ height: 160 }}>
          <CompactDoodleCanvas
            strokes={doodleStrokes}
            onStrokesChange={onStrokesChange}
            doodleColors={[colors.bodyText, colors.saveButton, colors.ribbon, colors.prompt]}
            canvasBackground={colors.doodleBg}
            canvasBorder={colors.doodleBorder}
            textColor={colors.bodyText}
            mutedColor={colors.prompt}
          />
        </div>
      </div>
    </div>
  )
}
