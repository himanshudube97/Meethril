'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import MobileLetterReader from './MobileLetterReader'
import LightsView from './lights/LightsView'
import type { InboxLetter, SentStamp, LettersTab } from './letterTypes'

/**
 * Mobile-only letters page. Replaces the desktop's postbox + lamp scene
 * and JarSentView with simple scrollable lists. The lights tab passes
 * through to the existing LightsView (already partially mobile-ready).
 */
export default function MobileLettersView() {
  const { theme } = useThemeStore()
  const pathname = usePathname()
  const base = pathname.startsWith('/try') ? '/try' : ''
  const [tab, setTab] = useState<LettersTab>('inbox')

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto" style={{ color: theme.text.primary }}>
      <div className="max-w-lg mx-auto px-4 pt-20 pb-12 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between px-12">
          <h1
            className="text-lg"
            style={{
              color: theme.text.primary,
              fontFamily: 'var(--font-playfair), Georgia, serif',
            }}
          >
            Letters
          </h1>
          <Link
            href={`${base}/letters/write`}
            className="text-xs px-3 py-1.5 rounded-full transition"
            style={{
              background: `${theme.accent.primary}30`,
              color: theme.accent.primary,
              border: `1px solid ${theme.accent.primary}60`,
              fontFamily: 'Georgia, serif',
            }}
          >
            + Write
          </Link>
        </div>

        {/* Tab strip */}
        <div
          className="flex items-center justify-center rounded-full p-1 gap-1"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
        >
          <TabButton active={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox</TabButton>
          <TabButton active={tab === 'sent'} onClick={() => setTab('sent')}>Sent</TabButton>
          <TabButton active={tab === 'lights'} onClick={() => setTab('lights')}>Lights</TabButton>
        </div>

        {/* Tab content */}
        {tab === 'inbox' && <InboxList />}
        {tab === 'sent' && <SentList />}
        {tab === 'lights' && (
          <div className="-mx-4">
            <LightsView />
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

function TabButton({
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
      className="flex-1 text-xs px-3 py-1.5 rounded-full transition"
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

// ----------------------------------------------------------------------------

function InboxList() {
  const { theme } = useThemeStore()
  const [letters, setLetters] = useState<InboxLetter[] | null>(null)
  const [revealLetter, setRevealLetter] = useState<InboxLetter | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/letters/inbox')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setLetters((d.letters || []) as InboxLetter[])
      })
      .catch(() => { if (!cancelled) setLetters([]) })
    return () => { cancelled = true }
  }, [])

  const ordered = useMemo(() => {
    if (!letters) return []
    return [...letters].sort((a, b) => new Date(b.sealedAt).getTime() - new Date(a.sealedAt).getTime())
  }, [letters])

  if (letters === null) {
    return <LoadingMessage>Opening the mailbox…</LoadingMessage>
  }
  if (ordered.length === 0) {
    return <EmptyMessage>Your mailbox is empty.<br />Letters appear here once they unlock.</EmptyMessage>
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {ordered.map(letter => {
          const unlockDate = letter.unlockDate ? new Date(letter.unlockDate) : null
          const isLocked = unlockDate !== null && unlockDate.getTime() > Date.now()
          return (
            <li key={letter.id}>
              <button
                onClick={() => { if (!isLocked) setRevealLetter(letter) }}
                disabled={isLocked}
                className="w-full text-left rounded-2xl p-4 transition"
                style={{
                  background: theme.glass.bg,
                  backdropFilter: `blur(${theme.glass.blur})`,
                  border: `1px solid ${theme.glass.border}`,
                  opacity: isLocked ? 0.55 : 1,
                  cursor: isLocked ? 'default' : 'pointer',
                }}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span
                    className="text-sm truncate"
                    style={{ color: theme.text.primary, fontFamily: 'Georgia, serif' }}
                  >
                    {letter.recipientName || 'You'}
                    {!letter.isViewed && !isLocked && (
                      <span
                        className="ml-2 inline-block w-1.5 h-1.5 rounded-full align-middle"
                        style={{ background: theme.accent.primary }}
                      />
                    )}
                  </span>
                  <span className="text-[10px] italic shrink-0" style={{ color: theme.text.muted }}>
                    {fmt(letter.sealedAt)}
                  </span>
                </div>
                <div className="text-xs italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
                  {isLocked
                    ? `Opens ${fmt(letter.unlockDate!)}`
                    : letter.isViewed ? 'Already read' : 'Tap to open'}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {revealLetter && (
        <MobileLetterReader
          letter={revealLetter}
          onClose={() => setRevealLetter(null)}
          onMarkRead={(id) => {
            fetch(`/api/letters/${id}/read`, { method: 'POST' }).catch(() => {})
            setLetters(prev => prev?.map(l => l.id === id ? { ...l, isViewed: true } : l) ?? null)
          }}
        />
      )}
    </>
  )
}

// ----------------------------------------------------------------------------

function SentList() {
  const { theme } = useThemeStore()
  const [stamps, setStamps] = useState<SentStamp[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/letters/sent')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        setStamps((d.letters || d.stamps || []) as SentStamp[])
      })
      .catch(() => { if (!cancelled) setStamps([]) })
    return () => { cancelled = true }
  }, [])

  const ordered = useMemo(() => {
    if (!stamps) return []
    return [...stamps].sort((a, b) => new Date(b.sealedAt).getTime() - new Date(a.sealedAt).getTime())
  }, [stamps])

  if (stamps === null) {
    return <LoadingMessage>Looking for letters you&apos;ve sent…</LoadingMessage>
  }
  if (ordered.length === 0) {
    return <EmptyMessage>You haven&apos;t sent any letters yet.</EmptyMessage>
  }

  return (
    <ul className="flex flex-col gap-3">
      {ordered.map(stamp => {
        const status = stampStatus(stamp)
        return (
          <li
            key={stamp.id}
            className="rounded-2xl p-4"
            style={{
              background: theme.glass.bg,
              backdropFilter: `blur(${theme.glass.blur})`,
              border: `1px solid ${theme.glass.border}`,
            }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span
                className="text-sm truncate"
                style={{ color: theme.text.primary, fontFamily: 'Georgia, serif' }}
              >
                {stamp.recipientName || 'someone'}
              </span>
              <span className="text-[10px] italic shrink-0" style={{ color: theme.text.muted }}>
                {fmt(stamp.sealedAt)}
              </span>
            </div>
            <div className="text-xs italic" style={{ color: status.color || theme.text.muted, fontFamily: 'Georgia, serif' }}>
              {status.label}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function stampStatus(stamp: SentStamp): { label: string; color?: string } {
  if (stamp.bouncedAt) return { label: `Couldn't be delivered${stamp.bouncedReason ? ` — ${stamp.bouncedReason}` : ''}`, color: '#c0392b' }
  if (stamp.firstReadAt) return { label: `Read ${fmt(stamp.firstReadAt)}` }
  if (stamp.letterPeekedAt) return { label: `Peeked ${fmt(stamp.letterPeekedAt)}` }
  if (stamp.isDelivered) return { label: 'Delivered, waiting to be opened' }
  if (stamp.unlockDate) return { label: `Sealed — opens ${fmt(stamp.unlockDate)}` }
  return { label: 'Sealed' }
}

// ----------------------------------------------------------------------------

function LoadingMessage({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <p
      className="text-sm text-center mt-8"
      style={{ color: theme.text.muted, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
    >
      {children}
    </p>
  )
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <div
      className="text-sm text-center mt-8 px-6 py-8 rounded-2xl"
      style={{
        color: theme.text.muted,
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
      }}
    >
      {children}
    </div>
  )
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}
