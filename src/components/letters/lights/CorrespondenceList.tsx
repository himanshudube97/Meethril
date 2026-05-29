// src/components/letters/lights/CorrespondenceList.tsx
'use client'

import type { InboxThread } from '@/hooks/useStrangerNotes'
import { monogram } from '@/lib/monogram'
import { shortDate } from '@/lib/date-format'

interface Props {
  threads: InboxThread[]
  onPick: (id: string) => void
  onLoadMore: () => void
  hasMore: boolean
  loadingMore: boolean
}

function statusLabel(t: InboxThread): string {
  if (t.status === 'pen_pal') return 'pen pal'
  if (t.status === 'unmatched') return 'awaiting a reply'
  // messageCount includes the opening note, so a real back-and-forth needs >1.
  return t.messageCount > 1 ? `${t.messageCount} letters deep` : 'a stranger'
}

function previewLine(t: InboxThread): string {
  if (!t.preview) return ''
  if (t.preview.encryptionTier === 'thread') return '✦ sealed'
  const who = t.preview.isMine ? 'you: ' : ''
  return who + t.preview.body
}

function Row({ t, onPick }: { t: InboxThread; onPick: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(t.id)}
        className="flex w-full items-center gap-3 py-3 text-left transition-colors"
        style={{ borderBottom: '1px solid color-mix(in oklab, var(--text-primary) 12%, transparent)' }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[14px] italic"
          style={{
            background: 'color-mix(in oklab, var(--accent-warm) 18%, transparent)',
            color: 'var(--text-primary)',
          }}
        >
          {monogram(t.partnerDisplayName)}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="font-serif text-[12px] italic"
            style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
          >
            {statusLabel(t)}
          </span>
          <span className="truncate font-serif text-[13px]" style={{ color: 'var(--text-primary)' }}>
            {previewLine(t)}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="font-serif text-[10px] uppercase italic"
            style={{ color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)', letterSpacing: '0.12em' }}
          >
            {shortDate(t.lastActivityAt)}
          </span>
          {t.unreadCount > 0 && (
            <span
              aria-label={`${t.unreadCount} new`}
              className="rounded-full"
              style={{ width: 8, height: 8, background: 'var(--accent-primary)', boxShadow: '0 0 6px var(--accent-primary)' }}
            />
          )}
        </span>
      </button>
    </li>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mb-1 mt-2 font-serif text-[11px] uppercase italic"
      style={{ color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)', letterSpacing: '0.18em' }}
    >
      {children}
    </p>
  )
}

export default function CorrespondenceList({ threads, onPick, onLoadMore, hasMore, loadingMore }: Props) {
  // Two buckets, order within each preserved (server sorts by lastActivityAt desc):
  // ongoing conversations on top, established pen pals below.
  const conversations = threads.filter((t) => t.status !== 'pen_pal')
  const penpals = threads.filter((t) => t.status === 'pen_pal')

  if (threads.length === 0) {
    return (
      <p
        className="py-8 text-center font-serif text-[12px] italic"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)' }}
      >
        nothing here yet · release a light into the night
      </p>
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {conversations.length > 0 && (
        <div>
          <SectionHeading>your letters</SectionHeading>
          <ul className="flex flex-col">
            {conversations.map((t) => (
              <Row key={t.id} t={t} onPick={onPick} />
            ))}
          </ul>
        </div>
      )}

      {penpals.length > 0 && (
        <div>
          <SectionHeading>pen pals</SectionHeading>
          <ul className="flex flex-col">
            {penpals.map((t) => (
              <Row key={t.id} t={t} onPick={onPick} />
            ))}
          </ul>
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="self-center rounded-full px-4 py-1.5 font-serif text-[12px] italic transition-opacity disabled:opacity-40"
          style={{
            background: 'color-mix(in oklab, var(--text-primary) 8%, transparent)',
            color: 'color-mix(in oklab, var(--text-primary) 70%, transparent)',
          }}
        >
          {loadingMore ? 'gathering…' : 'show more'}
        </button>
      )}
    </div>
  )
}
