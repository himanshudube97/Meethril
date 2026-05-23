'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { useThemeStore } from '@/store/theme'
import { StrokeData } from '@/store/journal'
import { useEntry } from '@/hooks/useEntries'
import DoodlePreview from './DoodlePreview'
import DoodleCanvas from './DoodleCanvas'
import CollagePhoto from './CollagePhoto'
import SongEmbed, { isMusicUrl } from './SongEmbed'
import { sanitizeLetterClient } from '@/lib/sanitize-letter-client'

interface EntryDetailModalProps {
  entryId: string | null
  onClose: () => void
  onUpdated: () => void
}

interface EntryPhoto {
  id?: string
  url: string
  rotation: number
  position: number
  spread: number
}

export default function EntryDetailModal({ entryId, onClose, onUpdated }: EntryDetailModalProps) {
  const { theme } = useThemeStore()
  const { entry, loading } = useEntry(entryId)

  // Append-only state
  const [appendText, setAppendText] = useState('')
  const [newSong, setNewSong] = useState('')
  const [newDoodleStrokes, setNewDoodleStrokes] = useState<StrokeData[]>([])
  const [showDoodleCanvas, setShowDoodleCanvas] = useState(false)
  const [photoTopRight, setPhotoTopRight] = useState<string | null>(null)
  const [photoBottomLeft, setPhotoBottomLeft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const lineHeight = 40

  const resetAppendState = useCallback(() => {
    setAppendText('')
    setNewSong('')
    setNewDoodleStrokes([])
    setPhotoTopRight(null)
    setPhotoBottomLeft(null)
  }, [])

  const handleClose = useCallback(() => {
    resetAppendState()
    onClose()
  }, [onClose, resetAppendState])

  // Lock background scroll and hide nav when modal is open
  useEffect(() => {
    if (entryId) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      const nav = document.querySelector('nav')
      if (nav) (nav as HTMLElement).style.display = 'none'
      return () => {
        document.documentElement.style.overflow = ''
        document.body.style.overflow = ''
        if (nav) (nav as HTMLElement).style.display = ''
      }
    }
  }, [entryId])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose()
  }, [handleClose])

  const handleDoodleSave = useCallback((strokes: StrokeData[]) => {
    setNewDoodleStrokes(strokes)
    setShowDoodleCanvas(false)
  }, [])

  const hasNewContent = appendText.trim() ||
    (newSong.trim() && newSong.trim() !== '') ||
    newDoodleStrokes.length > 0 ||
    photoTopRight ||
    photoBottomLeft

  const handleSave = async () => {
    if (!entry || !hasNewContent) return

    setSaving(true)
    try {
      const body: Record<string, unknown> = {}

      if (appendText.trim()) {
        body.appendText = appendText.trim()
      }

      if (newSong.trim() && !entry.song) {
        body.song = newSong.trim()
      }

      if (newDoodleStrokes.length > 0) {
        body.newDoodles = [{ strokes: newDoodleStrokes, positionInEntry: 0, spread: 1 }]
      }

      const newPhotos = []
      if (photoTopRight) {
        newPhotos.push({ url: photoTopRight, position: 1, spread: 1, rotation: 7 })
      }
      if (photoBottomLeft) {
        newPhotos.push({ url: photoBottomLeft, position: 2, spread: 1, rotation: -7 })
      }
      if (newPhotos.length > 0) {
        body.newPhotos = newPhotos
      }

      const res = await fetch(`/api/entries/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        resetAppendState()
        onUpdated()
        onClose()
      } else {
        const data = await res.json()
        console.error('Save failed:', data)
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  const entryPhotos: EntryPhoto[] = entry?.photos as EntryPhoto[] || []
  const hasDoodles = entry?.doodles && entry.doodles.length > 0
  const hasSong = !!entry?.song

  // Get existing DB photos for polaroid positions
  const existingPhotoTopRight = entryPhotos.find(p => p.position === 1) || (entryPhotos.length > 0 ? entryPhotos[0] : null)
  const existingPhotoBottomLeft = entryPhotos.find(p => p.position === 2) || (entryPhotos.length > 1 ? entryPhotos[1] : null)

  return (
    <AnimatePresence>
      {entryId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-999 flex items-center justify-center overflow-hidden"
          style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(12px)' }}
          onClick={handleBackdropClick}
        >
          {/* Scrollable container with side padding for photos to overflow into */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[900px] w-full max-h-[95vh] overflow-hidden px-[130px] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >

            {/* Loading state */}
            {loading && (
              <div
                className="rounded-2xl p-20 text-center"
                style={{
                  background: theme.glass.bg,
                  backdropFilter: `blur(${theme.glass.blur})`,
                  border: `1px solid ${theme.glass.border}`,
                }}
              >
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  style={{
                    color: theme.text.muted,
                    fontFamily: 'var(--font-caveat), cursive',
                    fontSize: '20px',
                  }}
                >
                  Opening your journal page...
                </motion.div>
              </div>
            )}

            {entry && !loading && (
              <>
                {/* ===== NOTEBOOK + PHOTOS — exact Write page layout ===== */}
                {/* Relative wrapper with overflow:visible so photos can stick out */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="relative flex flex-col flex-1 min-h-0"
                  style={{ overflow: 'visible' }}
                >
                  {/* THE NOTEBOOK — exact copy of Editor.tsx container */}
                  <div
                    className="rounded-2xl overflow-y-auto overflow-x-hidden relative flex-1 min-h-0"
                    style={{
                      background: theme.bg.primary,
                      border: `1px solid ${theme.glass.border}`,
                      boxShadow: `
                        0 4px 24px -4px rgba(0, 0, 0, 0.3),
                        inset 2px 0 8px -4px rgba(0, 0, 0, 0.2)
                      `,
                    }}
                  >
                    {/* Date header — top-right, exactly like Editor.tsx */}
                    <div
                      className="text-right pt-3 pr-6"
                      style={{
                        fontFamily: 'var(--font-caveat), cursive',
                        fontSize: '16px',
                        color: theme.text.muted,
                        letterSpacing: '0.5px',
                      }}
                    >
                      {format(new Date(entry.createdAt), 'EEEE, MMMM d, yyyy')}
                    </div>

                    {/* Notebook spine/binding effect — exact copy */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-3"
                      style={{
                        background: `linear-gradient(to right,
                          ${theme.accent.warm}15 0%,
                          ${theme.accent.warm}08 50%,
                          transparent 100%
                        )`,
                        borderRight: `1px solid ${theme.accent.warm}20`,
                      }}
                    />

                    {/* Left margin line — exact copy */}
                    <div
                      className="absolute top-0 bottom-0 w-px"
                      style={{
                        left: '48px',
                        background: `${theme.accent.warm}40`,
                        zIndex: 1,
                      }}
                    />

                    {/* Main content area */}
                    <div className="relative">
                      {/* Ruled lines background — exact copy */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          left: '48px',
                          backgroundImage: `repeating-linear-gradient(
                            to bottom,
                            transparent 0px,
                            transparent ${lineHeight - 1}px,
                            ${theme.text.muted}15 ${lineHeight - 1}px,
                            ${theme.text.muted}15 ${lineHeight}px
                          )`,
                          backgroundPosition: '0 24px',
                        }}
                      />

                      {/* Editor wrapper with padding for margin — exact same as Editor.tsx */}
                      <div
                        className="relative"
                        style={{
                          minHeight: '40vh',
                          paddingLeft: '56px',
                          paddingRight: '24px',
                          paddingTop: '24px',
                          paddingBottom: '24px',
                        }}
                      >
                        {/* Entry text — read-only, matches EditorContent styling */}
                        <div
                          className="entry-text-readonly"
                          style={{
                            fontFamily: 'var(--font-caveat), cursive',
                            fontSize: '20px',
                            lineHeight: 2,
                            color: theme.text.primary,
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizeLetterClient(entry.text) }}
                        />

                        {/* Doodles inline */}
                        {hasDoodles && (
                          <div className="mt-4">
                            {entry.doodles.map((doodle) => (
                              <DoodlePreview key={doodle.id} strokes={doodle.strokes} size={150} />
                            ))}
                          </div>
                        )}

                        {/* New doodle preview */}
                        {newDoodleStrokes.length > 0 && (
                          <div className="mt-4">
                            <DoodlePreview strokes={newDoodleStrokes} size={150} />
                          </div>
                        )}

                        {/* Append text area — continues the page seamlessly */}
                        <textarea
                          value={appendText}
                          onChange={(e) => setAppendText(e.target.value)}
                          placeholder="Add more thoughts..."
                          className="w-full bg-transparent outline-none resize-none mt-2"
                          style={{
                            fontFamily: 'var(--font-caveat), cursive',
                            fontSize: '20px',
                            lineHeight: 2,
                            color: theme.text.primary,
                            minHeight: '80px',
                            caretColor: theme.accent.warm,
                          }}
                        />
                      </div>
                    </div>

                    {/* Paper texture overlay — exact copy */}
                    <div
                      className="absolute inset-0 pointer-events-none opacity-[0.02]"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                      }}
                    />

                    {/* ProseMirror-matching styles for read-only text */}
                    <style jsx global>{`
                      .entry-text-readonly p {
                        margin: 0;
                        padding: 0;
                        line-height: 40px;
                        min-height: 40px;
                      }
                      .entry-text-readonly h1 {
                        font-size: 1.5em;
                        font-weight: 600;
                        color: ${theme.text.primary};
                        line-height: 2;
                      }
                      .entry-text-readonly h2 {
                        font-size: 1.25em;
                        font-weight: 600;
                        color: ${theme.text.primary};
                        line-height: 2;
                      }
                      .entry-text-readonly blockquote {
                        border-left: 3px solid ${theme.accent.primary};
                        padding-left: 1em;
                        margin-left: 0;
                        color: ${theme.text.secondary};
                        font-style: italic;
                      }
                      .entry-text-readonly strong {
                        color: ${theme.accent.warm};
                      }
                      .entry-text-readonly em {
                        color: ${theme.text.secondary};
                      }
                    `}</style>
                  </div>

                  {/* ===== COLLAGE PHOTOS — exact same as Write page ===== */}
                  <CollagePhoto
                    position="top-right"
                    photo={existingPhotoTopRight?.url || photoTopRight}
                    onPhotoChange={existingPhotoTopRight ? () => {} : setPhotoTopRight}
                  />
                  <CollagePhoto
                    position="bottom-left"
                    photo={existingPhotoBottomLeft?.url || photoBottomLeft}
                    onPhotoChange={existingPhotoBottomLeft ? () => {} : setPhotoBottomLeft}
                  />
                </motion.div>

                {/* ===== ACTION BUTTONS — below notebook, exact Write page layout ===== */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2">
                    {/* Doodle button / preview — same as Write page */}
                    {hasDoodles ? (
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden"
                        style={{ border: `2px solid ${theme.accent.warm}` }}
                      >
                        <DoodlePreview strokes={entry.doodles[0].strokes} size={40} />
                      </div>
                    ) : newDoodleStrokes.length > 0 ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-10 h-10 rounded-full overflow-hidden cursor-pointer"
                        style={{ border: `2px solid ${theme.accent.warm}` }}
                        onClick={() => setShowDoodleCanvas(true)}
                      >
                        <DoodlePreview strokes={newDoodleStrokes} size={40} />
                      </motion.div>
                    ) : (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        onClick={() => setShowDoodleCanvas(true)}
                        className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{
                          background: theme.glass.bg,
                          border: `1px solid ${theme.glass.border}`,
                          color: theme.text.muted,
                        }}
                        title="Add doodle"
                      >
                        ✎
                      </motion.button>
                    )}

                    {/* Song button — same as Write page */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        background: theme.glass.bg,
                        border: `1px solid ${theme.glass.border}`,
                        color: hasSong || newSong ? theme.accent.warm : theme.text.muted,
                      }}
                      title={hasSong ? 'Song attached' : 'Add song'}
                    >
                      ♫
                    </motion.button>
                  </div>

                  {/* Song input — same as Write page, only if no existing song */}
                  {!hasSong ? (
                    <input
                      type="text"
                      placeholder="paste a song link or song name..."
                      value={newSong}
                      onChange={(e) => setNewSong(e.target.value)}
                      className="flex-1 mx-4 px-4 py-2 rounded-full text-sm bg-transparent outline-none"
                      style={{
                        border: `1px solid ${theme.glass.border}`,
                        color: theme.text.primary,
                      }}
                    />
                  ) : (
                    <div className="flex-1 mx-4" />
                  )}

                  {/* Save button — same as Write page, only when new content */}
                  <AnimatePresence>
                    {hasNewContent && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 rounded-full text-sm font-medium"
                        style={{
                          background: theme.accent.primary,
                          color: theme.bg.primary,
                          opacity: saving ? 0.5 : 1,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Song embed — below action buttons, same as Write page */}
                {hasSong && entry.song && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                    className="mt-4"
                  >
                    <SongEmbed url={entry.song} compact />
                  </motion.div>
                )}

                {/* New song embed preview */}
                {!hasSong && newSong && isMusicUrl(newSong) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
                    className="mt-4"
                  >
                    <SongEmbed url={newSong} compact />
                  </motion.div>
                )}
              </>
            )}
          </motion.div>

          {/* Doodle Canvas Modal */}
          <AnimatePresence>
            {showDoodleCanvas && (
              <DoodleCanvas
                onSave={handleDoodleSave}
                onClose={() => setShowDoodleCanvas(false)}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
