// src/components/letters/RecipientSidebar.tsx
'use client'

import { useState } from 'react'
import { LetterRecipient, UnlockChoice } from './letterTypes'

interface Props {
  recipient: LetterRecipient
  onRecipientChange: (r: LetterRecipient) => void
  unlock: UnlockChoice
  onUnlockChange: (u: UnlockChoice) => void
}

const TILES: Array<{
  key: LetterRecipient
  title: string
  subtitle: string
  glyph: string
  emblemBg: string
}> = [
  { key: 'future_me',     title: 'future me',     subtitle: 'a year from now', glyph: '✦', emblemBg: '#c8742c' },
  { key: 'someone_close', title: 'someone close', subtitle: 'you name them',   glyph: '✿', emblemBg: '#c89a7e' },
]

export default function RecipientSidebar({ recipient, onRecipientChange, unlock, onUnlockChange }: Props) {
  const [showPicker, setShowPicker] = useState(unlock.kind === 'someday')

  return (
    <aside className="w-72 shrink-0 px-6 py-10">
      <div className="mb-4 text-[11px] uppercase tracking-[0.28em]" style={{ color: '#7a5b3a' }}>
        dear …
      </div>

      <div className="flex flex-col gap-3">
        {TILES.map(t => {
          const selected = recipient === t.key
          return (
            <button
              key={t.key}
              onClick={() => onRecipientChange(t.key)}
              className="flex items-center gap-3 rounded-xl p-4 text-left transition"
              style={{
                border: selected
                  ? '1.5px solid #c8742c'
                  : '1.5px dashed rgba(120,90,50,0.35)',
                backgroundColor: selected
                  ? 'rgba(200,116,44,0.15)'
                  : 'rgba(232,200,140,0.25)',
              }}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base"
                style={{ backgroundColor: t.emblemBg, color: '#fff7e6' }}
              >
                {t.glyph}
              </span>
              <span style={{ fontFamily: 'var(--font-caveat), Caveat, cursive' }}>
                <span className="block text-xl leading-tight" style={{ color: '#1f2750' }}>
                  {t.title}
                </span>
                <span className="block text-sm italic" style={{ color: '#7a5b3a' }}>
                  {t.subtitle}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div
        className="mt-7 rounded-lg p-3 text-sm leading-relaxed italic"
        style={{
          border: '1px dashed rgba(120,90,50,0.4)',
          color: '#6b4d28',
        }}
      >
        Letters can be opened on a date, or left to be found by chance.
        <div className="mt-1" style={{ color: '#8b6b3f' }}>↳ choose when below</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['1_month','6_months','1_year','someday'] as const).map(k => {
          const label = k === '1_month' ? '1 month' : k === '6_months' ? '6 months' : k === '1_year' ? '1 year' : 'someday'
          const selected = unlock.kind === k
          return (
            <button
              key={k}
              onClick={() => {
                if (k === 'someday') {
                  setShowPicker(true)
                  onUnlockChange({ kind: 'someday', date: unlock.kind === 'someday' ? unlock.date : null })
                } else {
                  setShowPicker(false)
                  onUnlockChange({ kind: k })
                }
              }}
              className="rounded-md px-3 py-1.5 text-sm transition"
              style={{
                border: '1px solid rgba(120,90,50,0.35)',
                backgroundColor: selected ? '#d8b878' : '#e6d5a7',
                color: '#5a3f1f',
                fontWeight: selected ? 500 : 400,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {showPicker && unlock.kind === 'someday' && (
        <div className="mt-3">
          <label className="block text-sm mb-1" style={{ color: '#7a5b3a' }}>pick a date</label>
          <input
            type="date"
            min={new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)}
            value={unlock.date ? unlock.date.toISOString().slice(0, 10) : ''}
            onChange={e => onUnlockChange({ kind: 'someday', date: e.target.value ? new Date(e.target.value) : null })}
            className="rounded-md px-2 py-1 text-sm"
            style={{
              border: '1px solid rgba(120,90,50,0.35)',
              backgroundColor: '#e6d5a7',
              color: '#5a3f1f',
            }}
          />
        </div>
      )}
    </aside>
  )
}
