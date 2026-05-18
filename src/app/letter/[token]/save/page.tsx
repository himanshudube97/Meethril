// src/app/letter/[token]/save/page.tsx
'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useE2EEStore } from '@/store/e2ee'
import { encryptString, encryptBytes } from '@/lib/e2ee/crypto'
import { decryptWithLetterKey, rawKeyFromBase64 } from '@/lib/letters/answer-crypto'

const SESSION_KEY_PREFIX = 'hearth.letter.decrypted.'

interface CachedLetter {
  content: { text: string; song: string | null; doodles: unknown[] }
  senderName: string
  recipientName: string
  scheduledFor: string
  letterKey?: string // base64-encoded raw 32-byte AES-GCM key
  assets?: Array<{
    id: string
    type: string
    position: number
    spread: number
    rotation: number
    ordinal: number
    ciphertext: string
    iv: string
  }>
}

type PhotoRef = {
  encryptedRef: string
  encryptedRefIV: string
  position: number
  spread: number
  rotation: number
  ordinal: number
}

/**
 * For each photo asset cached from the read page:
 * 1. Decrypt the asset bytes using the letter key.
 * 2. Re-encrypt under the recipient's master key.
 * 3. Upload to /api/photos (raw binary body).
 * 4. Pack the resulting handle + iv into an encryptedRef (same shape as
 *    EntryPhoto.encryptedRef in the main journal).
 */
async function uploadKeptPhotos(args: {
  rawKey: Uint8Array
  assets: NonNullable<CachedLetter['assets']>
  masterKey: CryptoKey
}): Promise<PhotoRef[]> {
  const photoRefs: PhotoRef[] = []
  for (const a of args.assets) {
    if (a.type !== 'photo') continue
    // 1. Decrypt under letter key
    const bytes = await decryptWithLetterKey(a.ciphertext, a.iv, args.rawKey)
    // 2. Re-encrypt under recipient's master key
    const { ciphertext: photoCt, iv: photoIv } = await encryptBytes(
      bytes.buffer as ArrayBuffer,
      args.masterKey,
    )
    // 3. Upload to recipient's photo storage (raw binary body)
    const upRes = await fetch('/api/photos', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: Uint8Array.from(atob(photoCt), (c) => c.charCodeAt(0)),
    })
    if (!upRes.ok) throw new Error('Could not save photo to your account')
    const { handle } = (await upRes.json()) as { handle: string }
    // 4. Pack the ref — same shape as EntryPhoto.encryptedRef
    const refJson = JSON.stringify({ handle, iv: photoIv })
    const { ciphertext: encryptedRef, iv: encryptedRefIV } = await encryptString(
      refJson,
      args.masterKey,
    )
    photoRefs.push({
      encryptedRef,
      encryptedRefIV,
      position: a.position,
      spread: a.spread,
      rotation: a.rotation,
      ordinal: a.ordinal,
    })
  }
  return photoRefs
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
        const rawKey = cached.letterKey ? rawKeyFromBase64(cached.letterKey) : null
        const photoRefs =
          rawKey && cached.assets && cached.assets.length > 0
            ? await uploadKeptPhotos({ rawKey, assets: cached.assets, masterKey })
            : []
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
            photoRefs,
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

function OtpFlow({ token }: { token: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<'email' | 'code' | 'onboarding' | 'saving' | 'done' | 'error'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const masterKey = useE2EEStore((s) => s.masterKey)
  const showSetupModal = useE2EEStore((s) => s.showSetupModal)
  const setShowSetupModal = useE2EEStore((s) => s.setShowSetupModal)

  async function sendCode() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Could not send code.')
      }
      setStage('code')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
    } finally { setBusy(false) }
  }

  async function verifyCode() {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'verify_otp', email, token: code }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error ?? 'Invalid code.')
      }
      // Force E2EE onboarding modal — the new user has no master key yet.
      setShowSetupModal(true)
      setStage('onboarding')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
    } finally { setBusy(false) }
  }

  // When onboarding completes, the e2ee store sets masterKey. Watch for it
  // and trigger the save automatically.
  useEffect(() => {
    if (stage !== 'onboarding') return
    if (!masterKey) return
    if (showSetupModal) return // user hasn't finished yet
    ;(async () => {
      setStage('saving')
      try {
        const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${token}`)
        if (!raw) throw new Error('Lost the decrypted letter — try reopening the original link.')
        const cached: CachedLetter = JSON.parse(raw)
        const rawKey = cached.letterKey ? rawKeyFromBase64(cached.letterKey) : null
        const photoRefs =
          rawKey && cached.assets && cached.assets.length > 0
            ? await uploadKeptPhotos({ rawKey, assets: cached.assets, masterKey })
            : []
        const { ciphertext, iv } = await encryptString(JSON.stringify(cached.content), masterKey)
        const r = await fetch('/api/letters/save-received', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            publicToken: token,
            contentCiphertext: ciphertext,
            contentIVs: { content: iv },
            photoRefs,
          }),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.error ?? 'Save failed.')
        }
        sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${token}`)
        setStage('done')
        setTimeout(() => router.push('/me'), 1200)
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'unknown error')
        setStage('error')
      }
    })()
  }, [stage, masterKey, showSetupModal, token, router])

  // Render
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
      }}
    >
      <div style={{ maxWidth: 420, width: '100%' }}>
        {stage === 'email' && (
          <>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Sign up to keep this letter</h1>
            <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 15 }}>
              We&apos;ll email you a 6-digit code. Saving the letter takes one minute.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              style={{ width: '100%', padding: '12px 16px', fontSize: 16, borderRadius: 8, border: '1px solid #3d342a33', background: '#fff' }}
            />
            <button onClick={sendCode} disabled={busy || !email} style={primaryBtn}>Send code</button>
          </>
        )}
        {stage === 'code' && (
          <>
            <h1 style={{ fontSize: 24, marginBottom: 12 }}>Check your inbox.</h1>
            <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 15 }}>
              We sent a 6-digit code to {email}.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              autoFocus
              style={{ width: '100%', padding: '12px 16px', fontSize: 16, borderRadius: 8, border: '1px solid #3d342a33', background: '#fff' }}
            />
            <button onClick={verifyCode} disabled={busy || code.length < 4} style={primaryBtn}>Verify</button>
          </>
        )}
        {stage === 'onboarding' && (
          <Centered title="Set up your account..." sub="Pick a passphrase to encrypt your new letter." />
        )}
        {stage === 'saving' && <Centered title="Encrypting and saving..." />}
        {stage === 'done' && <Centered title="Saved." sub="Heading to your Hearth..." />}
        {stage === 'error' && <Centered title="Something went wrong." sub={err ?? ''} />}
        {err && stage !== 'error' && <p style={{ color: '#a00', marginTop: 12 }}>{err}</p>}
      </div>
    </div>
  )
}

const primaryBtn: CSSProperties = {
  marginTop: 16,
  padding: '12px 24px',
  background: '#3d342a',
  color: '#f6efe2',
  border: 'none',
  borderRadius: 999,
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
}
