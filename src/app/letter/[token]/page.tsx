// src/app/letter/[token]/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { tlockDecryptKey } from '@/lib/letters/tlock'
import { decryptTransient } from '@/lib/letters/transient-crypto'

type LetterContent = {
  text: string
  song: string | null
  photos: Array<{ url: string; position: number; spread: number; rotation: number }>
  doodles: unknown[]
}

type State =
  | { kind: 'loading'; stage: string }
  | { kind: 'not_yet'; scheduledFor: string }
  | { kind: 'expired' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: LetterContent; senderName: string; recipientName: string; expiresAt: Date }

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

export default function LetterPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading', stage: 'reading link' })
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    async function run() {
      try {
        // 1) URL fragment carries the tlocked key
        const hash = typeof window !== 'undefined' ? window.location.hash : ''
        const m = hash.match(/(?:^#|&)k=([^&]+)/)
        if (!m) {
          setState({ kind: 'error', message: 'Missing key in URL. The letter link is incomplete.' })
          return
        }
        const tlockedKey = decodeURIComponent(m[1])

        // 2) Meta
        setState({ kind: 'loading', stage: 'fetching letter info' })
        const metaRes = await fetch(`/api/letter/${params.token}/meta`)
        if (metaRes.status === 404) return setState({ kind: 'not_found' })
        if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`)
        const meta = (await metaRes.json()) as {
          scheduledFor: string | null
          senderName: string | null
          recipientName: string | null
          alreadyExpired: boolean
        }
        if (meta.alreadyExpired) return setState({ kind: 'expired' })
        if (!meta.scheduledFor) throw new Error('letter has no scheduledFor')
        const scheduledFor = new Date(meta.scheduledFor)
        if (scheduledFor.getTime() > Date.now()) {
          return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        }

        // 3) Tlock-decrypt K (drand round must be available)
        setState({ kind: 'loading', stage: 'fetching time-lock beacon' })
        const K = await tlockDecryptKey(tlockedKey, scheduledFor)

        // 4) Fetch ciphertext (sets firstReadAt server-side)
        setState({ kind: 'loading', stage: 'fetching ciphertext' })
        const ctRes = await fetch(`/api/letter/${params.token}/ciphertext`)
        if (ctRes.status === 410) return setState({ kind: 'expired' })
        if (ctRes.status === 425) return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        if (ctRes.status === 404) return setState({ kind: 'not_found' })
        if (!ctRes.ok) throw new Error(`ciphertext ${ctRes.status}`)
        const { transientCiphertext, transientIV } = await ctRes.json()

        // 5) AES-decrypt with K
        setState({ kind: 'loading', stage: 'decrypting' })
        const plaintextBytes = await decryptTransient(transientCiphertext, transientIV, K)
        const json = new TextDecoder().decode(plaintextBytes)
        const data: LetterContent = JSON.parse(json)

        // Cache decrypted content for the Keep-forever flow (sessionStorage,
        // tab-scoped). Cleared after save.
        try {
          sessionStorage.setItem(
            `${SESSION_KEY_PREFIX}${params.token}`,
            JSON.stringify({
              content: data,
              senderName: meta.senderName ?? 'Someone special',
              recipientName: meta.recipientName ?? 'Friend',
              scheduledFor: meta.scheduledFor,
            })
          )
        } catch {
          /* sessionStorage might be disabled; not fatal */
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
        setState({
          kind: 'ok',
          data,
          senderName: meta.senderName ?? 'Someone special',
          recipientName: meta.recipientName ?? 'Friend',
          expiresAt,
        })
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    }
    run()
  }, [params.token])

  if (state.kind === 'loading') {
    return <CenteredMessage title="Reading your letter" sub={state.stage} />
  }
  if (state.kind === 'not_yet') {
    return (
      <CenteredMessage
        title="This letter isn't ready yet."
        sub={`It will unlock on ${new Date(state.scheduledFor).toLocaleString()}.`}
      />
    )
  }
  if (state.kind === 'expired') {
    return <CenteredMessage title="This letter has faded." sub="It was yours for 24 hours after you opened it. We don't keep copies." />
  }
  if (state.kind === 'not_found') {
    return <CenteredMessage title="We couldn't find this letter." sub="The link may be incorrect, or the letter was deleted." />
  }
  if (state.kind === 'error') {
    return <CenteredMessage title="Something went wrong." sub={state.message} />
  }

  // OK — render the letter
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f6efe2',
        color: '#3d342a',
        padding: '40px 24px',
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ opacity: 0.6, fontSize: 14, marginBottom: 24 }}>
          From <strong>{state.senderName}</strong> · For <strong>{state.recipientName}</strong>
        </div>
        <Countdown expiresAt={state.expiresAt} />
        <article
          style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 18 }}
          dangerouslySetInnerHTML={{ __html: state.data.text }}
        />
        {state.data.song && (
          <p style={{ marginTop: 32, fontSize: 14, opacity: 0.7 }}>
            Song they sent: <a href={state.data.song}>{state.data.song}</a>
          </p>
        )}
        <KeepForeverCTA token={params.token} router={router} />
      </div>
    </div>
  )
}

function CenteredMessage({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6efe2',
        color: '#3d342a',
        padding: 24,
        fontFamily: 'Georgia, serif',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>{title}</h1>
        {sub && <p style={{ opacity: 0.7 }}>{sub}</p>}
      </div>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: Date }) {
  const [remaining, setRemaining] = useState(expiresAt.getTime() - Date.now())
  useEffect(() => {
    const id = setInterval(() => setRemaining(expiresAt.getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  if (remaining <= 0) return null
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  return (
    <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 24 }}>
      This letter fades in {h}h {m}m.
    </p>
  )
}

function KeepForeverCTA({ token, router }: { token: string; router: ReturnType<typeof useRouter> }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function onSave() {
    setBusy(true); setErr(null)
    try {
      // Check whether the recipient is logged in. /api/auth/me returns 401 if not.
      const meRes = await fetch('/api/auth/me')
      if (meRes.ok) {
        // Logged in — drive the save inline (Task 13).
        router.push(`/letter/${token}/save?logged_in=1`)
      } else {
        // Not logged in — magic-link signup flow (Task 14).
        router.push(`/letter/${token}/save`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
      setBusy(false)
    }
  }
  return (
    <div style={{ marginTop: 48 }}>
      <button
        disabled={busy}
        onClick={onSave}
        style={{
          padding: '12px 24px',
          background: '#3d342a',
          color: '#f6efe2',
          border: 'none',
          borderRadius: 999,
          fontFamily: 'inherit',
          fontSize: 15,
          cursor: 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? 'Just a moment...' : 'Keep this letter forever'}
      </button>
      {err && <p style={{ color: '#a00', marginTop: 12 }}>{err}</p>}
    </div>
  )
}
