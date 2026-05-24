'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import type { Theme } from '@/lib/themes'
import { parseStoredSong, highResArt, appleMusicLink } from '@/lib/song'
import { useActiveSong } from '@/store/activeSong'

interface SongEmbedProps {
  url: string
  compact?: boolean
  audioOnly?: boolean // New prop to show custom UI instead of video
}

type EmbedType = 'youtube' | 'spotify' | 'soundcloud' | 'apple' | 'instagram' | 'unknown'

interface EmbedInfo {
  type: EmbedType
  embedUrl: string | null
  audioEmbedUrl?: string | null
  title?: string
}

function parseUrl(url: string): EmbedInfo {
  const trimmedUrl = url.trim()

  // YouTube - various formats
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  // https://music.youtube.com/watch?v=VIDEO_ID
  const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
  const youtubeMatch = trimmedUrl.match(youtubeRegex)
  if (youtubeMatch) {
    const videoId = youtubeMatch[1]
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
      // For audio-only mode, we use the same embed but hide it
      audioEmbedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`,
    }
  }

  // Spotify - tracks, albums, playlists, episodes
  // https://open.spotify.com/track/TRACK_ID
  // https://open.spotify.com/album/ALBUM_ID
  // https://open.spotify.com/playlist/PLAYLIST_ID
  const spotifyRegex = /open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/
  const spotifyMatch = trimmedUrl.match(spotifyRegex)
  if (spotifyMatch) {
    return {
      type: 'spotify',
      embedUrl: `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?utm_source=generator&theme=0`,
    }
  }

  // SoundCloud - basic detection (embeds require oEmbed API, so we'll just link)
  if (trimmedUrl.includes('soundcloud.com')) {
    return {
      type: 'soundcloud',
      embedUrl: null,
    }
  }

  // Instagram Reels/Posts - link only (no embed to keep app clean)
  // https://www.instagram.com/reel/ABC123/
  // https://www.instagram.com/p/ABC123/
  if (trimmedUrl.includes('instagram.com/reel/') || trimmedUrl.includes('instagram.com/p/')) {
    return {
      type: 'instagram',
      embedUrl: null,
    }
  }

  // Apple Music
  // https://music.apple.com/us/album/song-name/ALBUM_ID?i=TRACK_ID
  const appleMusicRegex = /music\.apple\.com\/([a-z]{2})\/(album|playlist)\/([^\/]+)\/([a-zA-Z0-9\.]+)/
  const appleMatch = trimmedUrl.match(appleMusicRegex)
  if (appleMatch) {
    return {
      type: 'apple',
      embedUrl: `https://embed.music.apple.com/${appleMatch[1]}/${appleMatch[2]}/${appleMatch[4]}`,
    }
  }

  // Check if it's a URL at all
  const isUrl = /^https?:\/\//i.test(trimmedUrl)

  return {
    type: 'unknown',
    embedUrl: null,
    title: isUrl ? trimmedUrl : undefined,
  }
}

// Audio visualizer bars animation
function AudioVisualizer({ isPlaying, color, size = 'md' }: { isPlaying: boolean; color: string; size?: 'sm' | 'md' }) {
  const bars = size === 'sm' ? [1, 2, 3] : [1, 2, 3, 4, 5]
  const height = size === 'sm' ? 'h-4' : 'h-8'
  const maxHeight = size === 'sm' ? '16px' : '32px'

  return (
    <div className={`flex items-end gap-[2px] ${height}`}>
      {bars.map((bar) => (
        <motion.div
          key={bar}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: color }}
          animate={isPlaying ? {
            height: ['4px', maxHeight, '8px', `${parseInt(maxHeight) * 0.7}px`, '6px', `${parseInt(maxHeight) * 0.8}px`, '4px'],
          } : { height: '4px' }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: bar * 0.1,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// Floating music notes for the player area (subtle)
function FloatingNotes({ color }: { color: string }) {
  const notes = ['♪', '♫', '♬', '♩']

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(4)].map((_, i) => (
        <motion.span
          key={i}
          className="absolute text-lg opacity-20"
          style={{ color }}
          initial={{
            x: 20 + Math.random() * 60,
            y: 80,
            opacity: 0,
            scale: 0.5,
          }}
          animate={{
            y: -20,
            opacity: [0, 0.3, 0.2, 0],
            scale: [0.5, 1, 0.8],
            x: 20 + Math.random() * 80,
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: i * 1,
            ease: 'easeOut',
          }}
        >
          {notes[i % notes.length]}
        </motion.span>
      ))}
    </div>
  )
}


// Spinning vinyl record
function VinylRecord({ isPlaying, color, size = 'md' }: { isPlaying: boolean; color: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-10 h-10' : 'w-16 h-16'
  const grooveInset = size === 'sm' ? 'inset-1.5' : 'inset-2'
  const labelSize = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6'
  const holeSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'

  return (
    <motion.div
      className={`relative ${sizeClass} rounded-full flex items-center justify-center flex-shrink-0`}
      style={{
        background: `linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)`,
        boxShadow: `0 0 20px ${color}40`,
      }}
      animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
      transition={isPlaying ? {
        duration: 3,
        repeat: Infinity,
        ease: 'linear',
      } : { duration: 0.5 }}
    >
      {/* Vinyl grooves */}
      <div
        className={`absolute ${grooveInset} rounded-full opacity-30`}
        style={{
          background: `repeating-radial-gradient(circle at center, transparent 0px, transparent 2px, ${color}20 3px, transparent 4px)`
        }}
      />
      {/* Center label */}
      <div
        className={`${labelSize} rounded-full`}
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}80 100%)`,
        }}
      />
      {/* Center hole */}
      <div className={`absolute ${holeSize} rounded-full bg-black/80`} />
    </motion.div>
  )
}

// Music notes that drift up from the bottom of the player whenever a track
// is loaded — running regardless of play state so the player never feels
// dead. Positions are hard-coded so they don't reshuffle on re-render.
// Color pulls from theme.accent.warm to fit every palette.
// Notes are spread across the full width and vary in size/speed for an
// organic, breeze-like feel; the small text-shadow gives a soft glow.
const FLOATING_NOTES = [
  { char: '♪', leftPct:  8, drift: -10, scale: 1.0,  delay: 0.0, duration: 3.6 },
  { char: '♫', leftPct: 20, drift:   8, scale: 0.85, delay: 0.6, duration: 4.1 },
  { char: '♩', leftPct: 34, drift:  12, scale: 0.95, delay: 1.2, duration: 3.4 },
  { char: '♬', leftPct: 48, drift:  -8, scale: 1.0,  delay: 1.8, duration: 4.3 },
  { char: '♪', leftPct: 60, drift:  10, scale: 0.8,  delay: 2.4, duration: 3.7 },
  { char: '♫', leftPct: 74, drift: -14, scale: 0.9,  delay: 3.0, duration: 4.0 },
  { char: '♩', leftPct: 88, drift:   6, scale: 0.75, delay: 3.6, duration: 3.5 },
  { char: '♬', leftPct: 28, drift:  -6, scale: 0.7,  delay: 4.2, duration: 3.8 },
  { char: '♪', leftPct: 66, drift:  14, scale: 0.85, delay: 4.8, duration: 3.6 },
]

function FloatingMusicNotes({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {FLOATING_NOTES.map((n, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{
            color,
            left: `${n.leftPct}%`,
            bottom: '18%',
            fontSize: `${13 * n.scale}px`,
            textShadow: `0 0 6px ${color}80`,
            lineHeight: 1,
          }}
          initial={{ opacity: 0, y: 0, x: 0, rotate: 0 }}
          animate={{
            y: [0, -60],
            x: [0, n.drift],
            opacity: [0, 0.85, 0.85, 0],
            rotate: [0, n.drift > 0 ? 12 : -12],
          }}
          transition={{
            duration: n.duration,
            times: [0, 0.18, 0.7, 1],
            repeat: Infinity,
            delay: n.delay,
            ease: 'easeOut',
          }}
        >
          {n.char}
        </motion.span>
      ))}
    </div>
  )
}

// Soft radial glow that breathes behind the album art — gives the player
// a "warm and alive" feel even before the user hits play.
function PulsingGlow({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{
        background: `radial-gradient(circle at 22% 50%, ${color}33 0%, transparent 55%)`,
      }}
      animate={{ opacity: [0.45, 0.85, 0.45] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// Faint highlight streak that slowly sweeps across the player — adds
// motion to the otherwise static background without being distracting.
function LightSweep({ color }: { color: string }) {
  return (
    <motion.div
      className="absolute top-0 bottom-0 pointer-events-none"
      aria-hidden
      style={{
        width: '35%',
        background: `linear-gradient(90deg, transparent 0%, ${color}22 50%, transparent 100%)`,
        filter: 'blur(2px)',
      }}
      animate={{ left: ['-35%', '135%'] }}
      transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.8 }}
    />
  )
}

// Dancing equalizer bars. Heights are choreographed (not audio-reactive)
// but the staggered durations give the impression of an actual beat.
const EQ_BARS = [
  { base: 0.6, dur: 1.05 },
  { base: 1.0, dur: 1.25 },
  { base: 0.8, dur: 0.9  },
  { base: 1.1, dur: 1.35 },
  { base: 0.7, dur: 1.1  },
]

function Equalizer({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-0.75 shrink-0 h-6" aria-hidden>
      {EQ_BARS.map((b, i) => (
        <motion.span
          key={i}
          className="block rounded-full"
          style={{
            width: 2,
            background: color,
            opacity: 0.7,
            transformOrigin: 'bottom',
          }}
          animate={{
            height: [`${6 * b.base}px`, `${20 * b.base}px`, `${9 * b.base}px`, `${22 * b.base}px`, `${6 * b.base}px`],
          }}
          transition={{
            duration: b.dur,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.12,
          }}
        />
      ))}
    </div>
  )
}

function ItunesPlayer({
  id,
  title,
  artist,
  art,
  preview,
  theme,
  compact,
}: {
  id: string
  title: string
  artist: string
  art: string
  preview: string
  theme: Theme
  compact: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const instanceId = useId()
  const { activeId, play, stop } = useActiveSong()
  const isPlaying = activeId === instanceId
  const [progress, setProgress] = useState(0) // 0..1
  const [errored, setErrored] = useState(false)

  // Pause when another SongEmbed becomes active
  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
    }
  }, [isPlaying])

  // Pause on unmount. Read the current activeId at cleanup time via getState()
  // rather than the (stale) closure value — instanceId and stop are stable.
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      if (useActiveSong.getState().activeId === instanceId) stop()
    }
  }, [instanceId, stop])

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (errored) return
    if (isPlaying) {
      audioRef.current?.pause()
      stop()
    } else {
      play(instanceId)
      audioRef.current?.play().catch((err) => {
        if (err?.name !== 'AbortError') setErrored(true)
      })
    }
  }

  const onTimeUpdate = () => {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress(a.currentTime / a.duration)
  }

  const onEnded = () => {
    setProgress(0)
    if (activeId === instanceId) stop()
  }

  const artUrl = highResArt(art, compact ? 200 : 300)
  const size = compact ? 'w-12 h-12' : 'w-16 h-16'
  const padding = compact ? 'p-3' : 'p-4'

  return (
    <motion.div
      className={`rounded-2xl overflow-hidden relative flex items-center ${padding}`}
      onClick={handlePlay}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        background: `linear-gradient(135deg, ${theme.glass.bg} 0%, ${theme.accent.warm}10 100%)`,
        border: `1px solid ${isPlaying ? theme.accent.warm + '40' : theme.glass.border}`,
        backdropFilter: 'blur(20px)',
        cursor: 'pointer',
      }}
      whileHover={!isPlaying ? { scale: 1.01 } : {}}
      whileTap={{ scale: 0.99 }}
    >
      <audio
        ref={audioRef}
        src={preview}
        preload="none"
        onTimeUpdate={onTimeUpdate}
        onPause={() => {
          if (useActiveSong.getState().activeId === instanceId) stop()
        }}
        onEnded={onEnded}
        onError={() => setErrored(true)}
      />

      <PulsingGlow color={theme.accent.warm} />
      <LightSweep color={theme.accent.warm} />
      <FloatingMusicNotes color={theme.accent.warm} />

      <div className="flex items-center gap-3 w-full relative z-10">
        {/* Album art as vinyl center */}
        <motion.div
          className={`relative ${size} rounded-full shrink-0 overflow-hidden`}
          style={{
            background: '#1a1a1a',
            boxShadow: `0 0 20px ${theme.accent.warm}40`,
          }}
          animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
          transition={isPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : { duration: 0.5 }}
        >
          {artUrl ? (
            <img src={artUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white text-lg">♫</div>
          )}
          {/* Center hole */}
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-black/80 -translate-x-1/2 -translate-y-1/2" />
        </motion.div>

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: theme.text.primary }}>
            {title || 'Untitled'}
          </p>
          {!compact && (
            <p className="text-xs truncate" style={{ color: theme.text.muted }}>
              {artist}
            </p>
          )}
          {!compact && !errored && (
            <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: `${theme.text.muted}25` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: theme.accent.warm }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          )}
          {errored && (
            <a
              href={appleMusicLink(id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs underline"
              style={{ color: theme.accent.warm }}
            >
              Open in Apple Music
            </a>
          )}
        </div>

        {/* Dancing equalizer bars — sits just before the play button. */}
        {!errored && <Equalizer color={theme.accent.warm} />}

        {/* Play/pause button */}
        {!errored && (
          <motion.div
            className={`shrink-0 ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center`}
            style={{
              background: isPlaying
                ? `${theme.accent.warm}30`
                : `linear-gradient(135deg, ${theme.accent.warm} 0%, ${theme.accent.secondary} 100%)`,
              color: isPlaying ? theme.accent.warm : '#fff',
              boxShadow: isPlaying ? 'none' : `0 4px 15px ${theme.accent.warm}40`,
            }}
            whileHover={{ scale: 1.1 }}
          >
            <span className={compact ? 'text-sm' : 'text-base'}>
              {isPlaying ? '■' : '▶'}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// Get autoplay URL for different platforms
function getAutoplayUrl(embedUrl: string, type: EmbedType): string {
  switch (type) {
    case 'youtube':
      // YouTube: add autoplay=1
      return embedUrl.includes('?')
        ? `${embedUrl}&autoplay=1`
        : `${embedUrl}?autoplay=1`
    case 'spotify':
      // Spotify: already autoplays on user interaction
      return embedUrl
    case 'apple':
      // Apple Music: similar behavior
      return embedUrl
    default:
      return embedUrl
  }
}

// Custom audio player UI
function AudioOnlyPlayer({
  embedUrl,
  originalUrl,
  type,
  theme,
  compact
}: {
  embedUrl: string
  originalUrl: string
  type: EmbedType
  theme: Theme
  compact: boolean
}) {
  const [isPlaying, setIsPlaying] = useState(false)

  const platformName = {
    youtube: 'YouTube',
    spotify: 'Spotify',
    apple: 'Apple Music',
    soundcloud: 'SoundCloud',
    instagram: 'Instagram',
    unknown: 'Music',
  }[type]

  const platformIcon = {
    youtube: '▶',
    spotify: '●',
    apple: '♪',
    soundcloud: '☁',
    instagram: '📷',
    unknown: '♫',
  }[type]

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsPlaying(true)
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsPlaying(false)
  }


  return (
    <>
      <motion.div
      className="rounded-2xl overflow-hidden relative flex items-center"
      onClick={(e) => { e.stopPropagation(); if (!isPlaying) handlePlay(e); }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        height: compact ? '64px' : '96px',
        background: isPlaying
          ? `linear-gradient(135deg, ${theme.glass.bg} 0%, ${theme.accent.warm}12 50%, ${theme.accent.secondary}08 100%)`
          : `linear-gradient(135deg, ${theme.glass.bg} 0%, ${theme.accent.warm}10 100%)`,
        border: `1px solid ${isPlaying ? theme.accent.warm + '40' : theme.glass.border}`,
        backdropFilter: 'blur(20px)',
        cursor: isPlaying ? 'default' : 'pointer',
      }}
      whileHover={!isPlaying ? { scale: 1.01 } : {}}
      whileTap={!isPlaying ? { scale: 0.99 } : {}}
    >
      {/* Hidden iframe for audio - only when playing */}
      {isPlaying && (
        <iframe
          src={getAutoplayUrl(embedUrl, type)}
          width="1"
          height="1"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      <AnimatePresence mode="wait">
        {isPlaying ? (
          // Wide playing state
          <motion.div
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={compact ? 'px-3 py-0 w-full' : 'p-4 w-full'}
          >
            {/* Floating notes background */}
            <FloatingNotes color={theme.accent.warm} />

            <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'} relative z-10`}>
              {/* Vinyl */}
              {compact ? (
                <VinylRecord isPlaying={true} color={theme.accent.warm} size="sm" />
              ) : (
                <VinylRecord isPlaying={true} color={theme.accent.warm} />
              )}

              {/* Center content */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {/* Visualizer */}
                <div className={`flex items-center ${compact ? 'gap-3' : 'gap-6'} ${compact ? 'mb-0' : 'mb-2'}`}>
                  <AudioVisualizer isPlaying={true} color={theme.accent.secondary} size={compact ? 'sm' : 'md'} />
                  <motion.span
                    className={`${compact ? 'text-xs' : 'text-sm'} font-medium`}
                    style={{ color: theme.text.primary }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    ♫ Now Playing
                  </motion.span>
                  <AudioVisualizer isPlaying={true} color={theme.accent.warm} size={compact ? 'sm' : 'md'} />
                </div>
                {!compact && (
                  <span
                    className="text-xs"
                    style={{ color: theme.text.muted }}
                  >
                    via {platformName}
                  </span>
                )}
              </div>

              {/* Stop button */}
              <motion.button
                onClick={handleClose}
                className={`${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center flex-shrink-0`}
                style={{
                  background: `${theme.text.muted}15`,
                  color: theme.text.muted,
                }}
                whileHover={{
                  background: `${theme.accent.warm}25`,
                  color: theme.accent.warm,
                  scale: 1.1,
                }}
                whileTap={{ scale: 0.9 }}
              >
                <span className="text-sm">■</span>
              </motion.button>

              {/* Open original link icon */}
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-100 opacity-50`}
                style={{
                  background: `${theme.text.muted}15`,
                  color: theme.text.muted,
                }}
                title={`Open in ${platformName}`}
              >
                <span className="text-xs">↗</span>
              </a>
            </div>

            {/* Animated border glow */}
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none"
              style={{
                boxShadow: `inset 0 0 30px ${theme.accent.warm}15`,
              }}
              animate={{
                boxShadow: [
                  `inset 0 0 30px ${theme.accent.warm}10`,
                  `inset 0 0 50px ${theme.accent.warm}20`,
                  `inset 0 0 30px ${theme.accent.warm}10`,
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        ) : (
          // Idle state - click to play
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`flex items-center gap-4 w-full ${compact ? 'p-3' : 'p-4'}`}
          >
            {/* Vinyl/Visualizer */}
            <div className="flex-shrink-0">
              {compact ? (
                <AudioVisualizer isPlaying={false} color={theme.accent.warm} />
              ) : (
                <VinylRecord isPlaying={false} color={theme.accent.warm} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: `${theme.accent.warm}20`,
                    color: theme.accent.warm,
                  }}
                >
                  {platformIcon} {platformName}
                </span>
              </div>
              <p className="text-sm font-medium" style={{ color: theme.text.primary }}>
                Play Music
              </p>
            </div>

            {/* Play button */}
            <motion.div
              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${theme.accent.warm} 0%, ${theme.accent.secondary} 100%)`,
                boxShadow: `0 4px 15px ${theme.accent.warm}40`,
              }}
              whileHover={{ scale: 1.1 }}
            >
              <span className="text-white text-lg ml-0.5">▶</span>
            </motion.div>

            {/* Open original link icon */}
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-100 opacity-50"
              style={{
                background: `${theme.text.muted}15`,
                color: theme.text.muted,
              }}
              title={`Open in ${platformName}`}
            >
              <span className="text-xs">↗</span>
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </>
  )
}

export default function SongEmbed({ url, compact = false, audioOnly = true }: SongEmbedProps) {
  const { theme } = useThemeStore()

  const embedInfo = useMemo(() => parseUrl(url), [url])

  const stored = parseStoredSong(url)
  if (stored.kind === 'itunes') {
    return (
      <ItunesPlayer
        id={stored.id}
        title={stored.title}
        artist={stored.artist}
        art={stored.art}
        preview={stored.preview}
        theme={theme}
        compact={compact}
      />
    )
  }

  // For non-URL text (just song names), show simple text
  if (embedInfo.type === 'unknown' && !embedInfo.title) {
    return (
      <div
        className="flex items-center gap-2 p-3 rounded-xl"
        style={{ background: `${theme.accent.warm}15` }}
      >
        <span style={{ color: theme.accent.warm }}>♫</span>
        <span className="text-sm" style={{ color: theme.text.primary }}>
          {url}
        </span>
      </div>
    )
  }

  // For URLs without embed support, show as clickable link
  if (!embedInfo.embedUrl) {
    const linkIcon: Record<EmbedType, string> = {
      youtube: '▶',
      spotify: '♫',
      apple: '♫',
      soundcloud: '☁',
      instagram: '📷',
      unknown: '♫',
    }
    const icon = linkIcon[embedInfo.type] || '♫'

    const linkLabel: Record<EmbedType, string> = {
      youtube: 'YouTube',
      spotify: 'Spotify',
      apple: 'Apple Music',
      soundcloud: 'SoundCloud',
      instagram: 'Instagram Reel',
      unknown: 'Link',
    }
    const label = linkLabel[embedInfo.type] || 'Link'

    return (
      <motion.a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 rounded-xl hover:opacity-80 transition-opacity"
        style={{ background: `${theme.accent.warm}15` }}
        whileHover={{ scale: 1.01 }}
      >
        <span style={{ color: theme.accent.warm }}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs" style={{ color: theme.text.muted }}>{label}</p>
          <p className="text-sm truncate" style={{ color: theme.text.primary }}>
            {url.replace(/https?:\/\/(www\.)?/, '').slice(0, 40)}...
          </p>
        </div>
        <span className="text-sm" style={{ color: theme.accent.warm }}>↗</span>
      </motion.a>
    )
  }

  // YouTube embed - use custom audio player if audioOnly mode
  if (embedInfo.type === 'youtube') {
    if (audioOnly && embedInfo.embedUrl) {
      return (
        <AudioOnlyPlayer
          embedUrl={embedInfo.embedUrl}
          originalUrl={url}
          type="youtube"
          theme={theme}
          compact={compact}
        />
      )
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <iframe
          src={embedInfo.embedUrl}
          width="100%"
          height={compact ? '80' : '152'}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="rounded-xl"
          style={{ display: 'block' }}
        />
      </motion.div>
    )
  }

  // Spotify embed - use custom audio player if audioOnly mode
  if (embedInfo.type === 'spotify') {
    if (audioOnly && embedInfo.embedUrl) {
      return (
        <AudioOnlyPlayer
          embedUrl={embedInfo.embedUrl}
          originalUrl={url}
          type="spotify"
          theme={theme}
          compact={compact}
        />
      )
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <iframe
          src={embedInfo.embedUrl}
          width="100%"
          height={compact ? '80' : '152'}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-xl"
          style={{ display: 'block' }}
        />
      </motion.div>
    )
  }

  // Apple Music embed - use custom audio player if audioOnly mode
  if (embedInfo.type === 'apple') {
    if (audioOnly && embedInfo.embedUrl) {
      return (
        <AudioOnlyPlayer
          embedUrl={embedInfo.embedUrl}
          originalUrl={url}
          type="apple"
          theme={theme}
          compact={compact}
        />
      )
    }
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl overflow-hidden"
        style={{
          background: theme.glass.bg,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        <iframe
          src={embedInfo.embedUrl}
          width="100%"
          height={compact ? '80' : '150'}
          frameBorder="0"
          allow="autoplay; encrypted-media"
          sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
          className="rounded-xl"
          style={{ display: 'block' }}
        />
      </motion.div>
    )
  }


  // Fallback
  return (
    <div
      className="flex items-center gap-2 p-3 rounded-xl"
      style={{ background: `${theme.accent.warm}15` }}
    >
      <span style={{ color: theme.accent.warm }}>♫</span>
      <span className="text-sm" style={{ color: theme.text.primary }}>
        {url}
      </span>
    </div>
  )
}

// Helper to check if a string looks like a music/media URL
export function isMusicUrl(text: string): boolean {
  const musicPatterns = [
    /youtube\.com/i,
    /youtu\.be/i,
    /music\.youtube\.com/i,
    /spotify\.com/i,
    /soundcloud\.com/i,
    /music\.apple\.com/i,
    /instagram\.com\/reel\//i,
    /instagram\.com\/p\//i,
  ]
  return musicPatterns.some(pattern => pattern.test(text))
}
