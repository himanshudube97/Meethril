'use client'

import React, { useCallback, useEffect, useRef, useState, memo, forwardRef } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useDeskStore } from '@/store/desk'
import { getGlassDiaryColors, GlassDiaryColors } from '@/lib/glassDiaryColors'
import { getSpineDesign } from '@/lib/spineDesigns'
import LeftPage, { type LeftPageHandle } from './LeftPage'
import RightPage, { type RightPageHandle } from './RightPage'
import { RibbonBookmark } from './interactive/RibbonBookmark'
import RibbonTag from './interactive/RibbonTag'
import ThemeOrnament from './decorations/ThemeOrnament'
import DiaryActionRail from './DiaryActionRail'
import SpineOrnaments from './SpineOrnaments'
import DateTabRail from './DateTabRail'
import { StrokeData, useJournalStore } from '@/store/journal'
import { useAutosaveEntry, AutosaveDraft } from '@/hooks/useAutosaveEntry'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'
import { isEntryLocked, getClientTz } from '@/lib/entry-lock-client'
import { parseStyle } from '@/lib/entry-style'
import { htmlToSplitPlainText, PAGE_BREAK_MARKER } from '@/lib/text-utils'
import { deletePhotoBlob } from '@/lib/storage/delete-photo-blob'
import { useE2EEStore } from '@/store/e2ee'
import { useShareableCapture } from '@/components/share/ShareableCapture'

const HTMLFlipBook = dynamic(() => import('react-pageflip'), { ssr: false })

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
  style?: import('@/lib/entry-style').EntryStyle | null
  encryptionType?: string
}

// Fixed page dimensions for the flipbook
const PAGE_WIDTH = 650
const PAGE_HEIGHT = 820


const PageWrapper = memo(
  forwardRef<HTMLDivElement, {
    children: React.ReactNode
    side: 'left' | 'right'
    colors: GlassDiaryColors
  }>(function PageWrapper({ children, side, colors }, ref) {
    const isLeft = side === 'left'
    // Inline styles get wiped by the library mid-flip, so background/border/
    // shadow live in CSS classes (see globals.css .diary-page). Width and
    // height stay inline because the library overrides them anyway.
    return (
      <div
        ref={ref}
        className={`diary-page ${isLeft ? 'diary-page--left' : 'diary-page--right'}`}
        style={{
          width: `${PAGE_WIDTH}px`,
          height: `${PAGE_HEIGHT}px`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            zIndex: 10,
            padding: isLeft ? '20px 20px 20px 50px' : '20px 50px 20px 20px',
          }}
        >
          {children}
        </div>
      </div>
    )
  })
)

function combineDraftHtml(left: string, right: string): string {
  // Plain newline-separated text per page → <p>-wrapped HTML, joined with a
  // page-break marker. The marker preserves the exact left/right boundary
  // chosen by live DOM-overflow measurement during typing — without it,
  // reload would re-derive the split via a character-count formula that
  // diverges from the actual rendered layout, reshuffling the user's text.
  const leftHtml = left.trim() ? `<p>${left.replace(/\n/g, '</p><p>')}</p>` : ''
  const rightHtml = right.trim() ? `<p>${right.replace(/\n/g, '</p><p>')}</p>` : ''
  return leftHtml + PAGE_BREAK_MARKER + rightHtml
}

export default function BookSpread() {
  const { theme, themeName } = useThemeStore()
  const setCurrentSong = useJournalStore((s) => s.setCurrentSong)
  const setDoodleStrokes = useJournalStore((s) => s.setDoodleStrokes)
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()
  const colors = getGlassDiaryColors(theme)
  // Subscribe via selectors so BookSpread does NOT re-render when
  // leftPageDraft/rightPageDraft change in the desk store. If it did,
  // react-pageflip would rebuild page DOM on every keystroke and kill focus.
  const globalCurrentSpread = useDeskStore((s) => s.currentSpread)
  const totalSpreads = useDeskStore((s) => s.totalSpreads)
  const setTotalSpreads = useDeskStore((s) => s.setTotalSpreads)
  const goToSpread = useDeskStore((s) => s.goToSpread)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipBookRef = useRef<any>(null)
  const diaryRootRef = useRef<HTMLDivElement>(null)
  const coverRef = useRef<HTMLDivElement>(null)

  const autosave = useAutosaveEntry()
  const autosaveRef = useRef(autosave)
  autosaveRef.current = autosave

  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  // True once react-pageflip has finished its internal init (which positions
  // pages in 3D space via useEffect *after* HTMLFlipBook mounts). Until then
  // the book frame would show the cover sitting on un-laid-out page divs —
  // visible on refresh as "cover, then diary on top". Gating the fade-in on
  // this prevents that.
  const [bookReady, setBookReady] = useState(false)
  const [pendingPhotos, setPendingPhotos] = useState<Photo[]>([])
  // Focus is driven imperatively (refs) instead of via React state. Holding
  // focus in BookSpread state would re-render the flipbook on every spine
  // crossing, and react-pageflip's updateFromHtml destroys/recreates page
  // DOM mid-update, blurring the focused textarea.
  const leftPageRef = useRef<LeftPageHandle>(null)
  const rightPageRef = useRef<RightPageHandle>(null)

  // Track pendingPhotos via ref so the autosave-trigger callback (which is
  // wired via store .subscribe outside React's render cycle) sees fresh data.
  const pendingPhotosRef = useRef(pendingPhotos)
  pendingPhotosRef.current = pendingPhotos

  // Fetch entries on mount. If there's an unlocked today-entry, pluck the
  // most recent one to be the "active editing target" — bound to the
  // new-entry spread, with autosave configured to PUT to its id. The rest
  // (including any older today entries) stay in the regular flipbook list.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        // Kick off the react-pageflip chunk load in parallel with the
        // entries fetch. Without this, `loading` flips to false the
        // instant the API resolves, but `dynamic(() => import(...))` is
        // still streaming the flipbook chunk over the network — so the
        // book frame (cover + ribbon + ornaments) fades in alone for a
        // tick before pages mount. That's the "cover blip" users see on
        // first load and refresh.
        const flipbookPromise = import('react-pageflip')

        // One diary = one calendar month. Scope the fetch to the current
        // month so navigation can never flip into last month's pages —
        // past months live on the shelf, opened separately.
        const now = new Date()
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const res = await fetch(`/api/entries?month=${currentMonth}&limit=50`, {
          headers: { 'X-User-TZ': getClientTz() },
        })
        if (!res.ok) {
          await flipbookPromise.catch(() => {})
          return
        }
        const data = await res.json()
        const rawEntries: Entry[] = data.entries || []
        // Decrypt E2EE entries client-side. Non-e2ee entries pass through unchanged.
        const fetched = (await decryptEntriesFromServer(
          rawEntries as unknown as JournalEntry[]
        )) as unknown as Entry[]
        if (cancelled) return

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const isToday = (e: Entry) => new Date(e.createdAt) >= startOfToday
        const isUnlocked = (e: Entry) => !isEntryLocked(e.createdAt)

        // Most recent unlocked today entry, if any → hydrate as active.
        const activeIdx = fetched.findIndex((e) => isToday(e) && isUnlocked(e))
        const active = activeIdx >= 0 ? fetched[activeIdx] : null
        const remainder = activeIdx >= 0
          ? [...fetched.slice(0, activeIdx), ...fetched.slice(activeIdx + 1)]
          : fetched

        setEntries(remainder)
        setTotalSpreads(remainder.length + 1)

        if (active) {
          // Guard against feeding an E2EE placeholder back into the editor.
          // useE2EE.decryptEntryFromServer returns "[Encrypted — unlock to
          // view]" or "[Decryption failed]" when the master key isn't
          // available. Hydrating the draft from those strings means the next
          // autosave overwrites the (still-encrypted) row with that
          // placeholder text — corruption in slow motion. Skip hydration
          // and let the effect re-run when isE2EEReady flips true.
          //
          // Phase 5b removed `encryptionType` from JournalEntry, so the
          // detect is now purely based on the placeholder text strings the
          // decrypt hook injects. All entries are E2EE, so doodle/photo
          // shape mismatches manifest as `strokes` being the encrypted
          // `{encryptedStrokes, e2eeIV}` object rather than a stroke array —
          // detect that explicitly too so we never feed it into the canvas.
          const placeholderText =
            active.text?.includes('[Encrypted') ||
            active.text?.includes('[Decryption failed]')
          const firstDoodleStrokes = active.doodles?.[0]?.strokes
          const doodleStillEncrypted =
            firstDoodleStrokes !== undefined &&
            !Array.isArray(firstDoodleStrokes)
          const isE2EEPlaceholder = placeholderText || doodleStillEncrypted
          if (isE2EEPlaceholder) {
            // The active entry can't be decrypted right now (locked / key not
            // ready). Blank the editor so we never (a) leave stale plaintext on
            // screen after a manual "Lock diary", or (b) feed an "[Encrypted …]"
            // placeholder back into the editor where the next autosave could
            // persist it. Bind autosave to the id LAST so its reset() cancels
            // any debounced save these clears might have scheduled; the effect
            // re-runs when isE2EEReady flips true and hydrates the real content.
            useDeskStore.getState().setDrafts('', '')
            useDeskStore.getState().setEntryStyleDraft(parseStyle(null))
            setCurrentSong('')
            setDoodleStrokes([])
            setPendingPhotos([])
            autosaveRef.current.reset(active.id)
          } else {
          // Hydrate active state from the entry. Uses the persisted page-break
          // marker when present so the boundary matches what was visible the
          // last time the user typed.
          const [leftPlain, rightPlain] = htmlToSplitPlainText(active.text || '')
          useDeskStore.getState().setDrafts(leftPlain, rightPlain)
          useDeskStore.getState().setEntryStyleDraft(parseStyle(active.style ?? null))
          setCurrentSong(active.song || '')
          const doodleStrokes = active.doodles?.[0]?.strokes ?? []
          setDoodleStrokes(doodleStrokes)
          // Photos: map the entry's photos to the local pending shape.
          const activePhotos: Photo[] = (active.photos || []).map((p) => ({
            id: p.id,
            url: p.url,
            encryptedRef: p.encryptedRef,
            encryptedRefIV: p.encryptedRefIV,
            rotation: p.rotation,
            position: p.position as 1 | 2,
          }))
          setPendingPhotos(activePhotos)
          autosaveRef.current.reset(active.id)
          }
        }

        // Wait for the flipbook chunk too — only then flip `loading`,
        // so motion.div mounts with the library already cached and pages
        // render in the same frame as the cover.
        await flipbookPromise.catch(() => {})
      } catch (error) {
        console.error('Failed to fetch entries:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [setTotalSpreads, setCurrentSong, setDoodleStrokes, decryptEntriesFromServer, isE2EEReady])

  // After loading, jump to the new-entry spread (last)
  useEffect(() => {
    if (!loading) {
      goToSpread(entries.length)
    }
  }, [loading, entries.length, goToSpread])

  // Safety net: if react-pageflip's onInit somehow doesn't fire, reveal the
  // book anyway after a short grace period so it never gets stuck invisible.
  useEffect(() => {
    if (loading) return
    const timer = setTimeout(() => setBookReady(true), 800)
    return () => clearTimeout(timer)
  }, [loading])

  // Build the current draft from all the places its parts live.
  const buildDraft = useCallback((): AutosaveDraft => {
    const desk = useDeskStore.getState()
    const journal = useJournalStore.getState()
    const text = combineDraftHtml(desk.leftPageDraft, desk.rightPageDraft)
    return {
      text,
      song: journal.currentSong || null,
      photos: pendingPhotosRef.current.map((p) => ({
        url: p.url,
        encryptedRef: p.encryptedRef,
        encryptedRefIV: p.encryptedRefIV,
        position: p.position,
        rotation: p.rotation,
        spread: 1,
      })),
      doodles: journal.currentDoodleStrokes.length > 0
        ? [{ strokes: journal.currentDoodleStrokes, spread: 1 }]
        : [],
      style: desk.entryStyleDraft,
    }
  }, [])

  // Subscribe to draft + journal store changes WITHOUT re-rendering
  // BookSpread (which would tear down the flipbook). Each change kicks the
  // debounced autosave trigger.
  useEffect(() => {
    if (loading) return
    const unsubDesk = useDeskStore.subscribe((state, prev) => {
      if (
        state.leftPageDraft !== prev.leftPageDraft ||
        state.rightPageDraft !== prev.rightPageDraft ||
        state.entryStyleDraft !== prev.entryStyleDraft
      ) {
        autosaveRef.current.trigger(buildDraft())
      }
    })
    const unsubJournal = useJournalStore.subscribe((state, prev) => {
      if (
        state.currentSong !== prev.currentSong ||
        state.currentDoodleStrokes !== prev.currentDoodleStrokes
      ) {
        autosaveRef.current.trigger(buildDraft())
      }
    })
    return () => {
      unsubDesk()
      unsubJournal()
    }
  }, [loading, buildDraft])

  // Photo add/remove handlers (handlePhotoAdd / handlePhotoRemove) call
  // trigger+flush directly, so no separate effect is needed here. The
  // previous effect fired one phantom save on mount when `loading` flipped
  // false, even with no user input.

  // Best-effort flush before the page goes away so a refresh inside the
  // 1.5s debounce window doesn't lose the pending text/song/doodle edits.
  // (Photo add/remove already flushes synchronously in their handlers.)
  useEffect(() => {
    const onBeforeUnload = () => { void autosaveRef.current.flush() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Library's onFlip event: convert page index -> spread index and sync store
  const handleFlip = useCallback((e: { data: number }) => {
    goToSpread(Math.floor(e.data / 2))
  }, [goToSpread])

  // Programmatic external goToSpread() calls (e.g. EntrySelector clicks)
  // need to be pushed back to the library so its visible page matches.
  useEffect(() => {
    const pageFlip = flipBookRef.current?.pageFlip?.()
    if (!pageFlip) return
    const targetPage = globalCurrentSpread * 2
    if (pageFlip.getCurrentPageIndex?.() !== targetPage) {
      pageFlip.turnToPage?.(targetPage)
    }
  }, [globalCurrentSpread])

  const handlePrevPage = useCallback(() => {
    flipBookRef.current?.pageFlip()?.flipPrev()
  }, [])

  const handleNextPage = useCallback(() => {
    flipBookRef.current?.pageFlip()?.flipNext()
  }, [])

  // Two-finger scroll = arrow click. Accumulate wheel delta and fire the
  // library's full flip animation past a threshold; lock out further flips
  // for the duration of the animation so one swipe == one page.
  useEffect(() => {
    const el = diaryRootRef.current
    if (!el) return

    const THRESHOLD = 60
    const FLIP_LOCK_MS = 1300

    let accumulated = 0
    let isFlipping = false

    const handler = (e: WheelEvent) => {
      const dominant =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault()
      if (isFlipping || dominant === 0) return

      accumulated += dominant
      if (Math.abs(accumulated) < THRESHOLD) return

      isFlipping = true
      const pf = flipBookRef.current?.pageFlip?.()
      if (accumulated > 0) pf?.flipNext()
      else pf?.flipPrev()
      accumulated = 0
      setTimeout(() => {
        isFlipping = false
      }, FLIP_LOCK_MS)
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const handleLeftPageFull = useCallback((overflowText: string, cursorStaysOnLeft: boolean) => {
    if (overflowText) {
      useDeskStore.getState().setRightPageDraft((prev) => overflowText + prev)
    }
    // Only follow the overflow with focus when the user's caret was actually
    // in the spilled portion (e.g. typing past the right edge of the last
    // line). When they were editing in the middle and the LAST line got
    // pushed off, focus belongs on the left page — LeftPage restores its
    // own selection.
    if (!cursorStaysOnLeft) {
      requestAnimationFrame(() => {
        rightPageRef.current?.focusAtAfterPrepend(overflowText.length)
      })
    }
  }, [])

  // ArrowRight (no targetLeft) lands at position 0 of the right page.
  // ArrowDown passes the caret's left pixel offset so the destination caret
  // lands on row 0 at the same visual horizontal column.
  const handleNavigateRight = useCallback((targetLeft?: number) => {
    if (typeof targetLeft === 'number') {
      rightPageRef.current?.focusAtFirstRow(targetLeft)
    } else {
      rightPageRef.current?.focusAtStart()
    }
  }, [])

  const handleNavigateLeft = useCallback((targetLeft?: number) => {
    if (typeof targetLeft === 'number') {
      leftPageRef.current?.focusAtLastRow(targetLeft)
    } else {
      leftPageRef.current?.focusAtEnd()
    }
  }, [])

  // Backspace at right-page pos 0: continuous-document semantics — delete the
  // last character of the left page and land caret at left's new end.
  const handleBackspaceAcrossSpine = useCallback(() => {
    useDeskStore.getState().setLeftPageDraft((prev) =>
      prev.length > 0 ? prev.slice(0, -1) : prev,
    )
    requestAnimationFrame(() => {
      leftPageRef.current?.focusAtEnd()
    })
  }, [])

  const handlePhotoAdd = useCallback((position: 1 | 2, photoData: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => {
    const rotation = position === 1 ? -8 + Math.floor(Math.random() * 6) : 5 + Math.floor(Math.random() * 6)
    const newPhoto: Photo = {
      ...photoData,
      position,
      rotation,
    }
    // Update the ref synchronously so the flush() below sees the new photo
    // even before React re-renders (the useEffect on pendingPhotos that
    // normally syncs the ref hasn't fired yet at this point).
    const next = [...pendingPhotosRef.current.filter(p => p.position !== position), newPhoto]
    pendingPhotosRef.current = next
    setPendingPhotos(next)
    console.log('[hearth] handlePhotoAdd', {
      position,
      hasUrl: !!photoData.url,
      hasEncryptedRef: !!photoData.encryptedRef,
      pendingPhotosLen: next.length,
    })
    // Photos are atomic events — debouncing only creates a window where a
    // quick refresh kills the timer before the PUT fires. Force the save now.
    autosaveRef.current.trigger(buildDraft())
    void autosaveRef.current.flush()
  }, [buildDraft])

  const handlePhotoRemove = useCallback((position: 1 | 2) => {
    const removed = pendingPhotosRef.current.find(p => p.position === position)
    if (removed) {
      // Free the underlying storage object as soon as the user removes the
      // photo, so we don't leak Supabase / blob-table rows. Server can't see
      // E2EE handles, so deletion has to fire from the browser. Fire-and-
      // forget — UI removal must not wait on it.
      const masterKey = useE2EEStore.getState().masterKey
      void deletePhotoBlob(removed, masterKey)
    }
    const next = pendingPhotosRef.current.filter(p => p.position !== position)
    pendingPhotosRef.current = next
    setPendingPhotos(next)
    // Same reasoning as add: removal should land server-side immediately.
    autosaveRef.current.trigger(buildDraft())
    void autosaveRef.current.flush()
  }, [buildDraft])

  const isNewEntrySpread = globalCurrentSpread === entries.length

  // Floating date pill: derive from the spread currently visible
  const visibleEntry = !isNewEntrySpread && globalCurrentSpread < entries.length
    ? entries[globalCurrentSpread]
    : null
  const spreadDate = visibleEntry ? new Date(visibleEntry.createdAt) : new Date()

  // Share-capture: snapshot the live diary DOM directly. We target
  // diaryRootRef (outermost wrapper) so the captured image includes the
  // wooden book cover, the date-tab rail, and ribbon — the full diary,
  // not just the inner spread. The result is wrapped in a polaroid frame
  // (white border + caption strip) for a marketing-friendly share asset.
  const polaroidCaption = `${spreadDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · meethril`
  const { Capture: ShareCapture, open: openShare, isOpen: shareBusy } = useShareableCapture({
    captureTarget: () => diaryRootRef.current,
    surface: 'diary',
    date: spreadDate,
    polaroidCaption,
  })

  // Pin the actions to the hardcover's top-right edge (measured live) so they
  // ride the corner of the book on any screen size — the cover is scaled +
  // centered by DeskScene, so a fixed viewport offset would drift off it.
  const [actionAnchor, setActionAnchor] = useState<{ top: number; right: number } | null>(null)
  useEffect(() => {
    if (loading) return
    const measure = () => {
      const el = coverRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setActionAnchor({ top: r.top, right: window.innerWidth - r.right })
    }
    measure()
    window.addEventListener('resize', measure)
    // Re-measure across the entrance scale-in + layout settle.
    const timers = [setTimeout(measure, 200), setTimeout(measure, 700), setTimeout(measure, 1300)]
    return () => {
      window.removeEventListener('resize', measure)
      timers.forEach(clearTimeout)
    }
  }, [loading, bookReady])

  return (
    <div
      ref={diaryRootRef}
      className="relative"
      style={{
        perspective: '2500px',
        perspectiveOrigin: 'center center',
        overscrollBehaviorX: 'contain',
      }}
    >

      {/* Book frame: positions a decorative hardcover background behind the
          spread so the pages read as set inside an open hardback diary.
          inline-block shrink-wraps to the inner motion.div's size so the
          cover's negative-inset extension is anchored to the page edges,
          not the outer page width. */}
      <div
        className="relative inline-block"
        style={{
          ['--book-cover-bg' as string]: colors.cover,
          ['--book-cover-border' as string]: colors.coverBorder,
        } as React.CSSProperties}
      >

      {/* Book wrapper. Sized for the spread (1300x820), relative so chrome
          can be positioned absolutely on top. The --page-bg CSS variable is
          inherited by the .diary-page children so each page tints to the
          current theme without setting it inline (the library would wipe
          inline styles mid-flip).

          Conditionally rendered on `!loading` so the cover and pages mount
          together once entries are fetched. Mount cannot wait for bookReady
          because bookReady fires from HTMLFlipBook's onInit, which lives
          inside this motion.div — gating mount on it would deadlock. The
          motion.div instead mounts at opacity 0 and fades in once
          bookReady fires (or the 800ms safety timer trips). The cover
          backdrop lives inside, inheriting the same fade so it never pops
          in alone before the pages. */}
      {!loading && (
      <motion.div
        className="relative"
        style={{
          width: `${PAGE_WIDTH * 2}px`,
          height: `${PAGE_HEIGHT}px`,
          transformStyle: 'preserve-3d',
          ['--page-bg' as string]: colors.pageBg,
          ['--page-bg-solid' as string]: colors.pageBgSolid,
        } as React.CSSProperties}
        initial={{ rotateX: 5, opacity: 0 }}
        animate={
          bookReady
            ? { rotateX: 0, opacity: 1 }
            : { rotateX: 5, opacity: 0 }
        }
        transition={{
          rotateX: { duration: 0.6 },
          opacity: { duration: 0.6 },
        }}
      >
        {/* Full-spread hardcover backdrop. Lives inside motion.div so it
            inherits the same opacity fade-in — the cover and pages reveal
            together rather than the cover popping in first. */}
        <div
          ref={coverRef}
          className="book-cover"
          style={{ left: '-48px' }}
        />

        {/* Ribbon bookmark with brass swivel clasp + oval hangtag dangling beneath */}
        <RibbonBookmark color={colors.ribbon}>
          <RibbonTag date={spreadDate} colors={colors} />
        </RibbonBookmark>

        {/* Top flourish — chapter-opener ornament that adapts per theme.
            Replaces the date pill (date now lives on the bookmark hangtag). */}
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-none"
        >
          <div style={{ width: '36px', height: '1px', background: colors.pageBorder }} />
          <ThemeOrnament themeName={themeName} color={colors.ribbon} size={20} />
          <div style={{ width: '36px', height: '1px', background: colors.pageBorder }} />
        </div>

        {/* Flipbook (only after entries are loaded so startPage is correct).
            Page count is stable across the autosave lifecycle (the active
            entry stays bound to the new-entry spread instead of getting
            appended), so no remount-on-save key is needed. */}
        {!loading && (
          <HTMLFlipBook
            ref={flipBookRef}
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            size="fixed"
            minWidth={PAGE_WIDTH}
            maxWidth={PAGE_WIDTH}
            minHeight={PAGE_HEIGHT}
            maxHeight={PAGE_HEIGHT}
            drawShadow={true}
            maxShadowOpacity={0.3}
            flippingTime={1200}
            useMouseEvents={false}
            mobileScrollSupport={false}
            showCover={false}
            startPage={entries.length * 2}
            onFlip={handleFlip}
            onInit={() => setBookReady(true)}
            className=""
            style={{}}
            startZIndex={0}
            autoSize={false}
            clickEventForward={true}
            usePortrait={false}
            swipeDistance={30}
            showPageCorners={false}
            disableFlipByClick={true}
          >
            {/* Existing entries: oldest first so the newest sits next to the
                new-entry spread at the back of the book. Reverse-chronological
                navigation: ‹ goes to older entries, › advances toward the new-entry. */}
            {[...entries].reverse().flatMap((entry) => [
              <PageWrapper key={`${entry.id}-L`} side="left" colors={colors}>
                <LeftPage
                  entry={entry}
                  isNewEntry={false}
                />
              </PageWrapper>,
              <PageWrapper key={`${entry.id}-R`} side="right" colors={colors}>
                <RightPage
                  entry={entry}
                  isNewEntry={false}
                  photos={entry.photos || []}
                />
              </PageWrapper>,
            ])}

            {/* New-entry spread (always last) */}
            <PageWrapper key="new-L" side="left" colors={colors}>
              <LeftPage
                ref={leftPageRef}
                entry={null}
                isNewEntry={true}
                onPageFull={handleLeftPageFull}
                onNavigateRight={handleNavigateRight}
              />
            </PageWrapper>
            <PageWrapper key="new-R" side="right" colors={colors}>
              <RightPage
                ref={rightPageRef}
                entry={null}
                isNewEntry={true}
                photos={pendingPhotos}
                onPhotoAdd={handlePhotoAdd}
                onPhotoRemove={handlePhotoRemove}
                onNavigateLeft={handleNavigateLeft}
                onBackspaceAcrossSpine={handleBackspaceAcrossSpine}
              />
            </PageWrapper>

          </HTMLFlipBook>
        )}

        {/* Binding spine: theme-specific material strip + accent.
            Rendered as a sibling of HTMLFlipBook so flip animation is untouched. */}
        <SpineOrnaments spine={getSpineDesign(themeName)} />

        {/* Day-tab index rail on the right edge. Lets the user jump directly
            to any day in the visible month without flipping. */}
        <DateTabRail
          entries={entries}
          visibleSpread={globalCurrentSpread}
          newEntrySpreadIdx={entries.length}
          onJumpToSpread={goToSpread}
          colors={colors}
        />

        {/* Left edge clicker */}
        {globalCurrentSpread > 0 && (
          <motion.div
            onClick={handlePrevPage}
            className="absolute left-0 top-0 bottom-0 w-14 cursor-pointer z-30 flex items-center justify-center"
            style={{
              background: 'linear-gradient(90deg, rgba(0,0,0,0.03) 0%, transparent 100%)',
            }}
            whileHover={{
              background: 'linear-gradient(90deg, rgba(0,0,0,0.08) 0%, transparent 100%)',
            }}
          >
            <motion.div
              className="text-3xl"
              style={{ color: theme.text.muted }}
              animate={{ x: [-4, 4, -4], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ‹
            </motion.div>
          </motion.div>
        )}

        {/* Right edge clicker — offset inward to clear the day-tab rail */}
        {globalCurrentSpread < totalSpreads - 1 && (
          <motion.div
            onClick={handleNextPage}
            className="absolute top-0 bottom-0 w-14 cursor-pointer z-30 flex items-center justify-center"
            style={{
              right: '26px',
              background: 'linear-gradient(270deg, rgba(0,0,0,0.03) 0%, transparent 100%)',
            }}
            whileHover={{
              background: 'linear-gradient(270deg, rgba(0,0,0,0.08) 0%, transparent 100%)',
            }}
          >
            <motion.div
              className="text-3xl"
              style={{ color: theme.text.muted }}
              animate={{ x: [4, -4, 4], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ›
            </motion.div>
          </motion.div>
        )}

      </motion.div>
      )}
      </div>

      {/* Right-margin action rail (pull a card + share), in the empty gutter
          beside the centered diary. Portals to body so it sits against the
          viewport, not the scaled book. */}
      {!loading && (
        <DiaryActionRail
          promptColor={colors.prompt}
          onShare={openShare}
          shareBusy={shareBusy}
          anchor={actionAnchor}
        />
      )}
      {ShareCapture}
    </div>
  )
}
