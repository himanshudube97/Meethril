# Stranger Notes UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "to a stranger" surface theme-aware, font-consistent (app's EB Garamond, not handwriting), scalable via cursor-paginated inbox + hybrid sky/list, and identified by single-letter monograms.

**Architecture:** Backend inbox route becomes filterable + cursor-paginated and returns a flat `threads` page (each carrying `messageCount` + `unreadCount`). The `useStrangerNotes` hook accumulates pages and exposes `filter`/`loadMore`. `LightsView` composes a small **PlanesSky** (unread floaters, derived client-side from loaded threads) over a **CorrespondenceList** (filter chips + rows + load-more). `ThreadView` drops letter-cards for plain themed message blocks (you = ink/right, them = accent/left), keeps timestamps + ` . . . ` dividers, uses a single-letter monogram header. Compose surfaces lose ruled lines + handwriting font.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma/PostgreSQL, Framer Motion, Zustand theme store, EB Garamond (`--font-serif`).

**Project conventions (override generic plan defaults):**
- **No unit tests** — verify manually in Docker dev (`docker compose restart app`, open the app, check across themes). Each task ends with a manual verification step + commit.
- Run typecheck via the `typecheck` skill (TS inside Docker) where noted.
- Additive only — no schema changes, no migrations in this plan.

---

## File Map

- **Create** `src/lib/monogram.ts` — `monogram(name)` render-time helper.
- **Create** `src/components/letters/lights/PlanesSky.tsx` — unread-only floating planes strip.
- **Create** `src/components/letters/lights/CorrespondenceList.tsx` — filter chips + paginated rows.
- **Modify** `src/app/api/stranger-notes/inbox/route.ts` — filter + cursor pagination; flat `threads` + `nextCursor` + `messageCount`.
- **Modify** `src/hooks/useStrangerNotes.ts` — page accumulation, `filter`/`setFilter`, `loadMore`; add `messageCount` to `InboxThread`.
- **Modify** `src/components/letters/lights/LightsView.tsx` — compose Sky + List.
- **Modify** `src/components/letters/lights/ThreadView.tsx` — plain message blocks, app font, two-ink colors, timestamps, dividers, monogram header, single-sheet paper.
- **Modify** `src/components/letters/lights/ComposePaper.tsx` — remove ruled lines, app font.
- **Modify** `src/components/letters/lights/MobileComposePaper.tsx` — app font.
- **Delete** `src/components/letters/lights/PlanesCluster.tsx` — replaced by PlanesSky + CorrespondenceList.

---

## Task 1: Monogram helper

**Files:**
- Create: `src/lib/monogram.ts`

- [ ] **Step 1: Create the helper**

```ts
// src/lib/monogram.ts
// Render-time single-letter identity for a stranger / self display name.
// "Radiant Lantern" -> "R", "  gentle wolf" -> "G", "" -> "·".
// Stable per stored name, so it stays constant across a correspondence.
export function monogram(name: string | null | undefined): string {
  const ch = (name ?? '').trim().charAt(0)
  return ch ? ch.toUpperCase() : '·'
}
```

- [ ] **Step 2: Typecheck**

Invoke the `typecheck` skill. Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/monogram.ts
git commit -m "feat(stranger): monogram render-time helper"
```

---

## Task 2: Paginated, filterable inbox API

**Files:**
- Modify: `src/app/api/stranger-notes/inbox/route.ts` (full rewrite)

Adds `messageCount` per thread, `?filter` (`all`|`penpals`|`strangers`|`sent`), `?cursor`, `?limit` (default 30, max 50). Returns a flat page ordered by `lastActivityAt DESC, id DESC`. `counters` are computed globally.

- [ ] **Step 1: Replace the file contents**

```ts
// src/app/api/stranger-notes/inbox/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { decryptServerTier, WAVE_ELIGIBLE_PER_SIDE } from '@/lib/stranger-notes'

interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  messageCount: number
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

type Filter = 'all' | 'penpals' | 'strangers' | 'sent'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const filter = (params.get('filter') ?? 'all') as Filter
  const cursor = params.get('cursor')
  const limit = Math.min(Math.max(Number(params.get('limit')) || 30, 1), 50)

  // status slice per filter
  const statusWhere =
    filter === 'penpals'
      ? { status: 'pen_pal' as const }
      : filter === 'strangers'
      ? { status: 'active' as const }
      : filter === 'sent'
      ? { status: 'unmatched' as const, senderId: user.id }
      : { status: { in: ['unmatched', 'active', 'pen_pal'] } }

  const rows = await prisma.strangerThread.findMany({
    where: {
      AND: [
        {
          OR: [
            { senderId: user.id, senderDismissedAt: null },
            { recipientId: user.id, recipientDismissedAt: null },
          ],
        },
        statusWhere,
      ],
    },
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      waves: { where: { userId: user.id }, take: 1 },
    },
  })

  const ids = rows.map((r) => r.id)

  // Per-thread per-sender counts (wave eligibility + "N letters deep").
  const userMessageCounts = ids.length
    ? await prisma.strangerMessage.groupBy({
        by: ['threadId', 'senderId'],
        where: { threadId: { in: ids } },
        _count: { _all: true },
      })
    : []

  const countsByThread = new Map<string, { sender: number; recipient: number }>()
  for (const row of userMessageCounts) {
    const parent = rows.find((r) => r.id === row.threadId)
    if (!parent) continue
    const t = countsByThread.get(row.threadId) ?? { sender: 0, recipient: 0 }
    if (row.senderId === parent.senderId) t.sender = row._count._all
    if (row.senderId === parent.recipientId) t.recipient = row._count._all
    countsByThread.set(row.threadId, t)
  }

  // Batch unread counts for this page only.
  const lastViewedByThread = new Map<string, Date | null>()
  for (const r of rows) {
    lastViewedByThread.set(
      r.id,
      r.senderId === user.id ? r.senderLastViewedAt : r.recipientLastViewedAt,
    )
  }
  const incomingMessages = ids.length
    ? await prisma.strangerMessage.findMany({
        where: { threadId: { in: ids }, senderId: { not: user.id } },
        select: { threadId: true, createdAt: true },
      })
    : []
  const unreadByThread = new Map<string, number>()
  for (const m of incomingMessages) {
    const lvAt = lastViewedByThread.get(m.threadId) ?? null
    if (lvAt && m.createdAt <= lvAt) continue
    unreadByThread.set(m.threadId, (unreadByThread.get(m.threadId) ?? 0) + 1)
  }

  const threads: InboxThread[] = rows.map((t) => {
    const isSender = t.senderId === user.id
    const c = countsByThread.get(t.id) ?? { sender: 0, recipient: 0 }
    const lastMsg = t.messages[0] ?? null
    return {
      id: t.id,
      status: t.status as InboxThread['status'],
      partnerDisplayName: isSender
        ? (t.recipientDisplayName ?? 'A wandering light')
        : t.senderDisplayName,
      myDisplayName: isSender ? t.senderDisplayName : (t.recipientDisplayName ?? '—'),
      lastActivityAt: t.lastActivityAt.toISOString(),
      messageCount: c.sender + c.recipient,
      unreadCount: unreadByThread.get(t.id) ?? 0,
      waveEligible:
        t.status === 'active' &&
        c.sender >= WAVE_ELIGIBLE_PER_SIDE &&
        c.recipient >= WAVE_ELIGIBLE_PER_SIDE,
      waveOfferedToMe: Boolean(isSender ? t.senderWaveOfferedAt : t.recipientWaveOfferedAt),
      myWaveCast: t.waves.length > 0,
      pendingKeyExchange: t.pendingKeyExchange,
      myWrappedKey: isSender ? t.wrappedKeyForSender : t.wrappedKeyForRecipient,
      preview: lastMsg
        ? {
            isMine: lastMsg.senderId === user.id,
            encryptionTier: (lastMsg.encryptionTier as 'server' | 'thread') ?? 'server',
            body:
              lastMsg.encryptionTier === 'thread'
                ? lastMsg.content
                : decryptServerTier(lastMsg.content).slice(0, 80),
          }
        : null,
    }
  })

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null

  const [sent, received] = await Promise.all([
    prisma.strangerThread.count({ where: { senderId: user.id } }),
    prisma.strangerThread.count({ where: { recipientId: user.id } }),
  ])

  return NextResponse.json({ threads, nextCursor, counters: { sent, received } })
}
```

- [ ] **Step 2: Typecheck**

Invoke the `typecheck` skill. Expected: no new errors. (The hook still references the old shape until Task 3 — if typecheck flags `useStrangerNotes.ts`, that's expected and resolved next task. Do not "fix" it here.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stranger-notes/inbox/route.ts
git commit -m "feat(stranger): paginate + filter inbox API, add messageCount"
```

---

## Task 3: Rewrite useStrangerNotes hook (page accumulation + filter)

**Files:**
- Modify: `src/hooks/useStrangerNotes.ts` (replace the type + the hook; keep all action methods)

- [ ] **Step 1: Replace the file contents**

```ts
// src/hooks/useStrangerNotes.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface InboxThread {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  lastActivityAt: string
  messageCount: number
  unreadCount: number
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  preview: { isMine: boolean; encryptionTier: 'server' | 'thread'; body: string } | null
}

export type StrangerFilter = 'all' | 'penpals' | 'strangers' | 'sent'

interface InboxPage {
  threads: InboxThread[]
  nextCursor: string | null
  counters: { sent: number; received: number }
}

const TZ_HEADER = 'X-User-TZ'

function userTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set(TZ_HEADER, userTz())
  const res = await fetch(input, { ...init, headers, credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export function useStrangerNotes() {
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [counters, setCounters] = useState<{ sent: number; received: number }>({ sent: 0, received: 0 })
  const [filter, setFilterState] = useState<StrangerFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Tracks the filter of the most recent first-page load, so loadMore/refresh stay coherent.
  const filterRef = useRef<StrangerFilter>('all')

  const loadFirstPage = useCallback(async (f: StrangerFilter) => {
    setLoading(true)
    setError(null)
    filterRef.current = f
    try {
      const page = await jsonFetch<InboxPage>(`/api/stranger-notes/inbox?filter=${f}`)
      setThreads(page.threads)
      setNextCursor(page.nextCursor)
      setCounters(page.counters)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadFirstPage(filterRef.current)
  }, [loadFirstPage])

  const setFilter = useCallback(
    (f: StrangerFilter) => {
      setFilterState(f)
      loadFirstPage(f)
    },
    [loadFirstPage],
  )

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await jsonFetch<InboxPage>(
        `/api/stranger-notes/inbox?filter=${filterRef.current}&cursor=${encodeURIComponent(nextCursor)}`,
      )
      setThreads((prev) => [...prev, ...page.threads])
      setNextCursor(page.nextCursor)
    } catch {
      // keep what we have; user can retry
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore])

  useEffect(() => {
    loadFirstPage('all')
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refresh)
    }
  }, [loadFirstPage, refresh])

  const sendNewNote = useCallback(
    async (content: string, country?: string, stateName?: string) => {
      await jsonFetch('/api/stranger-notes', {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName }),
      })
      await refresh()
    },
    [refresh],
  )

  const sendReply = useCallback(
    async (threadId: string, content: string, country?: string, stateName?: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, country, state: stateName, encryptionTier: 'server' }),
      })
      await refresh()
    },
    [refresh],
  )

  const sendReplyEncrypted = useCallback(
    async (threadId: string, ciphertext: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
      })
      await refresh()
    },
    [refresh],
  )

  const skip = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/skip`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const block = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/block`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const waveOffered = useCallback(async (threadId: string) => {
    await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave-offered`, { method: 'POST' })
  }, [])

  const wave = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}/wave`, { method: 'POST' })
      await refresh()
    },
    [refresh],
  )

  const endPenPal = useCallback(
    async (threadId: string) => {
      await jsonFetch(`/api/stranger-notes/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
      await refresh()
    },
    [refresh],
  )

  return {
    threads,
    nextCursor,
    counters,
    filter,
    setFilter,
    loadMore,
    loading,
    loadingMore,
    error,
    refresh,
    sendNewNote,
    sendReply,
    sendReplyEncrypted,
    skip,
    block,
    waveOffered,
    wave,
    endPenPal,
  }
}
```

- [ ] **Step 2: Typecheck**

Invoke the `typecheck` skill. Expected: errors only in `PlanesCluster.tsx` / `LightsView.tsx` (they still use the old `data.*` shape) — resolved in Tasks 4–5. No errors in the hook itself.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStrangerNotes.ts
git commit -m "feat(stranger): hook page accumulation + filter + loadMore"
```

---

## Task 4: PlanesSky + CorrespondenceList components

**Files:**
- Create: `src/components/letters/lights/PlanesSky.tsx`
- Create: `src/components/letters/lights/CorrespondenceList.tsx`

- [ ] **Step 1: Create PlanesSky.tsx**

Unread-only floating planes. Takes already-filtered, already-capped `threads`. Reuses the warm paper-plane look from the old cluster.

```tsx
// src/components/letters/lights/PlanesSky.tsx
'use client'

import { motion } from 'framer-motion'
import type { InboxThread } from '@/hooks/useStrangerNotes'
import { monogram } from '@/lib/monogram'

interface Props {
  /** Unread threads only, already capped by the caller. */
  threads: InboxThread[]
  onPick: (id: string) => void
}

// A short, gentle arc of slots across the strip.
const SLOTS = [
  { x: 12, y: 40, r: -10 },
  { x: 32, y: 18, r: 12 },
  { x: 52, y: 46, r: -6 },
  { x: 72, y: 22, r: 14 },
  { x: 88, y: 50, r: -12 },
]

export default function PlanesSky({ threads, onPick }: Props) {
  if (threads.length === 0) {
    return (
      <p
        className="py-2 text-center font-serif text-[11px] italic"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)' }}
      >
        the sky is quiet — no new arrivals.
      </p>
    )
  }

  return (
    <div className="relative h-28 w-full">
      {threads.map((t, i) => {
        const slot = SLOTS[i % SLOTS.length]
        const accent = t.status === 'pen_pal' ? 'var(--accent-primary)' : 'var(--accent-warm)'
        return (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            title={`${t.partnerDisplayName} · ${t.unreadCount} new`}
            aria-label={`${t.partnerDisplayName}, ${t.unreadCount} new`}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [0, -5, 0, 3, 0],
              rotate: [slot.r - 2, slot.r + 2, slot.r - 2],
            }}
            transition={{
              opacity: { duration: 0.5, delay: i * 0.08 },
              y: { duration: 5 + i * 0.4, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 6 + i * 0.4, repeat: Infinity, ease: 'easeInOut' },
            }}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.94 }}
          >
            <motion.span
              aria-hidden
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 52,
                height: 52,
                background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
                opacity: 0.4,
                filter: 'blur(4px)',
              }}
              animate={{ scale: [1, 1.18, 1], opacity: [0.4, 0.65, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <svg width="38" height="30" viewBox="0 0 40 32" fill="none" aria-hidden>
              <path
                d="M2 14 L38 2 L24 30 L18 20 L2 14 Z"
                fill={accent}
                fillOpacity="0.18"
                stroke={accent}
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M18 20 L38 2" stroke={accent} strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            <span
              className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap font-serif text-[10px] italic"
              style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
            >
              {monogram(t.partnerDisplayName)}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create CorrespondenceList.tsx**

Filter chips + scrollable rows + load-more button.

```tsx
// src/components/letters/lights/CorrespondenceList.tsx
'use client'

import type { InboxThread, StrangerFilter } from '@/hooks/useStrangerNotes'
import { monogram } from '@/lib/monogram'

interface Props {
  threads: InboxThread[]
  filter: StrangerFilter
  onFilter: (f: StrangerFilter) => void
  onPick: (id: string) => void
  onLoadMore: () => void
  hasMore: boolean
  loadingMore: boolean
}

const CHIPS: { key: StrangerFilter; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'penpals', label: 'pen pals' },
  { key: 'strangers', label: 'strangers' },
  { key: 'sent', label: 'sent' },
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function statusLabel(t: InboxThread): string {
  if (t.status === 'pen_pal') return 'pen pal'
  if (t.status === 'unmatched') return 'awaiting a reply'
  return t.messageCount > 0 ? `${t.messageCount} letters deep` : 'a stranger'
}

function previewLine(t: InboxThread): string {
  if (!t.preview) return ''
  if (t.preview.encryptionTier === 'thread') return '✦ sealed'
  const who = t.preview.isMine ? 'you: ' : ''
  return who + t.preview.body
}

export default function CorrespondenceList({
  threads,
  filter,
  onFilter,
  onPick,
  onLoadMore,
  hasMore,
  loadingMore,
}: Props) {
  return (
    <div className="flex w-full flex-col gap-4">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = filter === c.key
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onFilter(c.key)}
              className="rounded-full px-3 py-1 font-serif text-[12px] italic transition-colors"
              style={{
                background: active
                  ? 'var(--accent-primary)'
                  : 'color-mix(in oklab, var(--text-primary) 8%, transparent)',
                color: active
                  ? 'var(--paper-1)'
                  : 'color-mix(in oklab, var(--text-primary) 70%, transparent)',
                letterSpacing: '0.04em',
              }}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Rows */}
      {threads.length === 0 ? (
        <p
          className="py-8 text-center font-serif text-[12px] italic"
          style={{ color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)' }}
        >
          nothing here yet · release a light into the night
        </p>
      ) : (
        <ul className="flex flex-col">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className="flex w-full items-center gap-3 py-3 text-left transition-colors"
                style={{
                  borderBottom: '1px solid color-mix(in oklab, var(--text-primary) 12%, transparent)',
                }}
              >
                {/* Monogram */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[14px] italic"
                  style={{
                    background: 'color-mix(in oklab, var(--accent-warm) 18%, transparent)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {monogram(t.partnerDisplayName)}
                </span>

                {/* Middle: status + preview */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="font-serif text-[12px] italic"
                    style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
                  >
                    {statusLabel(t)}
                  </span>
                  <span
                    className="truncate font-serif text-[13px]"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {previewLine(t)}
                  </span>
                </span>

                {/* Right: timestamp + unread dot */}
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="font-serif text-[10px] uppercase italic"
                    style={{
                      color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)',
                      letterSpacing: '0.12em',
                    }}
                  >
                    {shortDate(t.lastActivityAt)}
                  </span>
                  {t.unreadCount > 0 && (
                    <span
                      aria-label={`${t.unreadCount} new`}
                      className="rounded-full"
                      style={{
                        width: 8,
                        height: 8,
                        background: 'var(--accent-primary)',
                        boxShadow: '0 0 6px var(--accent-primary)',
                      }}
                    />
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
```

- [ ] **Step 3: Typecheck**

Invoke the `typecheck` skill. Expected: errors only in `LightsView.tsx` / `PlanesCluster.tsx` (old shape) — resolved next task.

- [ ] **Step 4: Commit**

```bash
git add src/components/letters/lights/PlanesSky.tsx src/components/letters/lights/CorrespondenceList.tsx
git commit -m "feat(stranger): PlanesSky + CorrespondenceList components"
```

---

## Task 5: Rewrite LightsView (compose + sky + list) and delete PlanesCluster

**Files:**
- Modify: `src/components/letters/lights/LightsView.tsx` (full rewrite)
- Delete: `src/components/letters/lights/PlanesCluster.tsx`

Sky shows unread derived from loaded threads (capped 5). With default filter `all`, unread threads sit at the top of the list (replies bump `lastActivityAt`), so they're loaded on the first page. (Known v1 limitation: under a non-`all` filter the sky reflects only that filtered subset — acceptable.)

- [ ] **Step 1: Replace LightsView.tsx contents**

```tsx
// src/components/letters/lights/LightsView.tsx
'use client'

import { useState } from 'react'
import { useStrangerNotes } from '@/hooks/useStrangerNotes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ComposePaper from './ComposePaper'
import MobileComposePaper from './MobileComposePaper'
import PlanesSky from './PlanesSky'
import CorrespondenceList from './CorrespondenceList'
import ThreadView from './ThreadView'

const SKY_CAP = 5

export default function LightsView() {
  const sn = useStrangerNotes()
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [composeKey, setComposeKey] = useState(0)
  const layoutMode = useLayoutMode()

  if (sn.loading && sn.threads.length === 0) {
    return (
      <div className="flex justify-center p-10 font-serif text-sm italic" style={{ color: 'var(--text-muted)' }}>
        loading…
      </div>
    )
  }
  if (sn.error && sn.threads.length === 0) {
    return <div className="p-6 text-sm text-red-500">{sn.error}</div>
  }

  if (activeThreadId) {
    return (
      <div className="relative flex flex-col items-center gap-6 p-6 pt-32 sm:p-10 sm:pt-36">
        <ThreadView
          threadId={activeThreadId}
          onClose={() => setActiveThreadId(null)}
          onReply={(content) => sn.sendReply(activeThreadId, content)}
          onSkip={async () => {
            await sn.skip(activeThreadId)
            setActiveThreadId(null)
          }}
          onBlock={async () => {
            await sn.block(activeThreadId)
            setActiveThreadId(null)
          }}
          onWavePromptShown={() => sn.waveOffered(activeThreadId)}
          onWave={() => sn.wave(activeThreadId)}
        />
      </div>
    )
  }

  const Compose = layoutMode === 'mobile' ? MobileComposePaper : ComposePaper
  const unread = sn.threads.filter((t) => t.unreadCount > 0).slice(0, SKY_CAP)

  return (
    <div className="relative mx-auto w-full max-w-6xl p-6 pt-32 sm:p-10 sm:pt-36">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        {/* Compose column */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md">
            <Compose
              key={composeKey}
              onSend={(content, country, stateName) => sn.sendNewNote(content, country, stateName)}
              onDismiss={() => setComposeKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* Sky + list column */}
        <div className="flex w-full justify-center lg:justify-start">
          <div className="w-full max-w-md">
            <p
              className="mb-3 text-center font-serif text-[11px] uppercase italic lg:text-left"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                letterSpacing: '0.22em',
              }}
            >
              new arrivals
            </p>
            <PlanesSky threads={unread} onPick={(id) => setActiveThreadId(id)} />

            <p
              className="mb-3 mt-6 text-center font-serif text-[11px] uppercase italic lg:text-left"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
                letterSpacing: '0.22em',
              }}
            >
              all correspondence
            </p>
            <CorrespondenceList
              threads={sn.threads}
              filter={sn.filter}
              onFilter={sn.setFilter}
              onPick={(id) => setActiveThreadId(id)}
              onLoadMore={sn.loadMore}
              hasMore={Boolean(sn.nextCursor)}
              loadingMore={sn.loadingMore}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete the old cluster**

```bash
git rm src/components/letters/lights/PlanesCluster.tsx
```

- [ ] **Step 3: Typecheck**

Invoke the `typecheck` skill. Expected: clean (no references to the old `data.*` shape remain).

- [ ] **Step 4: Manual verification**

```bash
docker compose restart app
```
Open the app → Letters → "to a stranger". Verify: new-arrivals strip shows unread floaters (or "the sky is quiet"); "all correspondence" lists threads with monogram + status + preview + date; filter chips switch the list; if >30 threads, "show more" loads the next page; tapping a row opens the thread.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/letters/lights/LightsView.tsx
git commit -m "feat(stranger): LightsView hybrid sky + paginated list"
```

---

## Task 6: Redesign ThreadView (plain message blocks, app font, two-ink colors)

**Files:**
- Modify: `src/components/letters/lights/ThreadView.tsx`

Changes: monogram header; single plain themed sheet wrapping the conversation; message blocks (no cards) — *you* = `text.primary` right-aligned, *them* = `accent.primary` left-aligned, app font, inline `— APR 28` timestamp, ` . . . ` divider between messages; reply box plain + app font (no ruled lines).

- [ ] **Step 1: Add imports + a date formatter**

Replace the top import block (lines 1–9) with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { monogram } from '@/lib/monogram'
import {
  useStrangerThreadKey,
  encryptThreadMessage,
  decryptThreadMessage,
} from '@/hooks/useStrangerThreadKey'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
```

- [ ] **Step 2: Wrap the conversation in one plain themed sheet**

Replace the opening of the returned JSX — the line:

```tsx
    <div className="flex w-full max-w-md flex-col gap-5">
```

with a themed paper sheet (reuses the existing `LETTER_EDGE_CLIP` constant already defined in this file):

```tsx
    <div
      className="flex w-full max-w-md flex-col gap-5"
      style={{
        padding: '28px 26px 24px',
        background: 'var(--paper-1)',
        clipPath: LETTER_EDGE_CLIP,
        filter: 'drop-shadow(0 10px 28px rgba(60, 30, 10, 0.22))',
      }}
    >
```

(The matching closing `</div>` at the end of the component is unchanged.)

- [ ] **Step 3: Monogram in the header**

Replace the `<h3>` (currently rendering `{thread.partnerDisplayName}`) with the monogram + correspondence depth caption:

```tsx
          <h3
            className="font-serif text-[20px]"
            style={{ color: 'var(--text-primary)' }}
          >
            to {monogram(thread.partnerDisplayName)}
          </h3>
```

- [ ] **Step 4: Add ` . . . ` dividers + timestamps in the message map**

Replace the entire "Letters stack" block (the `<div className="flex flex-col gap-4">…</div>` that maps `thread.messages`) with:

```tsx
      {/* Conversation */}
      <div className="flex flex-col gap-5">
        {thread.messages.map((m, i) => (
          <div key={m.id}>
            {i > 0 && (
              <p
                aria-hidden
                className="mb-5 text-center font-serif text-[12px]"
                style={{
                  color: 'color-mix(in oklab, var(--text-primary) 35%, transparent)',
                  letterSpacing: '0.4em',
                }}
              >
                . . .
              </p>
            )}
            {firstThreadIdx > 0 && i === firstThreadIdx && (
              <p
                className="mb-4 text-center font-serif text-[10px] italic"
                style={{
                  color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)',
                  letterSpacing: '0.18em',
                }}
              >
                — from here, only you two can read these —
              </p>
            )}
            <MessageBlock
              isMine={m.isMine}
              body={
                m.encryptionTier === 'thread'
                  ? (decryptedBodies[m.id] ?? '✦ sealed')
                  : m.body
              }
              postmark={m.countryCode}
              createdAt={m.createdAt}
            />
          </div>
        ))}
      </div>
```

- [ ] **Step 5: Replace LetterCard with MessageBlock**

Replace the whole `LetterCard` function (and its `LetterCardProps` interface) with a plain block. Keep the existing `flagOf` helper in the file (MessageBlock uses it).

```tsx
// ───────────────────────────── MessageBlock ─────────────────────────────

interface MessageBlockProps {
  isMine: boolean
  body: string
  postmark: string | null
  createdAt: string
}

const MONTHS_MB = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function mbDate(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS_MB[d.getMonth()]} ${d.getDate()}`
}

function MessageBlock({ isMine, body, postmark, createdAt }: MessageBlockProps) {
  // Two-ink contrast that holds on every theme: you = ink, them = accent.
  const ink = isMine ? 'var(--text-primary)' : 'var(--accent-primary)'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={isMine ? 'self-end text-right' : 'self-start text-left'}
      style={{ maxWidth: '88%' }}
    >
      <p
        className="whitespace-pre-wrap font-serif"
        style={{ color: ink, fontSize: '16px', lineHeight: '1.55' }}
      >
        {body}
        <span
          className="ml-2 font-serif text-[11px] uppercase not-italic"
          style={{
            color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)',
            letterSpacing: '0.1em',
          }}
        >
          {postmark ? `${flagOf(postmark)} ` : ''}— {mbDate(createdAt)}
        </span>
      </p>
    </motion.div>
  )
}
```

(Note: `shortDate` from Step 1 and `mbDate` here are equivalent; `mbDate` is local to the component section to keep this block self-contained. Both may coexist.)

- [ ] **Step 6: Make ReplyPaper plain + app font**

Replace the `ReplyPaper` function with a plain, line-free, app-font version:

```tsx
function ReplyPaper({ draft, setDraft, disabled }: ReplyPaperProps) {
  return (
    <div
      className="relative"
      style={{
        padding: '12px 14px',
        background: 'color-mix(in oklab, var(--text-primary) 5%, transparent)',
        borderRadius: 10,
        border: '1px solid color-mix(in oklab, var(--text-primary) 15%, transparent)',
      }}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder="write back…"
        disabled={disabled}
        className="relative w-full resize-none bg-transparent font-serif focus:outline-none disabled:opacity-90"
        style={{
          color: 'var(--text-primary)',
          fontSize: '15px',
          lineHeight: '1.5',
          caretColor: 'var(--accent-primary)',
        }}
      />
    </div>
  )
}
```

- [ ] **Step 7: Typecheck**

Invoke the `typecheck` skill. Expected: clean. (If `shortDate` is reported unused, delete the Step 1 `shortDate` block — `mbDate` covers it.)

- [ ] **Step 8: Manual verification**

```bash
docker compose restart app
```
Open a correspondence with several messages. Verify: header reads `to <Letter>`; messages are plain text (no torn cards, no ruled lines) on one paper sheet; *your* lines are ink/right-aligned, *their* lines accent-colored/left-aligned; each line ends with `— APR DD` (and flag if set); ` . . . ` separates messages; reply box is plain with app font; sending still works; wave / skip / block / end-connection unchanged. Switch theme to **rivendell (dark)** and **sunset** — text stays legible and the two inks are distinguishable.

- [ ] **Step 9: Commit**

```bash
git add src/components/letters/lights/ThreadView.tsx
git commit -m "feat(stranger): plain themed correspondence, app font, monogram header"
```

---

## Task 7: Compose surfaces — remove ruled lines, use app font

**Files:**
- Modify: `src/components/letters/lights/ComposePaper.tsx`
- Modify: `src/components/letters/lights/MobileComposePaper.tsx`

- [ ] **Step 1: ComposePaper — remove the ruled-lines layer**

Delete this block (the ruled-lines `div`, currently lines ~234–243):

```tsx
            {/* Ruled lines, layered over the paper */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(transparent, transparent 1.7rem, color-mix(in oklab, var(--text-primary) 35%, transparent) 1.7rem, color-mix(in oklab, var(--text-primary) 35%, transparent) calc(1.7rem + 1px))',
                opacity: 0.35,
              }}
            />
```

- [ ] **Step 2: ComposePaper — switch the textarea to the app font**

In the `<textarea>` `style`, replace:

```tsx
                fontFamily: '"Caveat", "Patrick Hand", cursive',
```

with:

```tsx
                fontFamily: 'var(--font-serif), Georgia, serif',
```

- [ ] **Step 3: MobileComposePaper — switch the textarea to the app font**

In the `<textarea>` `style` (line ~85), replace:

```tsx
          fontFamily: 'var(--font-caveat), Georgia, serif',
          fontSize: '20px',
          lineHeight: '30px',
```

with:

```tsx
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: '17px',
          lineHeight: '28px',
```

- [ ] **Step 4: Typecheck**

Invoke the `typecheck` skill. Expected: clean.

- [ ] **Step 5: Manual verification**

```bash
docker compose restart app
```
Letters → "to a stranger" compose. Verify: paper has **no ruled lines**; body text is EB Garamond (serif), not handwriting; 0/200 counter, postmark picker, and the fold→ignite→drift send ceremony all still work. Check on rivendell (dark) + rose (light): paper + text + placeholder + counter all legible. Resize to mobile width and confirm the mobile compose textarea is also serif.

- [ ] **Step 6: Commit**

```bash
git add src/components/letters/lights/ComposePaper.tsx src/components/letters/lights/MobileComposePaper.tsx
git commit -m "feat(stranger): plain compose paper, app font"
```

---

## Task 8: Full-feature verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole feature**

Invoke the `typecheck` skill. Expected: no errors anywhere in `src/components/letters/lights/`, `src/hooks/useStrangerNotes.ts`, `src/app/api/stranger-notes/inbox/route.ts`, `src/lib/monogram.ts`.

- [ ] **Step 2: End-to-end manual check across three themes**

```bash
docker compose restart app
```
For each of **rivendell (dark)**, **rose (light)**, **sunset (warm)**:
1. Compose: themed plain paper, serif font, 200 counter, send ceremony plays, note sends.
2. New arrivals: unread threads float as planes (seed/reply to create one if needed); empty → "the sky is quiet".
3. All correspondence: rows show monogram + status (`N letters deep` / `pen pal` / `awaiting a reply`) + preview + date + unread dot; filter chips (`all / pen pals / strangers / sent`) re-query; "show more" appears and works when there are >30 threads.
4. Correspondence: plain sheet, monogram header, you=ink/right vs them=accent/left, `— APR DD` timestamps, ` . . . ` dividers, serif throughout; reply sends; pen-pal E2EE thread still encrypts/decrypts (`✦ sealed` shows in list preview for thread-tier).
5. Monograms everywhere are single uppercase letters — no two-word names remain in the UI.

- [ ] **Step 3: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix(stranger): redesign verification adjustments"
```

---

## Self-Review Notes

- **Spec coverage:** Compose (Task 7) · hybrid sky + list + pagination (Tasks 2–5) · correspondence redesign + two-ink + timestamps + dividers (Task 6) · monograms (Task 1, used in 4/5/6) · 200-char limit kept (unchanged in all textareas) · no migration (none present) · no tests (manual verification per convention). All covered.
- **Type consistency:** `InboxThread` (now incl. `messageCount`) is defined identically in `inbox/route.ts` and `useStrangerNotes.ts`; `StrangerFilter` and the `{threads, nextCursor, counters}` page shape match across hook + API; `monogram()` signature stable across all consumers.
- **Known v1 limitations (intentional):** sky derives unread from loaded threads under the current filter; cursor uses `id` with `[lastActivityAt desc, id desc]` ordering (ties across identical `lastActivityAt` are stable via id tiebreak).
