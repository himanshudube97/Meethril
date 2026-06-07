'use client'

import { useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  addDays,
} from 'date-fns'

interface Props {
  selectedDate: Date | null
  onSelect: (date: Date) => void
  onClose: () => void
}

export default function SomedayDatePicker({ selectedDate, onSelect, onClose }: Props) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (selectedDate) return startOfMonth(selectedDate)
    // Start on the first month where dates can be selected (today + 7 days)
    const earliest = addDays(new Date(), 7)
    return startOfMonth(earliest)
  })

  const today = new Date()
  const minDate = addDays(today, 7)

  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad days to start on Sunday
  const startPad = monthStart.getDay() // 0=Sun
  const paddedDays: (Date | null)[] = [
    ...Array(startPad).fill(null),
    ...days,
  ]

  function handleDayClick(day: Date) {
    if (day < minDate && !isSameDay(day, minDate)) return
    onSelect(day)
  }

  const isDimmed = (day: Date) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate())
    const m = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
    return d < m
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--paper-1, #fff6f2) 0%, var(--paper-2, #fbe6dd) 100%)',
        border: '1px solid rgba(120, 90, 50, 0.22)',
        borderRadius: 12,
        padding: '16px 18px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.14)',
        minWidth: 260,
        fontFamily: 'Cormorant Garamond, Georgia, serif',
        position: 'relative',
        zIndex: 200,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Month navigation header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => setViewMonth(m => subMonths(m, 1))}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary, #6a4048)',
            fontSize: 16,
            padding: '2px 6px',
          }}
          aria-label="Previous month"
        >
          ←
        </button>
        <span
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: 15,
            color: 'var(--text-primary, #3a2025)',
            letterSpacing: 0.5,
          }}
        >
          {format(viewMonth, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary, #6a4048)',
            fontSize: 16,
            padding: '2px 6px',
          }}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* Day-of-week headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          marginBottom: 4,
        }}
      >
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              fontSize: 10,
              color: 'var(--text-muted, rgba(120, 90, 50, 0.5))',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              letterSpacing: 0.5,
              padding: '2px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
        }}
      >
        {paddedDays.map((day, idx) => {
          if (!day) return <div key={`pad-${idx}`} />

          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const isToday = isSameDay(day, today)
          const disabled = isDimmed(day)
          const inCurrentMonth = isSameMonth(day, viewMonth)

          return (
            <button
              key={day.toISOString()}
              onClick={() => !disabled && handleDayClick(day)}
              disabled={disabled}
              style={{
                padding: '5px 0',
                borderRadius: 6,
                border: isToday ? '1px solid rgba(120, 90, 50, 0.35)' : 'none',
                background: isSelected
                  ? 'var(--accent-primary, #9a4555)'
                  : 'transparent',
                color: isSelected
                  ? '#fff'
                  : disabled
                  ? 'var(--text-muted, rgba(120, 90, 50, 0.25))'
                  : !inCurrentMonth
                  ? 'var(--text-muted, rgba(120, 90, 50, 0.35))'
                  : 'var(--text-primary, #3a2025)',
                opacity: disabled ? 0.45 : !inCurrentMonth ? 0.6 : 1,
                fontSize: 13,
                fontFamily: 'Caveat, cursive',
                cursor: disabled ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                transition: 'background 0.15s',
              }}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      {/* Footer buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid rgba(120, 90, 50, 0.12)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '5px 14px',
            borderRadius: 999,
            border: '1px solid rgba(120, 90, 50, 0.3)',
            background: 'transparent',
            color: 'var(--text-secondary, #6a4048)',
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: 0.4,
          }}
        >
          cancel
        </button>
        {selectedDate && (
          <button
            onClick={() => onClose()}
            style={{
              padding: '5px 14px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--accent-primary, #9a4555)',
              color: '#fff',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: 0.4,
            }}
          >
            confirm
          </button>
        )}
      </div>
    </div>
  )
}
