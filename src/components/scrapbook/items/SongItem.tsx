'use client'

import React, { useEffect, useRef, useState } from 'react'
import { SongItemData, deriveSongMeta, getSongEmbedUrl } from '@/lib/scrapbook'
import SongPicker from '@/components/SongPicker'
import SongEmbed from '@/components/SongEmbed'

interface Props {
  item: SongItemData
  isEditing: boolean
  onChange: (next: SongItemData) => void
}

const providerLabel: Record<SongItemData['provider'], string> = {
  spotify: 'spotify',
  youtube: 'youtube',
  apple: 'apple music',
  soundcloud: 'soundcloud',
  itunes: 'itunes',
  unknown: 'song',
}

const providerAccent: Record<SongItemData['provider'], string> = {
  spotify: '#1db954',
  youtube: '#cc1b1b',
  apple: '#fa57c1',
  soundcloud: '#ff7700',
  itunes: '#fc3c44',
  unknown: '#8b6f47',
}

const HIDDEN_AUDIO_PROVIDERS: SongItemData['provider'][] = ['youtube', 'soundcloud']

export default function SongItem({ item, isEditing, onChange }: Props) {
  const titleRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  // Blank items (dropped from the toolbar with an empty URL) open straight into
  // the picker — no second click required.
  const [editingUrl, setEditingUrl] = useState(!item.url)
  useEffect(() => {
    if (titleRef.current && titleRef.current.innerText !== item.title) {
      titleRef.current.innerText = item.title
    }
  }, [item.title])

  useEffect(() => {
    if (isEditing && titleRef.current && !editingUrl) {
      const el = titleRef.current
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [isEditing, editingUrl])

  const embed = getSongEmbedUrl(item)
  const accent = providerAccent[item.provider]
  const hiddenAudio = HIDDEN_AUDIO_PROVIDERS.includes(item.provider)

  return (
    <div
      className="w-full h-full relative overflow-visible"
      style={{
        background:
          'linear-gradient(135deg, #2a1f18 0%, #1a130f 50%, #2a1f18 100%)',
        border: '1px solid rgba(0, 0, 0, 0.4)',
        borderRadius: 14,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Wood grain hint — subtle horizontal lines */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: 1,
          borderRadius: 13,
          background:
            'repeating-linear-gradient(180deg, transparent 0 6px, rgba(255,255,255,0.015) 6px 7px)',
          opacity: 0.7,
        }}
      />

      <div className="w-full h-full flex items-center gap-3 px-3 relative">
        {/* === Vinyl + tonearm cluster === */}
        <div
          className="relative flex-shrink-0"
          style={{ width: 64, height: 64 }}
        >
          {/* Glow aura — only when playing */}
          {isPlaying && (
            <div
              className="absolute pointer-events-none sb-glow-pulse"
              style={{
                inset: -12,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}88 0%, ${accent}33 35%, transparent 70%)`,
                filter: 'blur(6px)',
                zIndex: 0,
              }}
            />
          )}

          {/* Spinning disc */}
          <div
            className={isPlaying ? 'sb-vinyl-spin' : ''}
            style={{
              position: 'absolute',
              inset: 4,
              borderRadius: '50%',
              background: `radial-gradient(circle at center,
                transparent 18%,
                rgba(255,255,255,0.04) 19%,
                transparent 22%,
                rgba(255,255,255,0.04) 28%,
                transparent 31%,
                rgba(255,255,255,0.04) 38%,
                transparent 41%,
                rgba(255,255,255,0.04) 46%,
                transparent 49%
              ), radial-gradient(circle at 35% 35%, #2a2520 0%, #0a0807 60%)`,
              boxShadow:
                'inset 0 0 8px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.5)',
            }}
          >
            {/* Shimmer overlay — sweeps slower than the disc, creates a
                "light reflection" that catches the grooves */}
            <div
              className="sb-shimmer-spin"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background:
                  'conic-gradient(from 0deg at 50% 50%, transparent 0%, rgba(255,255,255,0.12) 18%, transparent 30%, transparent 70%, rgba(255,255,255,0.06) 85%, transparent 100%)',
                mixBlendMode: 'screen',
              }}
            />
            {/* Center label */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: `radial-gradient(circle at 30% 30%, ${accent}ee 0%, ${accent} 60%, ${darken(accent)} 100%)`,
                transform: 'translate(-50%, -50%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.3)',
              }}
            />
            {/* Spindle hole */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#000',
                transform: 'translate(-50%, -50%)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
              }}
            />
          </div>

          {/* Tonearm — pivots from upper-right, swings in to touch disc when playing */}
          <svg
            className="absolute pointer-events-none"
            style={{
              top: -6,
              right: -10,
              width: 60,
              height: 60,
              transformOrigin: '85% 15%',
              transform: isPlaying ? 'rotate(28deg)' : 'rotate(-12deg)',
              transition: 'transform 700ms cubic-bezier(0.65, 0, 0.35, 1)',
              zIndex: 2,
            }}
            viewBox="0 0 60 60"
          >
            {/* base/pivot */}
            <circle cx="51" cy="9" r="5" fill="#bfa382" stroke="#3a2a1a" strokeWidth="1.4" />
            <circle cx="51" cy="9" r="2" fill="#3a2a1a" />
            {/* arm shaft */}
            <line x1="51" y1="9" x2="22" y2="40" stroke="#cdb892" strokeWidth="3" strokeLinecap="round" />
            <line x1="51" y1="9" x2="22" y2="40" stroke="#7a5e3a" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
            {/* cartridge head */}
            <rect
              x="13"
              y="36"
              width="14"
              height="6"
              rx="1.5"
              fill="#2a1f18"
              stroke="#0a0805"
              strokeWidth="0.8"
              transform="rotate(-45 20 39)"
            />
            {/* needle tip */}
            <circle cx="14" cy="42" r="1.2" fill={isPlaying ? accent : '#9a8a78'} />
          </svg>

          {/* Play overlay button — sits on top, doesn't spin */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (!embed && item.provider !== 'itunes') return
              setIsPlaying((p) => !p)
            }}
            disabled={!embed && item.provider !== 'itunes'}
            className="absolute flex items-center justify-center transition-all"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 28,
              height: 28,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 30% 30%, #fefaf0 0%, #d8cdb4 100%)',
              color: '#1a1614',
              border: '1px solid rgba(0,0,0,0.3)',
              cursor: (embed || item.provider === 'itunes') ? 'pointer' : 'not-allowed',
              opacity: (embed || item.provider === 'itunes') ? 1 : 0.5,
              fontSize: 11,
              boxShadow:
                '0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.6)',
              padding: 0,
              lineHeight: 1,
              zIndex: 3,
            }}
            onMouseEnter={(e) => {
              if (embed || item.provider === 'itunes')
                (e.currentTarget as HTMLElement).style.transform =
                  'translate(-50%, -50%) scale(1.12)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.transform =
                'translate(-50%, -50%)'
            }}
            title={(embed || item.provider === 'itunes') ? (isPlaying ? 'pause' : 'play') : 'no embed available'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
        </div>

        {/* === Title + provider + equalizer === */}
        {/* overflow-visible while editing so the SongPicker dropdown isn't clipped;
            the title row uses `truncate` which carries its own overflow rule. */}
        <div className={`flex-1 min-w-0 ${editingUrl ? '' : 'overflow-hidden'}`}>
          {editingUrl ? (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <SongPicker
                value={item.url}
                onChange={(next) => {
                  if (!next) return
                  const meta = deriveSongMeta(next)
                  onChange({ ...item, url: next, title: meta.title, provider: meta.provider })
                  setEditingUrl(false)
                  setIsPlaying(false)
                }}
                placeholder="Search or paste a link…"
                autoFocus
              />
            </div>
          ) : (
            <>
              {/* DOM children owned by the title-sync useEffect — never pass
                  {item.title} as JSX children, or React resets the caret on
                  every keystroke (backwards typing). */}
              <div
                ref={titleRef}
                contentEditable={isEditing}
                suppressContentEditableWarning
                onInput={(e) =>
                  onChange({ ...item, title: (e.currentTarget as HTMLDivElement).innerText })
                }
                onPointerDown={(e) => {
                  if (isEditing) e.stopPropagation()
                }}
                spellCheck={false}
                className="outline-none truncate"
                style={{
                  fontFamily: 'var(--font-caveat), cursive',
                  fontSize: 20,
                  color: '#fefaf0',
                  lineHeight: 1.1,
                  cursor: isEditing ? 'text' : 'inherit',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 2,
                  lineHeight: 1.2,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-caveat), cursive',
                    fontSize: 13,
                    color: accent,
                    opacity: 0.95,
                    textShadow: '0 1px 1px rgba(0,0,0,0.4)',
                  }}
                >
                  {providerLabel[item.provider]}
                </span>
                {isPlaying && <Equalizer color={accent} />}
              </div>
            </>
          )}
        </div>

        {/* === Edit URL pencil === */}
        {!editingUrl && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setEditingUrl(true)
              setIsPlaying(false)
            }}
            className="flex items-center justify-center rounded-md flex-shrink-0 transition-colors"
            style={{
              width: 24,
              height: 24,
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(254, 250, 240, 0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'
              ;(e.currentTarget as HTMLElement).style.color = '#fefaf0'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(254, 250, 240, 0.6)'
            }}
            title="change link"
          >
            ✎
          </button>
        )}
      </div>

      {/* Floating music notes — only when playing */}
      {isPlaying && <FloatingNotes color={accent} />}

      {/* Hidden audio iframe (YouTube / SoundCloud) */}
      {isPlaying && embed && hiddenAudio && (
        <iframe
          src={embed.src}
          allow="autoplay; encrypted-media"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            left: -9999,
            top: 0,
            border: 'none',
            opacity: 0,
            pointerEvents: 'none',
          }}
          title="audio playback"
        />
      )}

      {/* Visible compact embed (Spotify / Apple Music) */}
      {isPlaying && embed && !hiddenAudio && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute"
          style={{
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
            height: embed.height,
            background: '#fefaf0',
            border: '1px solid rgba(58, 52, 41, 0.18)',
            borderTop: `3px solid ${accent}`,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 8px 22px rgba(20, 14, 4, 0.32)',
          }}
        >
          <iframe
            src={embed.src}
            width="100%"
            height="100%"
            allow="autoplay; encrypted-media; fullscreen"
            style={{ border: 'none', display: 'block' }}
            title={item.title}
          />
        </div>
      )}

      {/* iTunes embed — delegates to SongEmbed */}
      {item.provider === 'itunes' && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute"
          style={{
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 6,
          }}
        >
          <SongEmbed url={item.url} compact audioOnly />
        </div>
      )}
    </div>
  )
}

function Equalizer({ color }: { color: string }) {
  // 4 bars with staggered animation delays for a natural look
  const bars = [
    { delay: 0, base: 0.7 },
    { delay: 0.18, base: 0.5 },
    { delay: 0.07, base: 0.85 },
    { delay: 0.24, base: 0.6 },
  ]
  return (
    <div className="flex items-end gap-0.5" style={{ height: 12 }}>
      {bars.map((b, i) => (
        <div
          key={i}
          className="sb-eq-bar"
          style={{
            width: 2.5,
            height: '100%',
            background: color,
            borderRadius: 1,
            animationDelay: `${b.delay}s`,
            animationDuration: `${0.7 + b.base * 0.4}s`,
            boxShadow: `0 0 4px ${color}88`,
          }}
        />
      ))}
    </div>
  )
}

function FloatingNotes({ color }: { color: string }) {
  // Three notes drifting up, staggered, looped
  const notes = [
    { left: '12%', delay: 0, glyph: '♪' },
    { left: '24%', delay: 1.1, glyph: '♫' },
    { left: '8%', delay: 2.2, glyph: '♩' },
  ]
  return (
    <>
      {notes.map((n, i) => (
        <div
          key={i}
          className="sb-note-float absolute pointer-events-none"
          style={{
            left: n.left,
            bottom: 4,
            color: color,
            fontSize: 16,
            textShadow: `0 0 6px ${color}aa, 0 1px 2px rgba(0,0,0,0.4)`,
            animationDelay: `${n.delay}s`,
            opacity: 0,
          }}
        >
          {n.glyph}
        </div>
      ))}
    </>
  )
}

// Darken a hex color by ~25% — used to give the vinyl center label a
// subtle inner-shadow gradient.
function darken(hex: string): string {
  const m = hex.replace('#', '')
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
  const r = Math.max(0, Math.round(parseInt(full.slice(0, 2), 16) * 0.7))
  const g = Math.max(0, Math.round(parseInt(full.slice(2, 4), 16) * 0.7))
  const b = Math.max(0, Math.round(parseInt(full.slice(4, 6), 16) * 0.7))
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
