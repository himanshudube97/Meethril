'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { RecipientPicker } from './RecipientPicker'
import { PostcardFront, FRONT_CHAR_LIMIT } from './PostcardFront'
import { PostcardBack, BACK_CHAR_LIMIT } from './PostcardBack'
import { SealModal } from './SealModal'
import { useAutosaveEntry } from '@/hooks/useAutosaveEntry'
import { useE2EE } from '@/hooks/useE2EE'
import { useProfileStore } from '@/store/profile'
import { useE2EEStore } from '@/store/e2ee'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import { buildFriendLetterPayload } from '@/lib/letters/friend-letter-client'
import type { Photo } from '@/components/desk/PhotoBlock'
import type { RecipientChoice } from '../letterTypes'
import type { JournalEntry, StrokeData } from '@/store/journal'

type Phase = 'picker' | 'front' | 'back'

const BODY_SEPARATOR = '\n\n'

/**
 * Split a stored body into front/back slices.
 *
 * The compose UI keeps two strings so each editor can own its own slice.
 * Autosave joins them with `\n\n` before writing to `JournalEntry.text` —
 * splitBody is the inverse for draft resume.
 *
 * Legacy fallback (rows saved before this redesign): no separator present,
 * everything pre-cap goes to front; the overflow tail goes to back.
 */
function splitBody(text: string): { front: string; back: string } {
  if (!text) return { front: '', back: '' }
  const sepIdx = text.indexOf(BODY_SEPARATOR)
  if (sepIdx >= 0 && sepIdx <= FRONT_CHAR_LIMIT) {
    return {
      front: text.slice(0, sepIdx),
      back: text.slice(sepIdx + BODY_SEPARATOR.length),
    }
  }
  return {
    front: text.slice(0, FRONT_CHAR_LIMIT),
    back: text.slice(FRONT_CHAR_LIMIT, FRONT_CHAR_LIMIT + BACK_CHAR_LIMIT),
  }
}

function joinBody(front: string, back: string): string {
  if (!back) return front
  return `${front}${BODY_SEPARATOR}${back}`
}

export default function ComposeView() {
  const router = useRouter()
  const params = useSearchParams()
  const draftId = params.get('id')

  const { profile, fetchProfile } = useProfileStore()
  const { decryptEntryFromServer, isE2EEReady, isE2EEEnabled, isE2EEInitialized } = useE2EE()
  const autosave = useAutosaveEntry(draftId ?? null)
  const masterKey = useE2EEStore((s) => s.masterKey)
  const userName = profile?.nickname ?? 'A friend'

  const [phase, setPhase] = useState<Phase>(draftId ? 'front' : 'picker')
  const [recipient, setRecipient] = useState<RecipientChoice | null>(null)
  const [bodyFront, setBodyFront] = useState('')
  const [bodyBack, setBodyBack] = useState('')
  // Photo refs + doodle strokes are owned here so PhotoBlock's encrypted
  // {url | encryptedRef + encryptedRefIV} survive autosave and draft resume.
  // Previously these lived inside PostcardBack as local data: URLs and
  // were silently lost on refresh.
  const [photos, setPhotos] = useState<Photo[]>([])
  const [doodleStrokes, setDoodleStrokes] = useState<StrokeData[]>([])
  const [song, setSong] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<Date>(() => new Date())
  const [showSeal, setShowSeal] = useState(false)
  const [loading, setLoading] = useState(Boolean(draftId))
  const hydratedRef = useRef(false)

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Hydrate a resumed draft. The body / recipientName may be E2EE-encrypted
  // on the wire — push them through decryptEntryFromServer (no-op for
  // server-side rows) before splitting into front/back.
  useEffect(() => {
    if (!draftId || hydratedRef.current) return
    // For E2EE rows we have to wait until either the key is loaded or we know
    // for sure the user has E2EE disabled. Otherwise decryptEntryFromServer
    // hands back the "[Encrypted — unlock to view]" placeholder and we'd seed
    // the editors with that.
    if (!isE2EEInitialized) return
    if (isE2EEEnabled && !isE2EEReady) return

    hydratedRef.current = true
    void (async () => {
      try {
        const res = await fetch(`/api/entries/${draftId}`)
        if (!res.ok) {
          router.replace('/letters')
          return
        }
        const raw = (await res.json()) as JournalEntry
        // All entries are E2EE — always decrypt client-side.
        const decrypted = await decryptEntryFromServer(raw)

        if (decrypted.createdAt) setCreatedAt(new Date(decrypted.createdAt))

        if (decrypted.entryType === 'letter') {
          setRecipient({ recipient: 'self' })
        } else if (decrypted.entryType === 'unsent_letter') {
          // recipientName is no longer stored on JournalEntry; the user will
          // need to re-enter the friend's name if they resume a draft.
          setRecipient({
            recipient: 'friend',
            name: '',
          })
        } else {
          // Not a letter at all — bounce back rather than corrupt it via autosave.
          router.replace('/letters')
          return
        }

        const { front, back } = splitBody(decrypted.text ?? '')
        setBodyFront(front)
        setBodyBack(back)

        // Hydrate photo refs from the persisted entry. The server-side shape
        // uses `position: number` and includes `spread`; PhotoBlock's Photo
        // type uses `position: 1 | 2` and omits spread. Normalise here so the
        // round-trip through autosave (which re-adds spread:1) is stable.
        const hydratedPhotos: Photo[] = (decrypted.photos ?? [])
          .filter((p) => p.position === 1 || p.position === 2)
          .map((p) => ({
            id: p.id,
            url: p.url,
            encryptedRef: p.encryptedRef,
            encryptedRefIV: p.encryptedRefIV,
            rotation: p.rotation,
            position: p.position as 1 | 2,
          }))
        setPhotos(hydratedPhotos)

        // Hydrate doodle strokes from the persisted entry (spread 1 only).
        const hydratedDoodle = decrypted.doodles?.[0]?.strokes ?? []
        setDoodleStrokes(hydratedDoodle)

        // Hydrate song URL from the persisted entry.
        setSong(decrypted.song ?? null)

        setLoading(false)
      } catch (err) {
        console.error('Failed to resume letter draft:', err)
        router.replace('/letters')
      }
    })()
  }, [draftId, router, decryptEntryFromServer, isE2EEEnabled, isE2EEInitialized, isE2EEReady])

  // ── Photo + doodle handlers — bubble up to autosave via state setters.
  const handlePhotoAdd = useCallback(
    (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => {
      setPhotos((prev) => {
        const filtered = prev.filter((p) => p.position !== position)
        const next: Photo = {
          url: photo.url,
          encryptedRef: photo.encryptedRef,
          encryptedRefIV: photo.encryptedRefIV,
          rotation: position === 1 ? -7 : 7,
          position,
        }
        return [...filtered, next]
      })
    },
    [],
  )

  const handlePhotoRemove = useCallback((position: 1 | 2) => {
    setPhotos((prev) => prev.filter((p) => p.position !== position))
  }, [])

  // Autosave wiring. The hook is imperative (`trigger(draft)` + debounce),
  // so we re-trigger whenever the two body slices, recipient mapping,
  // photos, or doodle strokes change. The hook handles the POST→PUT
  // lifecycle and E2EE encryption.
  useEffect(() => {
    if (!recipient) return
    if (phase === 'picker') return
    // Don't write back the empty state while a draft is still hydrating —
    // that would race with the GET and wipe the row.
    if (loading) return

    const joined = joinBody(bodyFront, bodyBack)
    const isSelf = recipient.recipient === 'self'

    autosave.trigger({
      text: joined,
      song,
      // Photos + doodles are now owned by ComposeView (lifted out of
      // PostcardBack) so they survive autosave + draft resume. The server's
      // destructive replace block only runs when these keys are present,
      // which is exactly what we want now that ComposeView is the source
      // of truth.
      photos: photos.map((p) => ({
        url: p.url,
        encryptedRef: p.encryptedRef,
        encryptedRefIV: p.encryptedRefIV,
        position: p.position,
        rotation: p.rotation,
        spread: 1,
      })),
      doodles: doodleStrokes.length > 0
        ? [{ strokes: doodleStrokes, spread: 1 }]
        : [],
      entryType: isSelf ? 'letter' : 'unsent_letter',
    })
  }, [bodyFront, bodyBack, recipient, phase, loading, photos, doodleStrokes, song, autosave.trigger])

  if (loading) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontStyle: 'italic',
          opacity: 0.6,
        }}
      >
        opening...
      </div>
    )
  }

  if (phase === 'picker' || !recipient) {
    return (
      <RecipientPicker
        onSubmit={(choice) => {
          setRecipient(choice)
          setCreatedAt(new Date())
          setPhase('front')
        }}
        onCancel={() => router.push('/letters')}
      />
    )
  }

  const salutationName =
    recipient.recipient === 'self' ? 'future me' : recipient.name

  const canSeal =
    bodyFront.trim().length > 0 || bodyBack.trim().length > 0

  async function handleSeal({
    unlockDate,
    recipientEmail,
  }: {
    unlockDate: Date
    recipientEmail?: string
  }) {
    // Flush the pending autosave so the seal request sees the final body /
    // recipient state. autosave.entryId becomes available only after the
    // first POST completes — if the user types and immediately taps seal,
    // the debounce hasn't fired yet.
    await autosave.flush()
    const draftEntryId = autosave.entryId
    if (!draftEntryId) {
      throw new Error('Draft has not been saved yet — please add some text.')
    }
    if (!masterKey) {
      throw new Error('Unlock Hearth first — your master key is required to seal letters.')
    }
    // recipient is always non-null here (handleSeal is only reachable after the
    // picker phase, where recipient is guaranteed to be set), but we narrow
    // explicitly for TypeScript.
    if (!recipient) throw new Error('No recipient selected.')

    const combinedText = [bodyFront, bodyBack].filter(Boolean).join('\n\n')

    if (recipient.recipient === 'self') {
      const payload = await buildSelfLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: [],
          doodles: [],
          letterLocation: null,
        },
        unlockDate,
        masterKey,
      })
      const res = await fetch('/api/letters/self', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, draftEntryId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not save self letter.')
      }
      return
    }

    if (recipient.recipient === 'friend') {
      if (!recipientEmail) throw new Error('Recipient email missing.')

      // Fetch the draft's photos and doodles so we can bundle them into
      // the letter payload. The autosave route persisted them under the
      // draftEntryId; the bundler will decrypt with the master key and
      // re-encrypt under K.
      const draftRes = await fetch(`/api/entries/${draftEntryId}`)
      if (!draftRes.ok) throw new Error('Could not load draft for sealing.')
      const draft = (await draftRes.json()) as {
        photos?: Array<{
          encryptedRef: string | null
          encryptedRefIV: string | null
          url: string | null
          position: number
          spread: number
          rotation: number
        }>
        doodles?: Array<{
          strokes: unknown
          spread: number
          positionInEntry: number
        }>
      }

      const draftPhotos = (draft.photos ?? []).map((p, i) => ({
        encryptedRef: p.encryptedRef,
        encryptedRefIV: p.encryptedRefIV,
        url: p.url,
        position: p.position,
        spread: p.spread,
        rotation: p.rotation,
        ordinal: i,
      }))
      const draftDoodles = draft.doodles ?? []

      const payload = await buildFriendLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: draftPhotos,
          doodles: draftDoodles,
        },
        unlockDate,
        recipientEmail,
        recipientName: recipient.name ?? 'Friend',
        senderName: userName,
        letterLocation: null,
        masterKey,
      })
      const res = await fetch('/api/letters/friend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, draftEntryId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not send friend letter.')
      }
      return
    }

    throw new Error(`Unknown recipient type: ${(recipient as RecipientChoice).recipient}`)
  }

  // Card flip control: front→back = 180 degrees (preserves the prior 3D flip).
  const cardRotateY = phase === 'back' ? 180 : 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, var(--bg-1), var(--bg-2))',
        perspective: 1600,
      }}
    >
      {/* The postcard itself — landscape */}
      <motion.div
        style={{
          width: 'min(1100px, calc(100vw - 80px))',
          height: 'min(640px, calc(100vh - 180px))',
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* 3D flip wrapper */}
        <motion.div
          animate={{ rotateY: cardRotateY }}
          transition={{ duration: 0.85, ease: [0.45, 0.05, 0.15, 1] }}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* FRONT face — its own backfaceVisibility is set inside the component */}
          <PostcardFront
            salutationName={salutationName}
            body={bodyFront}
            onBodyChange={setBodyFront}
            onTurnOver={() => setPhase('back')}
            onCancel={() => router.push('/letters')}
            createdAt={createdAt}
          />

          {/* BACK face — already applies its own rotateY(180deg) + backfaceVisibility */}
          <PostcardBack
            entryId={autosave.entryId}
            body={bodyBack}
            onBodyChange={setBodyBack}
            photos={photos}
            onPhotoAdd={handlePhotoAdd}
            onPhotoRemove={handlePhotoRemove}
            doodleStrokes={doodleStrokes}
            onDoodleStrokesChange={setDoodleStrokes}
            song={song}
            onSongChange={setSong}
            onTurnBack={() => setPhase('front')}
            onSeal={() => setShowSeal(true)}
            canSeal={canSeal}
          />
        </motion.div>
      </motion.div>

      {showSeal && (
        <SealModal
          recipient={recipient.recipient}
          onClose={() => setShowSeal(false)}
          onSealed={() => router.push('/letters?tab=sent')}
          onSeal={handleSeal}
        />
      )}
    </div>
  )
}
