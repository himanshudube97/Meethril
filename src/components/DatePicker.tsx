'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

interface DatePickerProps {
  value: string // YYYY-MM-DD format
  onChange: (value: string) => void
  placeholder?: string
  minDate?: Date // Minimum selectable date
  mode?: 'dropdown' | 'modal' // Display mode
  isOpen?: boolean // For controlled modal mode
  onClose?: () => void // For controlled modal mode
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'select date...',
  minDate,
  mode = 'dropdown',
  isOpen: controlledIsOpen,
  onClose,
}: DatePickerProps) {
  const { theme } = useThemeStore()
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  // Use controlled or internal state
  const isOpen = mode === 'modal' ? (controlledIsOpen ?? false) : internalIsOpen
  const setIsOpen = mode === 'modal'
    ? (open: boolean) => { if (!open && onClose) onClose() }
    : setInternalIsOpen

  // Parse current value or use today as default view
  const today = new Date()
  const parsedDate = value ? new Date(value) : null

  const [viewYear, setViewYear] = useState(parsedDate?.getFullYear() || today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsedDate?.getMonth() || today.getMonth())
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  // Generate year range (100 years back + 10 years forward)
  const currentYear = today.getFullYear()
  const years = Array.from({ length: 110 }, (_, i) => currentYear + 10 - i)

  // Set mounted state for portal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Calculate dropdown position (only for dropdown mode)
  const updatePosition = useCallback(() => {
    if (triggerRef.current && mode === 'dropdown') {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      })
    }
  }, [mode])

  // Update position when opening
  useEffect(() => {
    if (isOpen && mode === 'dropdown') {
      updatePosition()
    }
  }, [isOpen, updatePosition, mode])

  // Close on click outside (dropdown mode only)
  useEffect(() => {
    if (mode === 'modal') return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleScroll = () => {
      if (isOpen) updatePosition()
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isOpen, updatePosition, mode, setIsOpen])

  // Generate calendar days
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const days: (number | null)[] = []

  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const handleDayClick = (day: number) => {
    const month = String(viewMonth + 1).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    onChange(`${viewYear}-${month}-${dayStr}`)
    setIsOpen(false)
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const isSelected = (day: number): boolean => {
    if (!value) return false
    const [y, m, d] = value.split('-').map(Number)
    return y === viewYear && m === viewMonth + 1 && d === day
  }

  const isToday = (day: number): boolean => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const isDisabled = (day: number): boolean => {
    if (!minDate) return false
    const cellDate = new Date(viewYear, viewMonth, day)
    const minDateOnly = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
    return cellDate < minDateOnly
  }

  const calendarContent = (
    <div className="p-4">
      {/* Month/Year Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{ color: theme.text.muted }}
        >
          ‹
        </button>
        <div className="text-center flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setShowMonthPicker(!showMonthPicker); setShowYearPicker(false) }}
            className="text-sm font-medium px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: theme.text.primary }}
          >
            {MONTHS[viewMonth]}
          </button>
          <button
            type="button"
            onClick={() => { setShowYearPicker(!showYearPicker); setShowMonthPicker(false) }}
            className="text-sm px-2 py-1 rounded hover:opacity-80 transition-opacity"
            style={{ color: theme.text.muted }}
          >
            {viewYear}
          </button>
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
          style={{ color: theme.text.muted }}
        >
          ›
        </button>
      </div>

      {/* Year Picker */}
      {showYearPicker && (
        <div
          className="mb-4 max-h-48 overflow-y-auto rounded-lg p-2"
          style={{ background: `${theme.bg.primary}80` }}
        >
          <div className="grid grid-cols-4 gap-1">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => { setViewYear(year); setShowYearPicker(false) }}
                className="px-2 py-2 rounded text-sm transition-all"
                style={{
                  background: year === viewYear ? `${theme.accent.primary}40` : 'transparent',
                  color: year === viewYear ? theme.accent.primary : theme.text.primary,
                }}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Month Picker */}
      {showMonthPicker && (
        <div
          className="mb-4 rounded-lg p-2"
          style={{ background: `${theme.bg.primary}80` }}
        >
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((month, index) => (
              <button
                key={month}
                type="button"
                onClick={() => { setViewMonth(index); setShowMonthPicker(false) }}
                className="px-2 py-2 rounded text-sm transition-all"
                style={{
                  background: index === viewMonth ? `${theme.accent.primary}40` : 'transparent',
                  color: index === viewMonth ? theme.accent.primary : theme.text.primary,
                }}
              >
                {month.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day Headers & Calendar Grid */}
      {!showYearPicker && !showMonthPicker && (
        <>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAYS.map((day) => (
              <div
                key={day}
                className="text-center text-xs py-1"
                style={{ color: theme.text.muted }}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const disabled = day !== null && isDisabled(day)
              return (
                <div key={index} className="aspect-square">
                  {day !== null && (
                    <button
                      type="button"
                      onClick={() => !disabled && handleDayClick(day)}
                      disabled={disabled}
                      className="w-full h-full rounded-lg flex items-center justify-center text-sm transition-all"
                      style={{
                        background: isSelected(day)
                          ? `${theme.accent.primary}40`
                          : 'transparent',
                        color: disabled
                          ? `${theme.text.muted}50`
                          : isSelected(day)
                          ? theme.accent.primary
                          : isToday(day)
                          ? theme.accent.warm
                          : theme.text.primary,
                        border: isToday(day) && !isSelected(day)
                          ? `1px solid ${theme.accent.warm}40`
                          : '1px solid transparent',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {day}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Quick Actions */}
      {!showYearPicker && !showMonthPicker && (
        <div className="mt-4 pt-3 border-t flex justify-between" style={{ borderColor: theme.glass.border }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-xs px-3 py-1 rounded-full"
            style={{ color: theme.text.muted }}
          >
            cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setIsOpen(false)
            }}
            className="text-xs px-3 py-1 rounded-full"
            style={{ color: theme.text.muted }}
          >
            clear
          </button>
        </div>
      )}
    </div>
  )

  // Modal mode - render centered modal
  if (mode === 'modal') {
    const modal = (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99999] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false)
            }}
          >
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl w-80"
              style={{
                background: theme.bg.secondary,
                border: `1px solid ${theme.glass.border}`,
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              {calendarContent}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    )

    return mounted ? createPortal(modal, document.body) : null
  }

  // Dropdown mode - render with trigger button
  const dropdown = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed rounded-xl w-72"
          style={{
            top: position.top,
            left: position.left,
            zIndex: 99999,
            background: theme.bg.secondary,
            border: `1px solid ${theme.glass.border}`,
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          {calendarContent}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left text-base bg-transparent outline-none flex items-center justify-between"
        style={{ color: value ? theme.text.primary : theme.text.muted }}
      >
        <span>{value ? formatDisplayDate(value) : placeholder}</span>
        <span style={{ color: theme.text.muted }}>
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {/* Portal dropdown */}
      {mounted && createPortal(dropdown, document.body)}
    </div>
  )
}
