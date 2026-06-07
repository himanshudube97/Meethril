// src/app/letter/[token]/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  deriveLetterKey,
  decryptWithLetterKey,
  rawKeyToBase64,
} from '@/lib/letters/answer-crypto'
import { PasswordToggle } from '@/components/PasswordToggle'
import { LetterReveal } from '@/components/letters/recipient/LetterReveal'
import { useResolvedLetterPhotos } from '@/components/letters/recipient/useResolvedLetterPhotos'
import type { StrokeData } from '@/store/journal'

type LetterContent = {
  text: string
  song: string | null
  doodles: Array<{ strokes: unknown; spread: number; positionInEntry: number }>
}

type AssetMeta = {
  id: string
  type: string
  position: number
  spread: number
  rotation: number
  ordinal: number
}

type Meta = {
  scheduledFor: string | null
  senderName: string | null
  recipientName: string | null
  alreadyExpired: boolean
  firstReadAt: string | null
  salt: string
  question: string
  assets: AssetMeta[]
}

type CachedAsset = {
  id: string
  type: string
  position: number
  spread: number
  rotation: number
  ordinal: number
  ciphertext: string
  iv: string
}

type State =
  | { kind: 'loading_meta' }
  | { kind: 'not_yet'; scheduledFor: string }
  | { kind: 'expired' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'sealed'; meta: Meta; attempts: number; attempting: boolean; error: string | null }
  | {
      kind: 'unlocked'
      data: LetterContent
      meta: Meta
      expiresAt: Date
      letterKey: Uint8Array
      cachedAssets: CachedAsset[]
    }

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

export default function LetterPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading_meta' })
  const ranRef = useRef(false)
  const latestKeyRef = useRef<Uint8Array | null>(null)

  // Best-effort zeroize the in-memory letterKey when the page unmounts.
  // Matches the sender path's finally-block wipe in friend-letter-client.ts.
  useEffect(() => {
    return () => {
      latestKeyRef.current?.fill(0)
    }
  }, [])

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    async function loadMeta() {
      try {
        const metaRes = await fetch(`/api/letter/${params.token}/meta`)
        if (metaRes.status === 404) return setState({ kind: 'not_found' })
        if (!metaRes.ok) throw new Error(`meta ${metaRes.status}`)
        const meta = (await metaRes.json()) as Meta
        if (meta.alreadyExpired) return setState({ kind: 'expired' })
        if (!meta.scheduledFor) throw new Error('letter has no scheduledFor')
        const scheduledFor = new Date(meta.scheduledFor)
        if (scheduledFor.getTime() > Date.now()) {
          return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor })
        }
        setState({ kind: 'sealed', meta, attempts: 0, attempting: false, error: null })
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      }
    }
    loadMeta()
  }, [params.token])

  async function tryUnlock(answer: string) {
    if (state.kind !== 'sealed') return
    const meta = state.meta
    setState({ ...state, attempting: true, error: null })

    try {
      const letterKey = await deriveLetterKey(answer, meta.salt)
      latestKeyRef.current = letterKey

      const ctRes = await fetch(`/api/letter/${params.token}/ciphertext`)
      if (ctRes.status === 410) return setState({ kind: 'expired' })
      if (ctRes.status === 425) {
        return setState({ kind: 'not_yet', scheduledFor: meta.scheduledFor ?? '' })
      }
      if (ctRes.status === 404) return setState({ kind: 'not_found' })
      if (!ctRes.ok) throw new Error(`ciphertext ${ctRes.status}`)
      const { transientCiphertext, transientIV } = await ctRes.json()

      let plaintextBytes: Uint8Array
      try {
        plaintextBytes = await decryptWithLetterKey(transientCiphertext, transientIV, letterKey)
      } catch {
        setState({
          kind: 'sealed',
          meta,
          attempts: state.attempts + 1,
          attempting: false,
          error: 'the seal holds. try again?',
        })
        return
      }

      const data: LetterContent = JSON.parse(new TextDecoder().decode(plaintextBytes))

      await fetch(`/api/letter/${params.token}/opened`, { method: 'POST' }).catch(() => {})

      const cachedAssets: CachedAsset[] = []
      for (const a of meta.assets ?? []) {
        try {
          const r = await fetch(`/api/letter/${params.token}/asset/${a.id}`)
          if (!r.ok) continue
          const j = (await r.json()) as { ciphertext: string; iv: string }
          cachedAssets.push({
            id: a.id,
            type: a.type,
            position: a.position,
            spread: a.spread,
            rotation: a.rotation,
            ordinal: a.ordinal,
            ciphertext: j.ciphertext,
            iv: j.iv,
          })
        } catch {
          /* skip — Save flow can still proceed without this asset */
        }
      }

      try {
        sessionStorage.setItem(
          `${SESSION_KEY_PREFIX}${params.token}`,
          JSON.stringify({
            content: data,
            senderName: meta.senderName ?? 'Someone special',
            recipientName: meta.recipientName ?? 'Friend',
            scheduledFor: meta.scheduledFor,
            letterKey: rawKeyToBase64(letterKey),
            assets: cachedAssets,
          })
        )
      } catch {
        /* sessionStorage may be disabled or quota-exceeded; not fatal */
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      setState({ kind: 'unlocked', data, meta, expiresAt, letterKey, cachedAssets })
    } catch (e) {
      setState({
        kind: 'sealed',
        meta,
        attempts: state.attempts + 1,
        attempting: false,
        error: e instanceof Error ? e.message : 'Something went wrong.',
      })
    }
  }

  if (state.kind === 'loading_meta') {
    return <CenteredMessage title="Reading your letter" sub="just a moment" />
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
  if (state.kind === 'sealed') {
    return <SealedScene state={state} onSubmit={tryUnlock} />
  }

  return <UnlockedLetter token={params.token} state={state} router={router} />
}

function UnlockedLetter({
  token,
  state,
  router,
}: {
  token: string
  state: Extract<State, { kind: 'unlocked' }>
  router: ReturnType<typeof useRouter>
}) {
  const { photos } = useResolvedLetterPhotos(
    token,
    state.meta.assets ?? [],
    state.letterKey,
    state.cachedAssets,
  )
  const [keepBusy, setKeepBusy] = useState(false)

  async function onKeepForever() {
    setKeepBusy(true)
    try {
      const meRes = await fetch('/api/auth/me')
      router.push(meRes.ok ? `/letter/${token}/save?logged_in=1` : `/letter/${token}/save`)
    } catch {
      setKeepBusy(false)
    }
  }

  return (
    <LetterReveal
      senderName={state.meta.senderName ?? 'Someone special'}
      recipientName={state.meta.recipientName ?? 'Friend'}
      body={state.data.text}
      song={state.data.song}
      doodleStrokes={(state.data.doodles?.[0]?.strokes as StrokeData[]) ?? []}
      photos={photos}
      createdAt={state.meta.scheduledFor ? new Date(state.meta.scheduledFor) : new Date()}
      expiresAt={state.expiresAt}
      onKeepForever={onKeepForever}
      keepBusy={keepBusy}
    />
  )
}

function SealedScene({
  state,
  onSubmit,
}: {
  state: Extract<State, { kind: 'sealed' }>
  onSubmit: (answer: string) => void
}) {
  const [value, setValue] = useState('')
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f6efe2',
        color: '#3d342a',
        padding: 24,
        fontFamily: 'Georgia, serif',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
        <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 8 }}>
          {state.meta.senderName ?? 'Someone'} left you something
        </p>
        {state.meta.scheduledFor && (
          <p style={{ opacity: 0.5, fontSize: 12, marginBottom: 32 }}>
            sealed for {new Date(state.meta.scheduledFor).toLocaleDateString()}
          </p>
        )}

        <div
          aria-hidden
          style={{
            fontSize: 96,
            lineHeight: 1,
            marginBottom: 24,
            animation: state.attempting ? 'hearth-tremor 1.2s ease-in-out infinite' : undefined,
          }}
        >
          ✉
        </div>

        <p
          style={{
            fontStyle: 'italic',
            fontSize: 22,
            marginBottom: 16,
            opacity: 0.85,
          }}
        >
          {state.meta.question}
        </p>

        <p style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.55, marginBottom: 28 }}>
          Sealed end-to-end — even we can&apos;t read it.{' '}
          {state.meta.senderName ?? 'They'} locked it with something only the two of you would
          know. Your answer is the only key that opens it.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (state.attempting || !value.trim()) return
            onSubmit(value)
            setValue('')
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              type={showAnswer ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="whisper the answer…"
              autoFocus
              disabled={state.attempting}
              style={{
                width: '100%',
                padding: '12px 2.75rem',
                fontSize: 18,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #3d342a55',
                color: '#3d342a',
                outline: 'none',
                textAlign: 'center',
                fontFamily: 'inherit',
              }}
            />
            <PasswordToggle shown={showAnswer} onToggle={() => setShowAnswer((v) => !v)} color="#3d342a" />
          </div>
          <button
            type="submit"
            disabled={state.attempting || !value.trim()}
            style={{
              marginTop: 24,
              padding: '10px 24px',
              background: '#3d342a',
              color: '#f6efe2',
              border: 'none',
              borderRadius: 999,
              fontSize: 14,
              fontFamily: 'inherit',
              cursor: state.attempting ? 'wait' : 'pointer',
              opacity: state.attempting ? 0.6 : 1,
            }}
          >
            {state.attempting ? 'trying to break the seal…' : 'break the seal'}
          </button>
        </form>

        {state.error && (
          <p style={{ marginTop: 20, fontSize: 14, opacity: 0.7, fontStyle: 'italic' }}>
            {state.error}
          </p>
        )}

        {state.attempts >= 3 && state.meta.senderName && (
          <p style={{ marginTop: 16, fontSize: 13, opacity: 0.55, fontStyle: 'italic' }}>
            Stuck? You could ask {state.meta.senderName} for a hint — but they might not remember either.
          </p>
        )}

        <style>{`
          @keyframes hearth-tremor {
            0%, 100% { transform: translateX(0) rotate(0); }
            25% { transform: translateX(-2px) rotate(-1deg); }
            75% { transform: translateX(2px) rotate(1deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

function CenteredMessage({ title, sub }: { title: string; sub?: string }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
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
