// src/app/letter/[token]/save/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useE2EEStore } from '@/store/e2ee'
import { encryptString } from '@/lib/e2ee/crypto'

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

interface CachedLetter {
  content: { text: string; song: string | null; photos: unknown[]; doodles: unknown[] }
  senderName: string
  recipientName: string
  scheduledFor: string
}

export default function SavePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const search = useSearchParams()
  const loggedInHint = search.get('logged_in') === '1'

  const masterKey = useE2EEStore((s) => s.masterKey)
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'need_otp' }
    | { kind: 'saving' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function run() {
      // Pull cached decrypted content from sessionStorage
      const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${params.token}`)
      if (!raw) {
        setState({
          kind: 'error',
          message: 'We lost the decrypted letter. Please reopen the original link to try again.',
        })
        return
      }
      const cached: CachedLetter = JSON.parse(raw)

      // Branch 1: already logged in + unlocked
      if (loggedInHint && masterKey) {
        setState({ kind: 'saving' })
        const { ciphertext, iv } = await encryptString(
          JSON.stringify(cached.content),
          masterKey
        )
        const res = await fetch('/api/letters/save-received', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            publicToken: params.token,
            contentCiphertext: ciphertext,
            contentIVs: { content: iv },
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          if (!cancelled) setState({ kind: 'error', message: j.error ?? 'Save failed.' })
          return
        }
        sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${params.token}`)
        if (!cancelled) setState({ kind: 'done' })
        setTimeout(() => router.push('/me'), 1200)
        return
      }

      // Branch 2: not logged in → OTP flow (Task 14 fills this in)
      if (!cancelled) setState({ kind: 'need_otp' })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [params.token, masterKey, loggedInHint, router])

  if (state.kind === 'loading') {
    return <Centered title="Saving your letter..." />
  }
  if (state.kind === 'saving') {
    return <Centered title="Encrypting and saving..." sub="Just a few seconds." />
  }
  if (state.kind === 'done') {
    return <Centered title="Saved." sub="Your letter is in your Hearth account." />
  }
  if (state.kind === 'error') {
    return <Centered title="We couldn't save the letter." sub={state.message} />
  }
  if (state.kind === 'need_otp') {
    return <OtpFlow token={params.token} />
  }
  return null
}

function Centered({ title, sub }: { title: string; sub?: string }) {
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
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>{title}</h1>
        {sub && <p style={{ opacity: 0.7 }}>{sub}</p>}
      </div>
    </div>
  )
}

// Task 14 implements this component.
function OtpFlow({ token: _ }: { token: string }) {
  return <Centered title="Sign in to keep this letter" sub="(OTP flow not yet wired — Task 14)" />
}
