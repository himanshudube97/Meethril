'use client'

import { useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme'
import {
  useStrangerThreadKey,
  encryptThreadMessage,
  decryptThreadMessage,
} from '@/hooks/useStrangerThreadKey'

interface ThreadMessage {
  id: string
  isMine: boolean
  encryptionTier: 'server' | 'thread'
  body: string // pre-decrypted for server; ciphertext for thread (we display "[encrypted]" if no key)
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

export default function ThreadView({
  threadId,
  onClose,
  onReply,
  onSkip,
  onBlock,
  onWavePromptShown,
  onWave,
}: Props) {
  const { theme } = useThemeStore()
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

  if (!thread) return <div className="p-6 text-sm opacity-70">Loading…</div>

  // Find pre-wave / post-wave boundary: index of first 'thread' tier message
  const firstThreadIdx = thread.messages.findIndex((m) => m.encryptionTier === 'thread')

  return (
    <div
      className="w-full max-w-md rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: theme.glass.bg,
        border: `1px solid ${theme.glass.border}`,
        backdropFilter: `blur(${theme.glass.blur})`,
      }}
    >
      <div className="flex justify-between items-baseline">
        <h3 style={{ color: theme.text.primary }} className="text-sm font-medium">
          {thread.partnerDisplayName}
        </h3>
        <button onClick={onClose} className="text-xs opacity-60 hover:opacity-100">
          close
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
        {thread.messages.map((m, i) => (
          <div key={m.id}>
            {firstThreadIdx > 0 && i === firstThreadIdx && (
              <div className="text-center text-xs opacity-60 my-3" style={{ color: theme.text.muted }}>
                — From here, only you two can read these —
              </div>
            )}
            <div
              className={`text-sm py-2 px-3 rounded-md ${m.isMine ? 'text-right' : ''}`}
              style={{
                color: theme.text.secondary,
                background: m.isMine ? `${theme.accent.primary}15` : `${theme.accent.warm}15`,
              }}
            >
              {m.encryptionTier === 'thread'
                ? (decryptedBodies[m.id] ?? '[encrypted]')
                : m.body}
              {m.countryCode && (
                <span className="ml-2 text-xs opacity-60" style={{ color: theme.text.muted }}>
                  · {m.stateName ? `${m.stateName}, ` : ''}{m.countryCode}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {thread.waveEligible && !thread.myWaveCast && thread.status === 'active' && (
        <div className="p-3 rounded-md flex flex-col gap-2" style={{ background: `${theme.accent.warm}20` }}>
          <p className="text-sm" style={{ color: theme.text.primary }}>
            You&apos;ve shared a few notes. Would you like to keep writing to this stranger?
          </p>
          <button
            type="button"
            onClick={onWave}
            className="self-start px-4 py-1.5 rounded-full text-xs font-medium"
            style={{ background: theme.accent.primary, color: theme.bg.primary }}
          >
            🪶 Yes, wave back
          </button>
        </div>
      )}

      {(thread.status === 'active' || thread.status === 'pen_pal') && (
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
                // Refresh thread so the new message appears.
                const refreshed = await fetch(`/api/stranger-notes/threads/${threadId}`, { credentials: 'include' })
                if (refreshed.ok) setThread(await refreshed.json())
              } else {
                await onReply(draft.trim())
              }
              setDraft('')
            } finally {
              setSending(false)
            }
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={200}
            placeholder="Write back…"
            className="w-full p-2 rounded-md text-sm resize-none"
            rows={3}
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              color: theme.text.primary,
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs opacity-60" style={{ color: theme.text.muted }}>
              {draft.length}/200
            </span>
            <button
              type="submit"
              disabled={sending || draft.trim().length < 10}
              className="px-4 py-1.5 rounded-full text-xs font-medium disabled:opacity-50"
              style={{ background: theme.accent.primary, color: theme.bg.primary }}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-3 pt-2 text-xs opacity-60">
        <button onClick={onSkip} className="hover:opacity-100">
          Skip
        </button>
        <button onClick={onBlock} className="hover:opacity-100">
          Block
        </button>
      </div>
    </div>
  )
}
