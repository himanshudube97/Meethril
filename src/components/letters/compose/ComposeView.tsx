'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { RecipientPicker } from './RecipientPicker'
import { PostcardFront } from './PostcardFront'
import { PostcardBack } from './PostcardBack'
import { SealModal } from './SealModal'
import { useAutosaveLetterDraft } from '@/hooks/useAutosaveLetterDraft'
import { useE2EE } from '@/hooks/useE2EE'
import { useProfileStore } from '@/store/profile'
import { useE2EEStore } from '@/store/e2ee'
import { useThemeStore } from '@/store/theme'
import { getGlassDiaryColors } from '@/lib/glassDiaryColors'
import { parseLimitError, limitMessage } from '@/lib/billing/limit-error'
import { useLimitPromptStore } from '@/store/limit-prompt'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import { buildFriendLetterPayload } from '@/lib/letters/friend-letter-client'
import { decryptLetterDraft, type LetterDraftWire } from '@/lib/letters/draft-decrypt'
import type { Photo } from '@/components/desk/PhotoBlock'
import type { RecipientChoice } from '../letterTypes'
import type { StrokeData } from '@/store/journal'

type Phase = 'picker' | 'front' | 'back'

export default function ComposeView() {
  const router = useRouter()
  const params = useSearchParams()
  const draftId = params.get('id')

  const { fetchProfile } = useProfileStore()
  const { isE2EEReady, isE2EEEnabled, isE2EEInitialized } = useE2EE()
  const autosave = useAutosaveLetterDraft(draftId ?? null)
  const masterKey = useE2EEStore((s) => s.masterKey)
  const theme = useThemeStore((s) => s.theme)

  const [phase, setPhase] = useState<Phase>(draftId ? 'front' : 'picker')
  const [recipient, setRecipient] = useState<RecipientChoice | null>(null)
  // The portrait postcard keeps ALL the writing on the front. The back is
  // song + photos + doodle only — so a single body string is the whole letter.
  const [bodyFront, setBodyFront] = useState('')
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
  const [cardScale, setCardScale] = useState(1)
  const hydratedRef = useRef(false)

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Lock both <html> and <body> scroll while the compose view is mounted.
  // globals.css forces `html { overflow-y: scroll }` to avoid scrollbar
  // layout shift across the rest of the app — locking body alone is not
  // enough; the html-level scrollbar is what actually appears.
  useEffect(() => {
    const html = document.documentElement
    const originalHtmlOverflow = html.style.overflowY
    const originalBodyOverflow = document.body.style.overflow
    html.style.overflowY = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflowY = originalHtmlOverflow
      document.body.style.overflow = originalBodyOverflow
    }
  }, [])

  // Uniformly scale the whole postcard to fit the viewport — same approach as
  // the journal's BookSpread (DeskScene). The card keeps its fixed 760×860
  // design size so its aspect ratio and font sizes never distort; we just
  // scale the painted result. DESIGN_W reserves room on both sides for the
  // quill that bleeds past the card's right edge so it never clips. Capped at
  // MAX_SCALE so it grows to fill big monitors but doesn't get cartoonishly
  // large.
  useEffect(() => {
    const DESIGN_W = 1340 // 760 card + ~290 bleed each side (quill + blotter)
    const DESIGN_H = 940 // 860 card + blotter padding + breathing room
    const MARGIN_X = 40
    const MARGIN_Y = 120 // navbar + gaps above the card
    const MAX_SCALE = 1.3
    const calcScale = () => {
      const availW = window.innerWidth - MARGIN_X
      const availH = window.innerHeight - MARGIN_Y
      setCardScale(Math.min(MAX_SCALE, availW / DESIGN_W, availH / DESIGN_H))
    }
    calcScale()
    window.addEventListener('resize', calcScale)
    return () => window.removeEventListener('resize', calcScale)
  }, [])

  // Hydrate a resumed draft from the letters table. We have to wait for the
  // master key to be available — drafts are E2EE under it, and decrypting
  // before unlock would just seed the editors with placeholder text.
  useEffect(() => {
    if (!draftId || hydratedRef.current) return
    if (!isE2EEInitialized) return
    if (isE2EEEnabled && !isE2EEReady) return
    if (!masterKey) return

    hydratedRef.current = true
    void (async () => {
      try {
        const res = await fetch(`/api/letters/drafts/${draftId}`)
        if (!res.ok) {
          router.replace('/letters')
          return
        }
        const wire = (await res.json()) as LetterDraftWire
        const decrypted = await decryptLetterDraft(wire, masterKey)

        setCreatedAt(new Date(wire.createdAt))

        if (decrypted.letterType === 'self') {
          setRecipient({ recipient: 'self' })
        } else {
          // Friend drafts keep the recipient name on the row itself now —
          // hydrate it back into the picker state.
          setRecipient({
            recipient: 'friend',
            name: decrypted.recipientName ?? '',
          })
        }

        // Front owns the whole letter now. Legacy drafts saved as
        // `front\n\nback` simply load in full and re-wrap on the front.
        setBodyFront(decrypted.text)

        const hydratedPhotos: Photo[] = decrypted.photos
          .filter((p) => p.position === 1 || p.position === 2)
          .map((p) => ({
            url: p.url ?? undefined,
            encryptedRef: p.encryptedRef ?? undefined,
            encryptedRefIV: p.encryptedRefIV ?? undefined,
            rotation: p.rotation,
            position: p.position as 1 | 2,
          }))
        setPhotos(hydratedPhotos)

        const firstDoodle = decrypted.doodles[0]
        if (firstDoodle && Array.isArray(firstDoodle.strokes)) {
          setDoodleStrokes(firstDoodle.strokes as StrokeData[])
        } else {
          setDoodleStrokes([])
        }

        setSong(decrypted.song)
        setLoading(false)
      } catch (err) {
        console.error('Failed to resume letter draft:', err)
        router.replace('/letters')
      }
    })()
  }, [draftId, router, isE2EEEnabled, isE2EEInitialized, isE2EEReady, masterKey])

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

  // Autosave wiring. The hook is imperative (`trigger(payload)` + debounce),
  // so we re-trigger whenever the two body slices, recipient mapping,
  // photos, song, or doodle strokes change. The hook handles the
  // POST→PUT lifecycle against /api/letters/drafts and the E2EE
  // encryption.
  useEffect(() => {
    if (!recipient) return
    if (phase === 'picker') return
    // Don't write back the empty state while a draft is still hydrating —
    // that would race with the GET and wipe the row.
    if (loading) return

    const isSelf = recipient.recipient === 'self'

    autosave.trigger({
      letterType: isSelf ? 'self' : 'friend',
      text: bodyFront,
      song,
      photos: photos.map((p) => ({
        url: p.url ?? null,
        encryptedRef: p.encryptedRef ?? null,
        encryptedRefIV: p.encryptedRefIV ?? null,
        position: p.position,
        rotation: p.rotation,
        spread: 1,
      })),
      doodleStrokes,
      recipientName: isSelf ? null : recipient.name ?? null,
      recipientEmail: null,
      letterLocation: null,
    })
  }, [bodyFront, recipient, phase, loading, photos, doodleStrokes, song, autosave.trigger])

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

  const canSeal = bodyFront.trim().length > 0

  async function handleSeal({
    unlockDate,
    recipientEmail,
    question,
    answer,
  }: {
    unlockDate: Date
    recipientEmail?: string
    question?: string
    answer?: string
  }) {
    // Flush the pending autosave so the seal request sees the final body /
    // recipient state. autosave.draftId becomes available only after the
    // first POST completes — if the user types and immediately taps seal,
    // the debounce hasn't fired yet.
    await autosave.flush()
    const draftLetterId = autosave.draftId
    if (!draftLetterId) {
      throw new Error('Draft has not been saved yet — please add some text.')
    }
    if (!masterKey) {
      throw new Error('Unlock Hearth first — your master key is required to seal letters.')
    }
    if (!recipient) throw new Error('No recipient selected.')

    const combinedText = bodyFront

    if (recipient.recipient === 'self') {
      const payload = await buildSelfLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: photos.map((p) => ({
            url: p.url ?? null,
            encryptedRef: p.encryptedRef ?? null,
            encryptedRefIV: p.encryptedRefIV ?? null,
            position: p.position,
            spread: 1,
            rotation: p.rotation,
          })),
          doodleStrokes,
          letterLocation: null,
        },
        unlockDate,
        masterKey,
      })
      const res = await fetch('/api/letters/self', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, draftLetterId }),
      })
      if (!res.ok) {
        const limit = await parseLimitError(res)
        if (limit) {
          useLimitPromptStore.getState().show(limit)
          throw new Error(limitMessage(limit))
        }
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not save self letter.')
      }
      return
    }

    if (recipient.recipient === 'friend') {
      if (!recipientEmail) throw new Error('Recipient email missing.')
      if (!question || !question.trim()) {
        throw new Error('Question missing.')
      }
      if (!answer) {
        throw new Error('Answer missing.')
      }

      // Re-fetch the draft so we get the encrypted doodle strokes in the
      // shape the asset bundler expects. Photos are read from React state
      // (ComposeView owns those refs); doodles come from the draft because
      // local state holds plaintext strokes.
      const draftRes = await fetch(`/api/letters/drafts/${draftLetterId}`)
      if (!draftRes.ok) throw new Error('Could not load draft for sealing.')
      const draftWire = (await draftRes.json()) as {
        draftDoodles?: Array<{
          strokes: { encryptedStrokes: string; e2eeIV: string } | unknown
          spread?: number
          positionInEntry?: number
        }>
      }

      const draftPhotos = photos.map((p, i) => ({
        encryptedRef: p.encryptedRef ?? null,
        encryptedRefIV: p.encryptedRefIV ?? null,
        url: p.url ?? null,
        position: p.position,
        spread: 1,
        rotation: p.rotation,
        ordinal: i,
      }))
      const draftDoodles = (draftWire.draftDoodles ?? []).map((d) => ({
        strokes: d.strokes,
        spread: d.spread ?? 1,
        positionInEntry: d.positionInEntry ?? 0,
      }))

      const payload = await buildFriendLetterPayload({
        draft: {
          text: combinedText,
          song,
          photos: draftPhotos,
          doodles: draftDoodles,
        },
        unlockDate,
        recipientEmail,
        recipientName: recipient.name ?? '',
        letterLocation: null,
        masterKey,
        question: question.trim(),
        answer,
      })
      const res = await fetch('/api/letters/friend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, draftLetterId }),
      })
      if (!res.ok) {
        const limit = await parseLimitError(res)
        if (limit) {
          useLimitPromptStore.getState().show(limit)
          throw new Error(limitMessage(limit))
        }
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Could not send friend letter.')
      }
      return
    }

    throw new Error(`Unknown recipient type: ${(recipient as RecipientChoice).recipient}`)
  }

  // Card flip control: front→back = 180 degrees (preserves the prior 3D flip).
  const cardRotateY = phase === 'back' ? 180 : 0

  // Pull the same cover tokens the journal uses for its leather binding.
  // The blotter behind the postcard reads as the same physical material.
  const diaryColors = getGlassDiaryColors(theme)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30, // below Navigation (z-40/50) so the navbar stays visible
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: 1600,
        // background intentionally left transparent so the theme Background
        // (snow, fireflies, sakura, etc.) animates behind the postcard the
        // same way it does behind a journal spread.
      }}
    >
      {/* Uniform scaler — fits the whole postcard to the viewport without
          distorting its aspect ratio (see the cardScale effect above). */}
      <div
        style={{
          transform: `scale(${cardScale})`,
          transformOrigin: 'center center',
        }}
      >
      {/* Leather desk blotter — hugs the postcard with a small even margin.
          The inkwell + quill sit OUTSIDE the blotter, on the bare desk, so
          the blotter reads as a leather mat just for the letter. Same
          theme cover token + crosshatch grain as before. */}
      <div
        style={{
          position: 'relative',
          padding: '20px 26px',
          borderRadius: 14,
          backgroundColor: diaryColors.cover,
          backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 6px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 6px)`,
          border: `1px solid ${diaryColors.coverBorder}`,
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.25), 0 35px 70px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.28)',
        }}
      >
      {/* The postcard itself — portrait. Tall + narrow; the flip + perspective
          are unchanged, only the aspect ratio. */}
      <motion.div
        style={{
          width: 760,
          height: 860,
          position: 'relative',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Quill — illustration asset standing beside the portrait postcard,
            set off to the right with a clear gap from the paper's edge. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
          style={{
            position: 'absolute',
            right: -275,
            bottom: -8,
            width: 230,
            height: 230,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.32))',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/quill.png"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </motion.div>


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
          {/* FRONT face. `active` toggles pointer-events on its root because
              backface-visibility:hidden doesn't reliably block clicks on the
              rotated-away face across browsers — without this guard, clicks
              on the back leak through to the (invisible) front. */}
          <PostcardFront
            active={phase === 'front'}
            salutationName={salutationName}
            body={bodyFront}
            onBodyChange={setBodyFront}
            onTurnOver={() => setPhase('back')}
            onCancel={() => router.push('/letters')}
            createdAt={createdAt}
          />

          {/* BACK face — same active guard. Song + photos + doodle only;
              the writing all lives on the front now. */}
          <PostcardBack
            active={phase === 'back'}
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
      </div>
      </div>

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
