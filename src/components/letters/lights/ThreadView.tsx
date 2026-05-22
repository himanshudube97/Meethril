'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  useStrangerThreadKey,
  encryptThreadMessage,
  decryptThreadMessage,
} from '@/hooks/useStrangerThreadKey'

interface ThreadMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  body: string
  countryCode: string | null
  stateName: string | null
  createdAt: string
}

interface ThreadDetail {
  id: string
  status: 'unmatched' | 'active' | 'pen_pal' | 'closed_unwaved'
  partnerDisplayName: string
  myDisplayName: string
  partnerUserId: string | null
  iAmThreadSender: boolean
  waveEligible: boolean
  waveOfferedToMe: boolean
  myWaveCast: boolean
  pendingKeyExchange: boolean
  myWrappedKey: string | null
  messages: ThreadMessage[]
}

interface Props {
  threadId: string
  onClose: () => void
  onReply: (content: string) => Promise<void>
  onSkip: () => Promise<void>
  onBlock: () => Promise<void>
  onWavePromptShown: () => Promise<void>
  onWave: () => Promise<void>
}

// Smaller, tighter torn-edge polygon for individual letters.
const LETTER_EDGE_CLIP =
  'polygon(' +
  [
    '0% 3%', '3% 0%', '8% 2%', '15% 0%', '23% 1%', '32% 0%', '42% 2%', '52% 0%',
    '62% 2%', '72% 0%', '82% 1%', '90% 0%', '97% 2%', '100% 5%',
    '99% 15%', '100% 28%', '98% 42%', '100% 58%', '99% 72%', '100% 85%', '98% 95%',
    '95% 100%', '85% 98%', '72% 100%', '58% 99%', '42% 100%', '28% 98%', '15% 100%',
    '5% 99%', '0% 95%',
    '1% 82%', '0% 68%', '2% 55%', '0% 42%', '1% 28%', '0% 15%',
  ].join(', ') +
  ')'

export default function ThreadView({
  threadId,
  onClose,
  onReply,
  onSkip,
  onBlock,
  onWavePromptShown,
  onWave,
}: Props) {
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const { threadKey } = useStrangerThreadKey({
    threadId: thread?.status === 'pen_pal' ? threadId : null,
    status: thread?.status ?? null,
    pendingKeyExchange: thread?.pendingKeyExchange ?? false,
    iAmThreadSender: thread?.iAmThreadSender ?? false,
    myWrappedKey: thread?.myWrappedKey ?? null,
    partnerUserId: thread?.partnerUserId ?? null,
  })
  const [decryptedBodies, setDecryptedBodies] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/stranger-notes/threads/${threadId}`, { credentials: 'include' })
      const data = await res.json()
      if (!cancelled) setThread(data)
      if (data.waveEligible && !data.waveOfferedToMe) {
        onWavePromptShown().catch(() => {})
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [threadId, onWavePromptShown])

  useEffect(() => {
    if (!thread || !threadKey) return
    let cancelled = false
    ;(async () => {
      const out: Record<string, string> = {}
      for (const m of thread.messages) {
        if (m.encryptionTier === 'thread') {
          try {
            out[m.id] = await decryptThreadMessage(m.body, threadKey)
          } catch {
            out[m.id] = '[unreadable]'
          }
        }
      }
      if (!cancelled) setDecryptedBodies(out)
    })()
    return () => {
      cancelled = true
    }
  }, [thread, threadKey])

  if (!thread) {
    return (
      <div className="p-6 font-serif text-sm italic" style={{ color: 'var(--text-muted)' }}>
        loading…
      </div>
    )
  }

  // closed_unwaved: silent fold-away
  if (thread.status === 'closed_unwaved') {
    return (
      <EmptyState message="this exchange has folded itself away." onClose={onClose} />
    )
  }

  // partner deleted their account
  const partnerGone =
    (thread.status === 'active' || thread.status === 'pen_pal') &&
    thread.partnerDisplayName === 'A wandering light'
  if (partnerGone) {
    return <EmptyState message="this stranger has left." onClose={onClose} />
  }

  const lastMsg = thread.messages[thread.messages.length - 1]
  const latestIsMine = lastMsg?.isMine ?? false
  const isUnmatched = thread.status === 'unmatched'
  const canReply =
    !isUnmatched &&
    !latestIsMine &&
    (thread.status === 'active' || thread.status === 'pen_pal')

  const firstThreadIdx = thread.messages.findIndex((m) => m.encryptionTier === 'thread')

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      {/* Header with partner name + close */}
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span
            className="font-serif text-[10px] uppercase italic"
            style={{
              color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
              letterSpacing: '0.22em',
            }}
          >
            {thread.status === 'pen_pal' ? 'pen pal' : 'a stranger'}
          </span>
          <h3
            className="font-serif text-[18px] italic"
            style={{ color: 'var(--text-primary)' }}
          >
            {thread.partnerDisplayName}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="font-serif text-[12px] italic underline-offset-2 hover:underline"
          style={{ color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)' }}
        >
          close
        </button>
      </header>

      {/* Letters stack */}
      <div className="flex flex-col gap-4">
        {thread.messages.map((m, i) => (
          <div key={m.id}>
            {firstThreadIdx > 0 && i === firstThreadIdx && (
              <p
                className="my-3 text-center font-serif text-[10px] italic"
                style={{
                  color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)',
                  letterSpacing: '0.18em',
                }}
              >
                — from here, only you two can read these —
              </p>
            )}
            <LetterCard
              isMine={m.isMine}
              body={
                m.encryptionTier === 'thread'
                  ? (decryptedBodies[m.id] ?? '✦ sealed')
                  : m.body
              }
              postmark={m.countryCode}
              displayName={m.isMine ? thread.myDisplayName : thread.partnerDisplayName}
            />
          </div>
        ))}
      </div>

      {/* Wave-back prompt */}
      {thread.waveEligible && !thread.myWaveCast && thread.status === 'active' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col gap-2 rounded-md p-4"
          style={{
            background: 'color-mix(in oklab, var(--accent-warm) 14%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent-warm) 32%, transparent)',
          }}
        >
          <p
            className="font-serif text-[14px] italic"
            style={{ color: 'var(--text-primary)' }}
          >
            you&apos;ve shared a few letters. would you like to keep writing to this stranger?
          </p>
          <button
            type="button"
            onClick={onWave}
            className="self-start rounded-full px-4 py-1.5 font-serif text-[12px] italic"
            style={{
              background: 'var(--accent-primary)',
              color: 'var(--paper-1)',
              letterSpacing: '0.04em',
            }}
          >
            🪶 yes, wave back
          </button>
        </motion.div>
      )}

      {/* Reply form OR waiting line */}
      {canReply ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!draft.trim() || sending) return
            setSending(true)
            try {
              if (thread.status === 'pen_pal' && threadKey) {
                const ciphertext = await encryptThreadMessage(draft.trim(), threadKey)
                const res = await fetch(
                  `/api/stranger-notes/threads/${encodeURIComponent(threadId)}/messages`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ encryptionTier: 'thread', ciphertext }),
                  }
                )
                if (!res.ok) throw new Error('Failed to send')
                const refreshed = await fetch(`/api/stranger-notes/threads/${threadId}`, {
                  credentials: 'include',
                })
                if (refreshed.ok) setThread(await refreshed.json())
              } else {
                await onReply(draft.trim())
                // Reload thread so the new message appears + form goes away (latestIsMine becomes true)
                const refreshed = await fetch(`/api/stranger-notes/threads/${threadId}`, {
                  credentials: 'include',
                })
                if (refreshed.ok) setThread(await refreshed.json())
              }
              setDraft('')
            } finally {
              setSending(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <ReplyPaper draft={draft} setDraft={setDraft} disabled={sending} />
          <div className="flex items-center justify-between">
            <span
              className="font-serif text-[11px] italic"
              style={{
                color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
              }}
            >
              {draft.length}/200
            </span>
            <button
              type="submit"
              disabled={sending || draft.trim().length < 10}
              className="rounded-full px-4 py-1.5 font-serif text-[12px] italic transition-opacity disabled:opacity-40"
              style={{
                background: 'var(--accent-primary)',
                color: 'var(--paper-1)',
                letterSpacing: '0.04em',
              }}
            >
              {sending ? 'sending…' : 'send'}
            </button>
          </div>
        </form>
      ) : (
        <WaitingLine isUnmatched={isUnmatched} />
      )}

      {/* Bottom actions */}
      <div
        className="flex gap-4 pt-2 font-serif text-[11px] italic"
        style={{
          color: 'color-mix(in oklab, var(--text-primary) 50%, transparent)',
        }}
      >
        <button onClick={onSkip} className="underline-offset-2 hover:underline">
          set aside
        </button>
        <button onClick={onBlock} className="underline-offset-2 hover:underline">
          block
        </button>
        {thread.status === 'pen_pal' && (
          <button
            onClick={async () => {
              if (confirm('end this connection? the thread will be erased on both sides.')) {
                await fetch(`/api/stranger-notes/threads/${threadId}`, {
                  method: 'DELETE',
                  credentials: 'include',
                })
                onClose()
              }
            }}
            className="underline-offset-2 hover:underline"
          >
            end connection
          </button>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────── LetterCard ─────────────────────────────

interface LetterCardProps {
  isMine: boolean
  body: string
  postmark: string | null
  displayName: string
}

function flagOf(code: string): string {
  const upper = code.toUpperCase()
  if (upper.length !== 2) return ''
  const base = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1))
}

function LetterCard({ isMine, body, postmark, displayName }: LetterCardProps) {
  // Subtle tilt — partner's letters lean left, yours lean right.
  const tilt = isMine ? 1.2 : -1.5
  // Different shade so the eye instantly groups same-author messages.
  const paperVar = isMine ? 'var(--paper-2)' : 'var(--paper-1)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`relative ${isMine ? 'ml-6 self-end' : 'mr-6 self-start'}`}
      style={{
        transform: `rotate(${tilt}deg)`,
        maxWidth: '85%',
      }}
    >
      <div
        className="relative"
        style={{
          padding: '14px 18px 12px',
          background: `radial-gradient(
            ellipse at center,
            ${paperVar} 0%,
            ${paperVar} 60%,
            color-mix(in oklab, ${paperVar} 70%, #3a2008) 100%
          )`,
          clipPath: LETTER_EDGE_CLIP,
          filter: 'drop-shadow(0 4px 12px rgba(60, 30, 10, 0.18))',
        }}
      >
        {/* Subtle ruled lines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(transparent, transparent 1.3rem, color-mix(in oklab, var(--text-primary) 28%, transparent) 1.3rem, color-mix(in oklab, var(--text-primary) 28%, transparent) calc(1.3rem + 1px))',
            opacity: 0.3,
          }}
        />

        {/* From label */}
        <p
          className="relative mb-1 font-serif text-[10px] italic"
          style={{
            color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)',
            letterSpacing: '0.1em',
          }}
        >
          {isMine ? 'you wrote' : `${displayName} wrote`}
          {postmark && (
            <span className="ml-2">
              <span className="mr-1">{flagOf(postmark)}</span>
            </span>
          )}
        </p>

        {/* Body */}
        <p
          className="relative whitespace-pre-wrap leading-[1.3rem]"
          style={{
            color: 'var(--text-primary)',
            fontFamily: '"Caveat", "Patrick Hand", cursive',
            fontSize: '15px',
          }}
        >
          {body}
        </p>
      </div>
    </motion.div>
  )
}

// ───────────────────────────── Reply paper ─────────────────────────────

interface ReplyPaperProps {
  draft: string
  setDraft: (s: string) => void
  disabled: boolean
}

function ReplyPaper({ draft, setDraft, disabled }: ReplyPaperProps) {
  return (
    <div
      className="relative"
      style={{
        padding: '14px 18px 14px',
        background: `radial-gradient(
          ellipse at center,
          var(--paper-1) 0%,
          var(--paper-1) 60%,
          color-mix(in oklab, var(--paper-1) 70%, #3a2008) 100%
        )`,
        clipPath: LETTER_EDGE_CLIP,
        filter: 'drop-shadow(0 6px 16px rgba(60, 30, 10, 0.2))',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(transparent, transparent 1.3rem, color-mix(in oklab, var(--text-primary) 28%, transparent) 1.3rem, color-mix(in oklab, var(--text-primary) 28%, transparent) calc(1.3rem + 1px))',
          opacity: 0.3,
        }}
      />
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={200}
        rows={3}
        placeholder="write back…"
        disabled={disabled}
        className="relative w-full resize-none bg-transparent leading-[1.3rem] focus:outline-none disabled:opacity-90"
        style={{
          color: 'var(--text-primary)',
          fontFamily: '"Caveat", "Patrick Hand", cursive',
          fontSize: '15px',
          caretColor: 'var(--accent-warm)',
        }}
      />
    </div>
  )
}

// ───────────────────────────── Empty / waiting ─────────────────────────────

function EmptyState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 py-12 text-center">
      <p
        className="font-serif text-[15px] italic"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 70%, transparent)' }}
      >
        {message}
      </p>
      <button
        onClick={onClose}
        className="font-serif text-[12px] italic underline-offset-2 hover:underline"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 55%, transparent)' }}
      >
        close
      </button>
    </div>
  )
}

function WaitingLine({ isUnmatched }: { isUnmatched: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-center">
      <p
        className="font-serif text-[13px] italic"
        style={{ color: 'color-mix(in oklab, var(--text-primary) 65%, transparent)' }}
      >
        {isUnmatched
          ? 'your light is still traveling through the night…'
          : 'you let your last letter travel. waiting for them to write back.'}
      </p>
      <p
        className="font-serif text-[10px]"
        style={{
          color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)',
          letterSpacing: '0.18em',
        }}
      >
        no rush. it will arrive when it arrives.
      </p>
    </div>
  )
}
