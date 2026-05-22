// src/components/desk/MobileJournalEntry.tsx
'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useThemeStore } from '@/store/theme'
import { useJournalStore, StrokeData } from '@/store/journal'
import { JOURNAL } from '@/lib/journal-constants'
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

/**
 * Mobile journal entry — a single scrollable page (no pagination, no swipe).
 *
 * Cross-device contract: text is capped at `JOURNAL.MAX_CHARS` (same as
 * desktop), saved as `<p>` paragraphs split on '\n'. Desktop's BookSpread
 * reads the same HTML and paginates it across its left/right pages via
 * overflow detection. So what the user writes here will fit cleanly on
 * desktop's two-page spread, and vice versa.
 */
export default function MobileJournalEntry() {
  const { theme } = useThemeStore()
  const colors = useMemo(() => getGlassDiaryColors(theme), [theme])
  const {
    currentSong,
    setCurrentSong,
    currentDoodleStrokes,
    setDoodleStrokes,
    resetCurrentEntry,
  } = useJournalStore()

  const [entries, setEntries] = useState<Entry[]>([])
  const [todayEntries, setTodayEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null)
  const [text, setText] = useState('')
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { setPrompt(getRandomPrompt()) }, [])

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
      // One diary = one calendar month. Scope to the current month so the
      // mobile entry view can't navigate into last month.
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const res = await fetch(`/api/entries?month=${currentMonth}&limit=50`, {
        headers: { 'X-User-TZ': getClientTz() },
      })
      if (res.ok) {
        const data = await res.json()
        const raw = (data.entries || []) as Entry[]
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
    setText(htmlToPlainText(currentEntry.text || ''))
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
  }, [currentEntry, isPastEntry, autosaveReset, setCurrentSong, setDoodleStrokes])

  // Trigger autosave whenever a draft field changes. Covers both new entries
  // (POST on first content) and today's entries (PUT on every change).
  useEffect(() => {
    if (loading) return
    if (isPastEntry) return
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false
      return
    }
    const hasContent = text.trim().length > 0
      || (songInput && /https?:\/\//.test(songInput))
      || pendingPhotos.length > 0
      || currentDoodleStrokes.length > 0
    if (!hasContent && !currentEntryId) return
    // Encode as <p>...</p> paragraphs so desktop's HTML pipeline can pick it
    // apart correctly. Newlines become paragraph breaks; the server stores
    // the HTML and desktop's overflow detection paginates it onto the two
    // book pages as needed.
    const html = '<p>' + text.replace(/\n/g, '</p><p>') + '</p>'
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
  }, [text, songInput, pendingPhotos, currentDoodleStrokes, currentEntryId, isPastEntry, loading, autosaveTrigger])

  // When the autosave hook creates a fresh entry (POST → 200), pull the new
  // id into local state and refetch so the EntrySelector reflects it.
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

  // Auto-resize textarea so it grows with content — the outer page scrolls
  // instead of the textarea showing an internal scrollbar.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, JOURNAL.LINE_HEIGHT * 6)}px`
  }, [text])

  // Share-capture surface for the current entry — renders a JournalShareCard
  // off-screen, captures it, and opens the OS share sheet / download.
  const { CameraButton: ShareCameraButton, Capture: ShareCapture } = useShareableCapture({
    cardContent: currentEntry ? <JournalShareCard entry={currentEntry as unknown as JournalEntry} /> : null,
    surface: 'diary',
    date: currentEntry ? new Date(currentEntry.createdAt) : new Date(),
  })

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
    await autosaveFlush()
    if (entryId === null) {
      skipNextAutosaveRef.current = true
      setText('')
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
    setCurrentEntryId(entryId)
  }, [autosaveFlush, autosaveReset, resetCurrentEntry, setCurrentSong, setDoodleStrokes])

  if (loading) {
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
      <div className="fixed inset-0 overflow-y-auto z-40" style={{ background: theme.bg.primary }}>
        <div className="max-w-lg mx-auto px-4 pt-20 pb-12">
          <div className="flex items-center justify-between mb-4 px-12">
            <button
              onClick={() => handleEntrySelect(null)}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: colors.buttonBg, color: colors.bodyText, border: `1px solid ${colors.buttonBorder}`, fontFamily: 'Georgia, serif' }}
            >
              ← Today
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
          <div className="flex justify-end pt-2">{ShareCameraButton}</div>
        </div>
        {ShareCapture}
      </div>
    )
  }

  // Editable view — single scrollable page (new entry OR today's entry).
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto" style={{ background: theme.bg.primary }}>
      <div className="max-w-lg mx-auto flex flex-col gap-4 px-4 pt-20 pb-12">
        {/* Header — left/right padding leaves room for the floating hamburger
            (top-4 left-4) and gear (top-6 right-6) so the centered date never
            slides under them. */}
        <div className="flex items-center justify-center px-12">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs italic" style={{ color: colors.date, fontFamily: 'Georgia, serif' }}>
              {currentEntry?.createdAt
                ? new Date(currentEntry.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <AutosaveIndicator status={autosaveStatus} color={colors.prompt} />
          </div>
        </div>

        {todayEntries.length > 0 && (
          <div className="flex justify-center">
            <EntrySelector
              entries={todayEntries}
              currentEntryId={currentEntryId}
              onEntrySelect={handleEntrySelect}
            />
          </div>
        )}

        {/* Single page card with all entry inputs */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-5"
          style={{
            background: colors.pageBg,
            backdropFilter: `blur(${colors.pageBlur})`,
            WebkitBackdropFilter: `blur(${colors.pageBlur})`,
            border: `1px solid ${colors.pageBorder}`,
            boxShadow: '0 8px 28px rgba(0,0,0,0.2)',
          }}
        >
          {/* Song input */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
              style={{ color: colors.sectionLabel }}>
              Add a Song
            </div>
            {songInput && /https?:\/\//.test(songInput) ? (
              <div className="relative">
                <SongEmbed url={songInput} compact audioOnly />
                <button onClick={() => handleSongChange('')}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
                  style={{ background: colors.buttonBg, color: colors.prompt }}>
                  ×
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={songInput}
                onChange={e => handleSongChange(e.target.value)}
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

          {/* Writing area — auto-grows; page scrolls. MAX_CHARS shared with
              desktop so cross-device the entry fits naturally on the 2-page
              spread. */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] mb-1 font-medium"
              style={{ color: colors.sectionLabel }}>
              Write your thoughts
            </div>
            <div className="text-xs italic mb-2" style={{ color: colors.prompt, fontFamily: 'Georgia, serif' }}>
              {prompt}
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="What's on your mind today..."
              maxLength={JOURNAL.MAX_CHARS}
              rows={6}
              className="w-full resize-none outline-none rounded-lg p-3"
              style={{
                color: colors.bodyText,
                fontFamily: 'var(--font-caveat), Georgia, serif',
                fontSize: `${JOURNAL.FONT_SIZE}px`,
                lineHeight: `${JOURNAL.LINE_HEIGHT}px`,
                caretColor: colors.saveButton,
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${colors.pageBorder}`,
                backgroundImage: `repeating-linear-gradient(transparent, transparent ${JOURNAL.LINE_HEIGHT - 1}px, ${colors.ruledLine} ${JOURNAL.LINE_HEIGHT - 1}px, ${colors.ruledLine} ${JOURNAL.LINE_HEIGHT}px)`,
                backgroundPosition: '0 12px',
                overflow: 'hidden',
              }}
            />
            <div className="text-right text-[10px] mt-2"
              style={{ color: text.length > JOURNAL.MAX_CHARS * 0.9 ? colors.saveButton : colors.prompt }}>
              {text.length} / {JOURNAL.MAX_CHARS}
            </div>
          </div>

          {/* Photos */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
              style={{ color: colors.sectionLabel }}>
              Photos
            </div>
            <PhotoBlock
              photos={pendingPhotos}
              onPhotoAdd={handlePhotoAdd}
              dateCaption={new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
            />
          </div>

          {/* Doodle */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
              style={{ color: colors.sectionLabel }}>
              Draw
            </div>
            <div style={{ height: 200 }}>
              <CompactDoodleCanvas
                strokes={currentDoodleStrokes}
                onStrokesChange={handleStrokesChange}
                doodleColors={[colors.bodyText, colors.saveButton, colors.ribbon, colors.prompt]}
                canvasBackground={colors.doodleBg}
                canvasBorder={colors.doodleBorder}
                textColor={colors.bodyText}
                mutedColor={colors.prompt}
              />
            </div>
          </div>

          {/* Share button (only after an entry exists) */}
          {currentEntry && (
            <div className="flex justify-end pt-2">
              {ShareCameraButton}
            </div>
          )}
        </div>
      </div>
      {ShareCapture}
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
        minHeight: 12,
        textAlign: 'center',
        transition: 'opacity 200ms',
      }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}
