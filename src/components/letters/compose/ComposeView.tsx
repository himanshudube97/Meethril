'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import { RecipientPicker } from './RecipientPicker'
import { PostcardFront, FRONT_CHAR_LIMIT } from './PostcardFront'
import { PostcardBack, BACK_CHAR_LIMIT } from './PostcardBack'
import { SealModal } from './SealModal'
import { useAutosaveEntry } from '@/hooks/useAutosaveEntry'
import { useE2EE } from '@/hooks/useE2EE'
import { useProfileStore } from '@/store/profile'
import type { RecipientChoice } from '../letterTypes'
import type { JournalEntry } from '@/store/journal'

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

  const { fetchProfile } = useProfileStore()
  const { decryptEntryFromServer, isE2EEReady, isE2EEEnabled, isE2EEInitialized } = useE2EE()
  const autosave = useAutosaveEntry(draftId ?? null)

  const [phase, setPhase] = useState<Phase>(draftId ? 'front' : 'picker')
  const [recipient, setRecipient] = useState<RecipientChoice | null>(null)
  const [bodyFront, setBodyFront] = useState('')
  const [bodyBack, setBodyBack] = useState('')
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
        const decrypted = raw.encryptionType === 'e2ee'
          ? await decryptEntryFromServer(raw)
          : raw

        if (decrypted.createdAt) setCreatedAt(new Date(decrypted.createdAt))

        if (decrypted.entryType === 'letter') {
          setRecipient({ recipient: 'self' })
        } else if (decrypted.entryType === 'unsent_letter') {
          setRecipient({
            recipient: 'friend',
            name: decrypted.recipientName ?? '',
          })
        } else {
          // Not a letter at all — bounce back rather than corrupt it via autosave.
          router.replace('/letters')
          return
        }

        const { front, back } = splitBody(decrypted.text ?? '')
        setBodyFront(front)
        setBodyBack(back)
        setLoading(false)
      } catch (err) {
        console.error('Failed to resume letter draft:', err)
        router.replace('/letters')
      }
    })()
  }, [draftId, router, decryptEntryFromServer, isE2EEEnabled, isE2EEInitialized, isE2EEReady])

  // Autosave wiring. The hook is imperative (`trigger(draft)` + debounce),
  // so we re-trigger whenever the two body slices or the recipient mapping
  // change. The hook handles the POST→PUT lifecycle and E2EE encryption.
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
      song: null,
      // photos and doodles intentionally omitted — the server interprets a
      // present (even empty) array as "replace this set", which would wipe any
      // photos the user uploaded via PostcardBack's CollagePhoto components.
      // Omitting the keys tells the server to leave the existing rows alone.
      entryType: isSelf ? 'letter' : 'unsent_letter',
      recipientEmail: null,
      recipientName: isSelf ? 'future me' : recipient.name,
    })
  }, [bodyFront, bodyBack, recipient, phase, loading, autosave])

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
    const id = autosave.entryId
    if (!id) {
      throw new Error('Draft has not been saved yet — please add some text.')
    }
    const res = await fetch(`/api/entries/${id}/seal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        unlockDate: unlockDate.toISOString(),
        recipientEmail,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json.error ?? 'Could not seal.')
    }
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
