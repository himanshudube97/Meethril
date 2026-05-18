'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { searchItunes, serializeItunesSong, highResArt, type ItunesTrack } from '@/lib/song'
import { isMusicUrl } from '@/components/SongEmbed'

function displayValue(v: string): string {
  if (v && v.startsWith('{')) return ''
  return v
}

interface Props {
  /** Current stored string (URL, iTunes JSON, free text, or empty). */
  value: string
  /** Receives the next stored string, or null when cleared. */
  onChange: (next: string | null) => void
  placeholder?: string
  autoFocus?: boolean
}

const DEBOUNCE_MS = 350

export default function SongPicker({
  value,
  onChange,
  placeholder = 'Search a song or paste a link…',
  autoFocus = false,
}: Props) {
  const { theme } = useThemeStore()
  const [query, setQuery] = useState(displayValue(value))
  const [results, setResults] = useState<ItunesTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Keep input synced if parent resets value externally
  useEffect(() => {
    setQuery(displayValue(value))
  }, [value])

  // Click-outside closes dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Debounced search — URL inputs skip search entirely
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setOpen(false)
      return
    }
    if (isMusicUrl(trimmed) || /^https?:\/\//i.test(trimmed) || trimmed.startsWith('{')) {
      setResults([])
      setOpen(false)
      return
    }
    setOpen(true)
    const ctrl = new AbortController()
    const handle = window.setTimeout(async () => {
      setLoading(true)
      try {
        const tracks = await searchItunes(trimmed, ctrl.signal)
        setResults(tracks)
        setHighlight(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(handle)
    }
  }, [query])

  function pick(track: ItunesTrack) {
    onChange(serializeItunesSong(track))
    setOpen(false)
    setResults([])
    setHighlight(0)
    setQuery('') // parent will display via SongEmbed; clear local input
  }

  function commitRaw() {
    const trimmed = query.trim()
    if (!trimmed) {
      onChange(null)
      return
    }
    // URL or free text — store verbatim (same as today's behavior)
    onChange(trimmed)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRaw()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const track = results[highlight] ?? results[0]
      if (track) pick(track)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          const trimmed = query.trim()
          if (trimmed && !isMusicUrl(trimmed)) setOpen(true)
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{
          background: `${theme.accent.warm}10`,
          color: theme.text.primary,
          border: `1px solid ${theme.glass.border}`,
        }}
      />

      <AnimatePresence>
        {/* `open && (loading || results.length > 0 || query.trim().length > 0)` — third clause keeps
            the "No songs found" message visible after a query returns empty. */}
        {open && (loading || results.length > 0 || query.trim().length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 mt-1 z-50 rounded-lg overflow-hidden"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            {loading && results.length === 0 && (
              <div className="p-3 text-xs" style={{ color: theme.text.muted }}>Searching…</div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <div className="p-3 text-xs" style={{ color: theme.text.muted }}>
                No songs found — paste a link instead
              </div>
            )}
            {results.map((track, i) => (
              <button
                key={track.trackId}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(track) }}
                onMouseEnter={() => setHighlight(i)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                style={{
                  background: highlight === i ? `${theme.accent.warm}20` : 'transparent',
                }}
              >
                <img
                  src={highResArt(track.artworkUrl100, 100)}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" style={{ color: theme.text.primary }}>
                    {track.trackName}
                  </p>
                  <p className="text-xs truncate" style={{ color: theme.text.muted }}>
                    {track.artistName}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
