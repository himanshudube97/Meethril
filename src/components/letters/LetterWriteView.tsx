'use client'

import { useState, useEffect, useMemo } from 'react'
import { useProfileStore } from '@/store/profile'
import { useE2EEStore } from '@/store/e2ee'
import { useAutosaveEntry } from '@/hooks/useAutosaveEntry'
import RecipientSidebar from './RecipientSidebar'
import LetterPaper from './LetterPaper'
import {
  LetterRecipient,
  UnlockChoice,
  DEFAULT_UNLOCK,
  resolveUnlockDate,
  mapRecipientToSchema,
} from './letterTypes'

interface Props {
  onBack: () => void
  onSealed: () => void
}

export default function LetterWriteView({ onBack, onSealed }: Props) {
  const { profile, fetchProfile } = useProfileStore()
  const e2eeEnabled = useE2EEStore(s => s.isEnabled)
  const autosave = useAutosaveEntry()

  const [recipient, setRecipient] = useState<LetterRecipient>('future_me')
  const [unlock, setUnlock] = useState<UnlockChoice>(DEFAULT_UNLOCK)
  const [closeName, setCloseName] = useState('')
  const [closeEmail, setCloseEmail] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [createdAt] = useState<Date>(() => new Date())

  // Friend letters with an email recipient ride server-side encryption (the
  // server has to read them at delivery time when the author is offline). If
  // the author has E2EE on, surface the privacy boundary before they write.
  const isFriendLetterWithEmail =
    recipient === 'someone_close' && closeEmail.trim().length > 0
  const showNotE2EENotice = e2eeEnabled && isFriendLetterWithEmail

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Derived schema mapping
  const mapping = mapRecipientToSchema(recipient, closeName, closeEmail || null)
  // resolveUnlockDate returns a fresh Date each call; without useMemo,
  // unlockDate is a new reference every render and the autosave effect
  // below (whose deps include unlockDate) re-fires on every render.
  const unlockDate = useMemo(() => resolveUnlockDate(unlock, createdAt), [unlock, createdAt])

  // Push the current state through autosave whenever any letter field changes.
  // The hook debounces to 1500ms internally, so rapid typing fires one save.
  // Empty drafts (no text/song/photos/doodles) skip the network call.
  useEffect(() => {
    autosave.trigger({
      text: bodyHtml,
      song: null,
      // photos and doodles intentionally omitted — see ComposeView for the
      // full explanation. Passing [] triggers a destructive server replace.
      entryType: mapping.entryType,
      recipientEmail: mapping.recipientEmail,
      recipientName: mapping.recipientName,
      // senderName not captured in this view yet
      unlockDate: unlockDate ? unlockDate.toISOString() : null,
    })
    // autosave.trigger is stable (useCallback []), safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyHtml, mapping.entryType, mapping.recipientName, mapping.recipientEmail, unlockDate])

  const canSeal =
    bodyHtml.replace(/<[^>]*>/g, '').trim().length > 0 &&
    unlockDate !== null &&
    (recipient === 'future_me' || closeName.trim().length > 0)

  const [sealing, setSealing] = useState(false)

  async function handleSeal() {
    if (!canSeal || sealing) return
    setSealing(true)
    try {
      // Make sure the latest edits are persisted before sealing — otherwise
      // the seal could land on a stale draft.
      await autosave.flush()
      const entryId = autosave.entryId
      if (!entryId) return
      const res = await fetch(`/api/entries/${entryId}/seal`, { method: 'POST' })
      if (res.ok) {
        await new Promise(r => setTimeout(r, 900))
        onSealed()
      }
    } finally {
      setSealing(false)
    }
  }

  return (
    <div
      className="flex w-full"
      style={{ minHeight: 'calc(100vh - 7rem)' }}
    >
      <RecipientSidebar
        recipient={recipient}
        onRecipientChange={setRecipient}
        unlock={unlock}
        onUnlockChange={setUnlock}
      />
      <div className="flex flex-1 flex-col px-10 py-6">
        {showNotE2EENotice && (
          <div
            role="status"
            className="mb-4 rounded-lg px-4 py-3 text-sm"
            style={{
              border: '1px solid color-mix(in oklab, #d97706 35%, transparent)',
              background: 'color-mix(in oklab, #d97706 8%, transparent)',
              color: 'var(--text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>Heads up:</strong>{' '}
            this letter won&apos;t be end-to-end encrypted. To deliver it later
            when you&apos;re offline, Hearth keeps a copy it can read. Your own
            journal stays E2EE.
          </div>
        )}
        <LetterPaper
          recipient={recipient}
          closeName={closeName}
          onCloseNameChange={setCloseName}
          closeEmail={closeEmail}
          onCloseEmailChange={setCloseEmail}
          bodyHtml={bodyHtml}
          onBodyChange={setBodyHtml}
          signatureName={profile?.nickname ?? 'me'}
          photos={[]}
          doodle={undefined}
          songUrl={null}
          onBack={onBack}
          onSeal={handleSeal}
          sealing={sealing}
          canSeal={canSeal && !sealing}
          createdAt={createdAt}
        />
      </div>
    </div>
  )
}
