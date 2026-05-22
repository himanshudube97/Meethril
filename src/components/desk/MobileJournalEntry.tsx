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

type ActivePage = 'write' | 'media'

/**
 * Mobile journal entry — two tabbed surfaces inside a fixed-height shell:
 *
 *   1. WRITE   — song input + the writing textarea. The textarea has its
 *                own internal scroll so the page chrome never moves.
 *   2. MEDIA   — photos + doodle canvas.
 *
 * MAX_CHARS=1200 shared with desktop; HTML output is `<p>` paragraphs split
 * on '\n' so desktop's BookSpread overflow-paginates it onto the two-page
 * spread cleanly.
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
  const [activePage, setActivePage] = useState<ActivePage>('write')

  const autosave = useAutosaveEntry(null)
  const { trigger: autosaveTrigger, flush: autosaveFlush, reset: autosaveReset } = autosave
  const autosaveStatus = useDeskStore((s) => s.autosaveStatus)

  const hasAutoLoadedRef = useRef(false)
  const lastHydratedIdRef = useRef<string | null>(null)
  const skipNextAutosaveRef = useRef(false)

  useEffect(() => { setPrompt(getRandomPrompt()) }, [])

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
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

  // Trigger autosave whenever a draft field changes.
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
      setActivePage('write')
      return
    }
    setCurrentEntryId(entryId)
    setActivePage('write')
  }, [autosaveFlush, autosaveReset, resetCurrentEntry, setCurrentSong, setDoodleStrokes])

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: theme.bg.primary }}>
        <span style={{ color: colors.prompt }}>Loading...</span>
      </div>
    )
  }

  // Read-only view for past entries — keeps the existing scrollable layout.
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
              style={{
                background: colors.buttonBg,
                color: colors.bodyText,
                border: `1px solid ${colors.buttonBorder}`,
                fontFamily: 'Georgia, serif',
              }}
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

  // Editable view — fixed-height shell with two tabbed pages.
  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: theme.bg.primary }}>
      {/* Header (sits below the floating hamburger + gear thanks to pt-20) */}
      <div className="flex flex-col items-center pt-20 pb-2 px-12 shrink-0">
        <span className="text-xs italic" style={{ color: colors.date, fontFamily: 'Georgia, serif' }}>
          {currentEntry?.createdAt
            ? new Date(currentEntry.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <AutosaveIndicator status={autosaveStatus} color={colors.prompt} />
      </div>

      {todayEntries.length > 0 && (
        <div className="flex justify-center px-4 pb-2 shrink-0">
          <EntrySelector
            entries={todayEntries}
            currentEntryId={currentEntryId}
            onEntrySelect={handleEntrySelect}
          />
        </div>
      )}

      {/* Tab strip */}
      <div className="flex justify-center px-4 pb-3 shrink-0">
        <div
          className="inline-flex rounded-full p-1 gap-1"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
        >
          <TabPill active={activePage === 'write'} onClick={() => setActivePage('write')}>Write</TabPill>
          <TabPill active={activePage === 'media'} onClick={() => setActivePage('media')}>Photos & doodle</TabPill>
        </div>
      </div>

      {/* Active page card — fills remaining height, no outer scroll. */}
      <div className="flex-1 min-h-0 px-4 pb-6">
        {activePage === 'write' ? (
          <WritePage
            colors={colors}
            prompt={prompt}
            text={text}
            onTextChange={setText}
            songInput={songInput}
            onSongChange={handleSongChange}
          />
        ) : (
          <MediaPage
            colors={colors}
            photos={pendingPhotos}
            onPhotoAdd={handlePhotoAdd}
            doodleStrokes={currentDoodleStrokes}
            onStrokesChange={handleStrokesChange}
          />
        )}
      </div>

      {ShareCapture}
    </div>
  )
}

// ----------------------------------------------------------------------------

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const { theme } = useThemeStore()
  return (
    <button
      onClick={onClick}
      className="text-xs px-4 py-1.5 rounded-full transition"
      style={{
        background: active ? `${theme.accent.primary}30` : 'transparent',
        color: active ? theme.text.primary : theme.text.muted,
        fontFamily: 'Georgia, serif',
      }}
    >
      {children}
    </button>
  )
}

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
        transition: 'opacity 200ms',
      }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}

// ----------------------------------------------------------------------------

function WritePage({
  colors,
  prompt,
  text,
  onTextChange,
  songInput,
  onSongChange,
}: {
  colors: ReturnType<typeof getGlassDiaryColors>
  prompt: string
  text: string
  onTextChange: (v: string) => void
  songInput: string
  onSongChange: (v: string) => void
}) {
  return (
    <div
      className="h-full rounded-2xl p-4 flex flex-col gap-4 min-h-0"
      style={{
        background: colors.pageBg,
        backdropFilter: `blur(${colors.pageBlur})`,
        WebkitBackdropFilter: `blur(${colors.pageBlur})`,
        border: `1px solid ${colors.pageBorder}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.2)',
      }}
    >
      <div className="shrink-0">
        <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
          style={{ color: colors.sectionLabel }}>
          Add a Song
        </div>
        {songInput && /https?:\/\//.test(songInput) ? (
          <div className="relative">
            <SongEmbed url={songInput} compact audioOnly />
            <button onClick={() => onSongChange('')}
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

      <div className="shrink-0">
        <div className="text-[10px] uppercase tracking-[0.18em] mb-1 font-medium"
          style={{ color: colors.sectionLabel }}>
          Write your thoughts
        </div>
        <div className="text-xs italic" style={{ color: colors.prompt, fontFamily: 'Georgia, serif' }}>
          {prompt}
        </div>
      </div>

      {/* The textarea fills the remaining card height and scrolls inside
          itself — the outer page chrome never moves while typing. */}
      <textarea
        value={text}
        onChange={e => onTextChange(e.target.value)}
        placeholder="What's on your mind today..."
        maxLength={JOURNAL.MAX_CHARS}
        className="flex-1 min-h-0 w-full resize-none outline-none rounded-lg p-3"
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
          overflowY: 'auto',
        }}
      />

      <div className="text-right text-[10px] shrink-0"
        style={{ color: text.length > JOURNAL.MAX_CHARS * 0.9 ? colors.saveButton : colors.prompt }}>
        {text.length} / {JOURNAL.MAX_CHARS}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

function MediaPage({
  colors,
  photos,
  onPhotoAdd,
  doodleStrokes,
  onStrokesChange,
}: {
  colors: ReturnType<typeof getGlassDiaryColors>
  photos: Photo[]
  onPhotoAdd: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  doodleStrokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
}) {
  const dateCaption = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()
  return (
    <div
      className="h-full rounded-2xl p-5 flex flex-col gap-6 overflow-y-auto"
      style={{
        background: colors.pageBg,
        backdropFilter: `blur(${colors.pageBlur})`,
        WebkitBackdropFilter: `blur(${colors.pageBlur})`,
        border: `1px solid ${colors.pageBorder}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.2)',
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
        <div style={{ height: 220 }}>
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
