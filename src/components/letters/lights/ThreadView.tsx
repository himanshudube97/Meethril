'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { monogram } from '@/lib/monogram'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
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
      try {
        const res = await fetch(`/api/stranger-notes/threads/${threadId}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }
        const data = await res.json()
        if (cancelled) return
        // The server returns `{ error }` shapes with non-ok statuses we already
        // filtered above, but a 200 with `{ error }` (e.g. middleware quirk)
        // would otherwise become a bogus `thread` object.
        if (!data || typeof data !== 'object' || data.error) {
          throw new Error(data?.error ?? 'thread unavailable')
        }
        setThread(data)
        if (data.waveEligible && !data.waveOfferedToMe) {
          onWavePromptShown().catch(() => {})
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "we couldn't open this thread",
          )
        }
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

  if (loadError) {
    return (
      <div
        className="p-6 font-serif text-sm flex flex-col items-center gap-3"
        style={{ color: 'var(--text-muted)' }}
      >
        <p className="italic">we couldn&apos;t open this thread.</p>
        <button
          type="button"
          onClick={onClose}
          className="underline text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          go back
        </button>
      </div>
    )
  }
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
    <div
      className="flex w-full max-w-md flex-col gap-5"
      style={{
        padding: '28px 26px 24px',
        background: 'var(--paper-1)',
        clipPath: LETTER_EDGE_CLIP,
        filter: 'drop-shadow(0 10px 28px rgba(60, 30, 10, 0.22))',
      }}
    >
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
            className="font-serif text-[20px]"
            style={{ color: 'var(--text-primary)' }}
          >
            to {monogram(thread.partnerDisplayName)}
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

      {/* Conversation */}
      <div className="flex flex-col gap-5">
        {thread.messages.map((m, i) => (
          <div key={m.id} className="flex flex-col">
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
            setSendError(null)
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
            } catch (err) {
              setSendError(
                err instanceof Error
                  ? "couldn't send — your message is still here, tap send to try again."
                  : "couldn't send. tap send to try again.",
              )
              // Keep `draft` populated so the user doesn't lose the text.
            } finally {
              setSending(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <ReplyPaper draft={draft} setDraft={setDraft} disabled={sending} />
          {sendError && (
            <p
              className="font-serif text-[11px] italic"
              style={{ color: 'color-mix(in oklab, red 70%, var(--text-primary) 30%)' }}
            >
              {sendError}
            </p>
          )}
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

// ───────────────────────────── MessageBlock ─────────────────────────────

interface MessageBlockProps {
  isMine: boolean
  body: string
  postmark: string | null
  createdAt: string
}

function flagOf(code: string): string {
  const upper = code.toUpperCase()
  if (upper.length !== 2) return ''
  const base = 0x1f1e6 - 'A'.charCodeAt(0)
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1))
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
