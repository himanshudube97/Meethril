'use client'

import React, { useEffect, useRef, useState } from 'react'
import { stickerIds, stickers } from './stickers'

interface Props {
  onAddText: () => void
  onAddSticker: (stickerId: string) => void
  onAddPhoto: () => void
  onAddSong: (url: string) => void
  onAddDoodle: () => void
  onAddClip: (variant: 'index-card' | 'ticket-stub' | 'receipt') => void
  onAddStamp: () => void
  onAddDate: () => void
  onReset: () => void
}

// Live "friday, 1 may"-style preview for the date sticker tile.
function dateTileLabel(): string {
  const d = new Date()
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
  const month = d.toLocaleDateString('en-US', { month: 'short' }).toLowerCase()
  return `${weekday} ${d.getDate()} ${month}`
}

export default function CanvasToolbar({
  onAddText,
  onAddSticker,
  onAddPhoto,
  onAddSong,
  onAddDoodle,
  onAddClip,
  onAddStamp,
  onAddDate,
  onReset,
}: Props) {
  const [stickerOpen, setStickerOpen] = useState(false)
  const [clipOpen, setClipOpen] = useState(false)
  const stickerWrapRef = useRef<HTMLDivElement>(null)
  const clipWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (stickerWrapRef.current && !stickerWrapRef.current.contains(e.target as Node)) {
        setStickerOpen(false)
      }
      if (clipWrapRef.current && !clipWrapRef.current.contains(e.target as Node)) {
        setClipOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div
      className="flex flex-col items-stretch gap-1.5 px-2 py-3 rounded-3xl"
      style={{
        background: '#fefaf0',
        border: '1px solid rgba(58, 52, 41, 0.18)',
        boxShadow: '0 6px 22px rgba(20, 14, 4, 0.18)',
        fontFamily: 'var(--font-caveat), cursive',
        width: 132,
      }}
    >
      <ToolbarButton onClick={onAddText} icon="✎" label="text" />

      <ToolbarButton onClick={onAddPhoto} icon="◰" label="photo" />

      {/* Drops a blank song item on the canvas — the user searches/picks via
          the SongPicker inside the item itself (auto-opens for empty items). */}
      <ToolbarButton onClick={() => onAddSong('')} icon="♪" label="song" />

      <div className="relative" ref={stickerWrapRef}>
        <ToolbarButton
          onClick={() => setStickerOpen((o) => !o)}
          icon="✦"
          label="sticker"
          active={stickerOpen}
        />
        {stickerOpen && (
          <div
            className="absolute p-3 rounded-2xl"
            style={{
              top: 0,
              left: '100%',
              marginLeft: 10,
              background: '#fefaf0',
              border: '1px solid rgba(58, 52, 41, 0.18)',
              boxShadow: '0 8px 24px rgba(20, 14, 4, 0.22)',
              zIndex: 50,
              width: 280,
            }}
          >
            <div className="grid grid-cols-5 gap-2">
              <button
                key="__date"
                onClick={() => {
                  onAddDate()
                  setStickerOpen(false)
                }}
                className="aspect-square rounded-lg flex items-center justify-center transition-transform"
                style={{
                  background: '#fefdf8',
                  border: '1px solid rgba(58, 52, 41, 0.18)',
                  cursor: 'pointer',
                  padding: 4,
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.transform =
                    'scale(1.08) rotate(-2deg)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.transform = ''
                }}
                title="date"
              >
                <span
                  style={{
                    fontFamily: 'var(--font-playfair), serif',
                    fontStyle: 'italic',
                    fontSize: 11,
                    color: '#a3413a',
                    lineHeight: 1.1,
                    textAlign: 'center',
                  }}
                >
                  {dateTileLabel()}
                </span>
              </button>
              {stickerIds.map((id) => {
                const entry = stickers[id]
                const Sticker = entry.component
                return (
                  <button
                    key={id}
                    onClick={() => {
                      onAddSticker(id)
                      setStickerOpen(false)
                    }}
                    className="aspect-square rounded-lg flex items-center justify-center transition-transform"
                    style={{
                      background: '#f4ecd8',
                      border: '1px solid rgba(58, 52, 41, 0.12)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLElement).style.transform =
                        'scale(1.08) rotate(-3deg)'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.transform = ''
                    }}
                    title={entry.label}
                  >
                    <div style={{ width: '70%', height: '70%' }}>
                      <Sticker />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ToolbarButton onClick={onAddDoodle} icon="✏" label="doodle" />

      <div className="relative" ref={clipWrapRef}>
        <ToolbarButton
          onClick={() => setClipOpen((o) => !o)}
          icon="✂"
          label="clip"
          active={clipOpen}
        />
        {clipOpen && (
          <div
            className="absolute p-2 rounded-2xl flex flex-col gap-1"
            style={{
              top: 0,
              left: '100%',
              marginLeft: 10,
              background: '#fefaf0',
              border: '1px solid rgba(58, 52, 41, 0.18)',
              boxShadow: '0 8px 24px rgba(20, 14, 4, 0.22)',
              zIndex: 50,
              width: 160,
            }}
          >
            {(['index-card', 'ticket-stub', 'receipt'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { onAddClip(v); setClipOpen(false) }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(58, 52, 41, 0.18)',
                  background: '#fefdf8',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-caveat), cursive',
                  fontSize: 16,
                  color: '#3a3429',
                  textAlign: 'left',
                }}
              >
                {v.replace('-', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolbarButton onClick={onAddStamp} icon="◉" label="stamp" />

      <div style={{ height: 1, width: '70%', alignSelf: 'center', background: 'rgba(58, 52, 41, 0.18)', margin: '4px 0' }} />

      <ToolbarButton
        onClick={() => {
          if (window.confirm('Reset this scrapbook? All items will be removed.')) {
            onReset()
          }
        }}
        icon="↺"
        label="reset"
      />
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: string
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all w-full"
      style={{
        background: active ? '#3a3429' : 'transparent',
        color: disabled ? 'rgba(58, 52, 41, 0.35)' : active ? '#f4ecd8' : '#3a3429',
        fontSize: 16,
        fontFamily: 'var(--font-caveat), cursive',
        border: '1px solid',
        borderColor: active ? '#3a3429' : 'rgba(58, 52, 41, 0.22)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
      }}
      title={disabled ? 'coming soon' : label}
    >
      <span style={{ fontSize: 13, width: 14, display: 'inline-block', textAlign: 'center' }}>{icon}</span>
      <span>{label}</span>
    </button>
  )
}
