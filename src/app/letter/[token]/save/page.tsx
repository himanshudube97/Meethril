// src/app/letter/[token]/save/page.tsx
'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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
  return (
    <Suspense fallback={<Centered title="Loading..." />}>
      <SavePageInner />
    </Suspense>
  )
}

function SavePageInner() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const search = useSearchParams()
  // Set when the recipient is already signed in (KeepForeverCTA checks
  // /api/auth/me) or has just returned from the Google round-trip — see
  // SignInToKeep's redirectTo. It distinguishes "logged in, key pending"
  // from "no account yet".
  const loggedInHint = search.get('logged_in') === '1'

  const masterKey = useE2EEStore((s) => s.masterKey)
  const initialized = useE2EEStore((s) => s.initialized)
  const isEnabled = useE2EEStore((s) => s.isEnabled)
  const showSetupModal = useE2EEStore((s) => s.showSetupModal)
  const setShowSetupModal = useE2EEStore((s) => s.setShowSetupModal)

  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'need_signin' }
    | { kind: 'awaiting_key' }
    | { kind: 'saving' }
    | { kind: 'done' }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  // The save itself. Runs once the recipient's master key is available —
  // whether they were already unlocked, just unlocked, or just minted one
  // during E2EE setup. Guarded so React's double-effect (dev) or a key change
  // can't POST the letter twice.
  const savingRef = useRef(false)
  const doSave = useCallback(
    async (cached: CachedLetter, key: CryptoKey) => {
      if (savingRef.current) return
      savingRef.current = true
      setState({ kind: 'saving' })
      try {
        const rawKey = cached.letterKey ? rawKeyFromBase64(cached.letterKey) : null
        const photoRefs =
          rawKey && cached.assets && cached.assets.length > 0
            ? await uploadKeptPhotos({ rawKey, assets: cached.assets, masterKey: key })
            : []

        // Re-shape the kept letter into the SAME bundle the inbox reader
        // (RevealModal → PostcardBack) renders for native letters:
        //   { text, song, photos: [refs], doodleStrokes: StrokeData[] }
        // Friend letters are composed on the same 2-photo / 1-doodle postcard,
        // so this is lossless. The photo refs (re-encrypted under the master
        // key just now) live INSIDE the encrypted bundle — that's why a kept
        // letter's photos render in the letterbox. The old code stored only
        // {text, song, doodles}, so photos (and doodles, under the wrong key
        // name) silently vanished from the saved copy.
        const keptContent = {
          text: cached.content.text,
          song: cached.content.song ?? null,
          photos: photoRefs.map((r) => ({
            encryptedRef: r.encryptedRef,
            encryptedRefIV: r.encryptedRefIV,
            position: r.position,
            spread: r.spread,
            rotation: r.rotation,
          })),
          doodleStrokes: (cached.content.doodles ?? []).flatMap((d) => {
            const strokes = (d as { strokes?: unknown })?.strokes
            return Array.isArray(strokes) ? strokes : []
          }),
        }
        const { ciphertext, iv } = await encryptString(JSON.stringify(keptContent), key)
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
          setState({ kind: 'error', message: j.error ?? 'Save failed.' })
          return
        }
        sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${params.token}`)
        setState({ kind: 'done' })
        setTimeout(() => router.push('/me'), 1200)
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'unknown error' })
      }
    },
    [params.token, router],
  )

  // Route to the right state: save immediately if we have the key, wait for
  // setup/unlock if they're signed in but key-less, otherwise ask them to sign
  // in. Re-runs when masterKey appears (after unlock/setup) and resumes the save.
  useEffect(() => {
    async function route() {
      const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${params.token}`)
      if (!raw) {
        setState({
          kind: 'error',
          message: 'We lost the decrypted letter. Please reopen the original link to try again.',
        })
        return
      }
      let cached: CachedLetter
      try {
        cached = JSON.parse(raw) as CachedLetter
      } catch {
        setState({
          kind: 'error',
          message: 'The cached letter looks corrupted. Please reopen the original link to try again.',
        })
        return
      }

      if (masterKey) {
        await doSave(cached, masterKey)
        return
      }
      if (loggedInHint) {
        setState({ kind: 'awaiting_key' })
        return
      }
      setState({ kind: 'need_signin' })
    }
    route()
  }, [params.token, masterKey, loggedInHint, doSave])

  // While awaiting the key for a signed-in recipient: an existing E2EE user
  // already gets the UnlockModal from E2EEProvider.initialize(). A brand-new
  // user (no E2EE yet — e.g. just created via Google) needs Setup kicked off
  // explicitly so they can mint a master key to encrypt the kept letter under.
  useEffect(() => {
    if (state.kind !== 'awaiting_key') return
    if (masterKey || !initialized) return
    if (!isEnabled && !showSetupModal) setShowSetupModal(true)
  }, [state.kind, masterKey, initialized, isEnabled, showSetupModal, setShowSetupModal])

  if (state.kind === 'loading') return <Centered title="Saving your letter..." />
  if (state.kind === 'need_signin') return <SignInToKeep token={params.token} />
  if (state.kind === 'awaiting_key') {
    return (
      <Centered
        title="Almost there"
        sub="Set up your private key in the box that just appeared — then we'll tuck this letter safely into your account."
      />
    )
  }
  if (state.kind === 'saving') return <Centered title="Encrypting and saving..." sub="Just a few seconds." />
  if (state.kind === 'done') return <Centered title="Saved." sub="Your letter is in your Meethril account." />
  if (state.kind === 'error') return <Centered title="We couldn't save the letter." sub={state.message} />
  return null
}

function Centered({ title, sub }: { title: string; sub?: string }) {
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
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>{title}</h1>
        {sub && <p style={{ opacity: 0.7, maxWidth: 380, lineHeight: 1.6 }}>{sub}</p>}
      </div>
    </div>
  )
}

function SignInToKeep({ token }: { token: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function signIn() {
    setBusy(true)
    setErr(null)
    try {
      // Come back to this exact save flow after Google. logged_in=1 tells the
      // page the recipient is now authenticated (key may still need setup).
      // Encode so the path + query survive the callback's ?redirect= param.
      const redirectTo = encodeURIComponent(`/letter/${token}/save?logged_in=1`)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirectTo }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error ?? 'Could not start sign-in.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error')
      setBusy(false)
    }
  }

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
      <div style={{ maxWidth: 440, width: '100%' }}>
        <h1 style={{ fontSize: 26, marginBottom: 14 }}>Keep this letter forever</h1>
        <p style={{ opacity: 0.78, marginBottom: 16, fontSize: 15, lineHeight: 1.7 }}>
          Right now this letter fades 24 hours after you opened it — we don&apos;t keep a copy.
          Sign in to tuck it permanently into your own Meethril.
        </p>
        <p style={{ opacity: 0.66, marginBottom: 28, fontSize: 14, lineHeight: 1.7 }}>
          It stays end-to-end encrypted: we&apos;ll ask you to set a private passphrase, and the
          letter is sealed under it before it touches our servers. Only you can ever read it —
          not even us.
        </p>
        <button onClick={signIn} disabled={busy} style={googleBtn}>
          <GoogleIcon />
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {err && <p style={{ color: '#a00', marginTop: 14, fontSize: 14 }}>{err}</p>}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

const googleBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  padding: '12px 24px',
  background: '#fff',
  color: '#3d342a',
  border: '1px solid #3d342a33',
  borderRadius: 999,
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
}
