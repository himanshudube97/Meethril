// src/components/letters/AskForCopyButton.tsx
'use client'
import { useState } from 'react'

export function AskForCopyButton({
  letterId,
  recipientName,
}: {
  letterId: string
  recipientName: string | null
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [err, setErr] = useState<string | null>(null)

  async function onClick() {
    setState('sending'); setErr(null)
    const res = await fetch(`/api/letters/${letterId}/ask-for-copy`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Could not send.')
      setState('error')
      return
    }
    setState('sent')
  }

  if (state === 'sent') return <span style={{ fontSize: 12, opacity: 0.6, fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic' }}>Asked.</span>
  return (
    <button
      onClick={onClick}
      disabled={state === 'sending'}
      style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid rgba(61, 52, 42, 0.2)',
        background: 'transparent',
        color: 'var(--text-primary, #3d342a)',
        cursor: 'pointer',
        opacity: state === 'sending' ? 0.5 : 1,
        fontFamily: 'Cormorant Garamond, serif',
        fontStyle: 'italic',
        letterSpacing: 0.3,
      }}
    >
      Ask {recipientName ?? 'them'} for a copy
      {err && <span style={{ marginLeft: 8, color: '#a00' }}>{err}</span>}
    </button>
  )
}
