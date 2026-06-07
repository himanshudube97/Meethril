'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { useJournalStore, StrokeData } from '@/store/journal'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import { buildFriendLetterPayload } from '@/lib/letters/friend-letter-client'
import { encryptString } from '@/lib/e2ee/crypto'
import SongEmbed from '@/components/SongEmbed'
import SongPicker from '@/components/SongPicker'
import PhotoBlock from '@/components/desk/PhotoBlock'
import CompactDoodleCanvas from '@/components/desk/CompactDoodleCanvas'
import { SealJourney } from './compose/SealJourney'
import { JOURNAL } from '@/lib/journal-constants'

const LETTER_BODY_MAX = 800

type Recipient = 'self' | 'friend'
type Step = 'pick' | 'write' | 'media' | 'seal'

interface Photo {
  id?: string
  url?: string
  encryptedRef?: string
  encryptedRefIV?: string
  rotation: number
  position: 1 | 2
}

/**
 * Mobile letter compose — a 4-step wizard so each surface gets its own
 * room instead of stacking into one cramped form.
 *
 *   pick   → Future me or Someone close
 *   write  → song + the letter body
 *   media  → photos + doodle
 *   seal   → opens-on date + (for friends) name/email/question/answer
 *
 * Doodles are encrypted client-side under the master key and rejoin the
 * letter via the existing payload builders — for self letters as a
 * `{encryptedStrokes,e2eeIV,...}` row inside the encrypted JSON blob,
 * for friend letters as a draft doodle the asset-bundler can re-wrap
 * under the letter key.
 */
export default function MobileLetterCompose() {
  const { theme } = useThemeStore()
  const router = useRouter()
  const { masterKey, isUnlocked, isEnabled } = useE2EEStore()
  const { currentDoodleStrokes, setDoodleStrokes, resetCurrentEntry } = useJournalStore()

  const [step, setStep] = useState<Step>('pick')
  const [recipient, setRecipient] = useState<Recipient>('self')

  // Letter fields (preserved across step changes so Back doesn't lose work).
  const [body, setBody] = useState('')
  const [song, setSong] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [unlockDate, setUnlockDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  })
  const minUnlockDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  }, [])

  // Friend-only
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Drives the fold-and-seal departure overlay after a successful seal.
  const [sealPhase, setSealPhase] = useState<'idle' | 'folding' | 'sealed'>('idle')

  const handlePhotoAdd = useCallback((position: 1 | 2, photoData: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => {
    const rotation = position === 1
      ? -8 + Math.floor(Math.random() * 6)
      : 5 + Math.floor(Math.random() * 6)
    setPhotos(prev => [
      ...prev.filter(p => p.position !== position),
      { ...photoData, position, rotation },
    ])
  }, [])

  const handleStrokesChange = useCallback((strokes: StrokeData[]) => {
    setDoodleStrokes(strokes)
  }, [setDoodleStrokes])

  const writeReady = body.trim().length > 0 && body.length <= LETTER_BODY_MAX
  const sealReady = (() => {
    if (submitting) return false
    if (!writeReady) return false
    if (unlockDate < minUnlockDate) return false
    if (recipient === 'friend') {
      if (!recipientName.trim()) return false
      if (!/^\S+@\S+\.\S+$/.test(recipientEmail.trim())) return false
      if (!question.trim()) return false
      if (!answer.trim()) return false
    }
    return true
  })()

  async function onSeal() {
    if (!sealReady) return
    if (!isEnabled || !isUnlocked || !masterKey) {
      setError('Unlock encryption on desktop before writing letters here.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const cleanSong = song && (/https?:\/\//.test(song) || song.startsWith('{')) ? song : null
      const draftPhotos = photos
        .filter(p => p.encryptedRef || p.url)
        .map((p, i) => ({
          encryptedRef: p.encryptedRef ?? null,
          encryptedRefIV: p.encryptedRefIV ?? null,
          url: p.url ?? null,
          position: p.position,
          spread: 1,
          rotation: p.rotation,
          ordinal: i,
        }))

      // Encrypt doodle strokes once; both letter types want the same
      // master-key ciphertext (friend-side asset-bundler then re-wraps it
      // under the letter key).
      let encryptedDoodle: { encryptedStrokes: string; e2eeIV: string } | null = null
      if (currentDoodleStrokes.length > 0) {
        const json = JSON.stringify(currentDoodleStrokes)
        const enc = await encryptString(json, masterKey)
        encryptedDoodle = { encryptedStrokes: enc.ciphertext, e2eeIV: enc.iv }
      }

      if (recipient === 'self') {
        const payload = await buildSelfLetterPayload({
          draft: {
            text: body.trim(),
            song: cleanSong,
            photos: draftPhotos
              .filter(p => p.encryptedRef && p.encryptedRefIV)
              .map(p => ({
                encryptedRef: p.encryptedRef!,
                encryptedRefIV: p.encryptedRefIV!,
                position: p.position,
                spread: p.spread,
                rotation: p.rotation,
              })),
            doodles: encryptedDoodle
              ? [{
                  encryptedStrokes: encryptedDoodle.encryptedStrokes,
                  e2eeIV: encryptedDoodle.e2eeIV,
                  spread: 1,
                  positionInEntry: 0,
                }]
              : [],
            letterLocation: null,
          },
          unlockDate: new Date(unlockDate + 'T00:00:00'),
          masterKey,
        })
        const res = await fetch('/api/letters/self', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Could not seal letter.')
        }
      } else {
        const payload = await buildFriendLetterPayload({
          draft: {
            text: body.trim(),
            song: cleanSong,
            photos: draftPhotos.map(p => ({
              encryptedRef: p.encryptedRef,
              encryptedRefIV: p.encryptedRefIV,
              url: p.url,
              position: p.position,
              spread: p.spread,
              rotation: p.rotation,
              ordinal: p.ordinal,
            })),
            doodles: encryptedDoodle
              ? [{
                  strokes: encryptedDoodle,
                  spread: 1,
                  positionInEntry: 0,
                }]
              : [],
          },
          unlockDate: new Date(unlockDate + 'T00:00:00'),
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim(),
          letterLocation: null,
          masterKey,
          question: question.trim(),
          answer: answer.trim(),
        })
        const res = await fetch('/api/letters/friend', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Could not send letter.')
        }
      }
      resetCurrentEntry()
      // play the fold-and-seal departure, then drift over to the letters list
      setSealPhase('folding')
      setTimeout(() => {
        setSealPhase('sealed')
        setTimeout(() => router.push('/letters'), 1900)
      }, 1300)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  // -----------------------------------------------------------------
  // Step 0 — recipient picker
  // -----------------------------------------------------------------
  if (step === 'pick') {
    return (
      <div className="fixed inset-0 z-30 overflow-y-auto" style={{ color: theme.text.primary }}>
        <div className="max-w-lg mx-auto px-4 pt-20 pb-12 flex flex-col gap-5">
          <CompactHeader />
          <p className="text-sm text-center italic"
            style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
            Who is this letter for?
          </p>
          <div className="flex flex-col gap-3">
            <RecipientCard
              title="Future me"
              subtitle="A letter to your future self. Sealed for at least a week."
              onClick={() => { setRecipient('self'); setStep('write') }}
            />
            <RecipientCard
              title="Someone close"
              subtitle="Delivered to a friend. Locked with a question only they can answer."
              onClick={() => { setRecipient('friend'); setStep('write') }}
            />
          </div>
        </div>
      </div>
    )
  }

  // -----------------------------------------------------------------
  // Steps 1–3 — shared shell
  // -----------------------------------------------------------------
  if (sealPhase !== 'idle') {
    return (
      <div
        className="fixed inset-0 z-40 flex items-center justify-center"
        style={{ backgroundColor: theme.bg.primary, color: theme.text.primary }}
      >
        <SealJourney recipient={recipient} phase={sealPhase} theme={theme} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col" style={{ color: theme.text.primary }}>
      <div className="pt-20 px-4 shrink-0">
        <CompactHeader />
        <div className="text-center text-xs italic mt-2 px-12"
          style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
          Writing to {recipient === 'self' ? 'future you' : 'someone close'}
          {' · '}
          <button onClick={() => setStep('pick')} style={{ textDecoration: 'underline dotted' }}>
            change
          </button>
        </div>
        <StepIndicator step={step} />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-3">
        {step === 'write' && (
          <WriteStep
            song={song}
            onSong={setSong}
            body={body}
            onBody={setBody}
          />
        )}
        {step === 'media' && (
          <MediaStep
            photos={photos}
            onPhotoAdd={handlePhotoAdd}
            doodleStrokes={currentDoodleStrokes}
            onStrokesChange={handleStrokesChange}
          />
        )}
        {step === 'seal' && (
          <SealStep
            recipient={recipient}
            unlockDate={unlockDate}
            minUnlockDate={minUnlockDate}
            onUnlockDate={setUnlockDate}
            recipientName={recipientName}
            onRecipientName={setRecipientName}
            recipientEmail={recipientEmail}
            onRecipientEmail={setRecipientEmail}
            question={question}
            onQuestion={setQuestion}
            answer={answer}
            onAnswer={setAnswer}
            error={error}
          />
        )}
      </div>

      <FooterButtons
        step={step}
        onBack={() => setStep(
          step === 'write' ? 'pick'
          : step === 'media' ? 'write'
          : 'media'
        )}
        onNext={() => {
          if (step === 'write') setStep('media')
          else if (step === 'media') setStep('seal')
        }}
        onSeal={onSeal}
        writeReady={writeReady}
        sealReady={sealReady}
        submitting={submitting}
      />
    </div>
  )
}

// =================================================================
// Pieces
// =================================================================

function CompactHeader() {
  const { theme } = useThemeStore()
  return (
    <div className="flex items-center justify-between px-12">
      <Link
        href="/letters"
        className="text-xs px-3 py-1.5 rounded-full transition"
        style={{
          background: theme.glass.bg,
          color: theme.text.muted,
          border: `1px solid ${theme.glass.border}`,
          fontFamily: 'Georgia, serif',
        }}
      >
        ← Letters
      </Link>
      <h1
        className="text-base"
        style={{ color: theme.text.primary, fontFamily: 'var(--font-playfair), Georgia, serif' }}
      >
        New letter
      </h1>
      <div className="w-12" aria-hidden />
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const { theme } = useThemeStore()
  const items: { key: Step; label: string }[] = [
    { key: 'write', label: 'Write' },
    { key: 'media', label: 'Media' },
    { key: 'seal', label: 'Seal' },
  ]
  return (
    <div className="flex items-center justify-center gap-2 mt-3 mb-1">
      {items.map((it, i) => {
        const active = it.key === step
        return (
          <div key={it.key} className="flex items-center gap-2">
            <span
              className="text-[10px] tracking-[0.18em] uppercase"
              style={{
                color: active ? theme.text.primary : theme.text.muted,
                opacity: active ? 1 : 0.6,
              }}
            >
              {it.label}
            </span>
            {i < items.length - 1 && (
              <span
                className="w-4 h-px"
                style={{ background: theme.glass.border }}
                aria-hidden
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function FooterButtons({
  step,
  onBack,
  onNext,
  onSeal,
  writeReady,
  sealReady,
  submitting,
}: {
  step: Step
  onBack: () => void
  onNext: () => void
  onSeal: () => void
  writeReady: boolean
  sealReady: boolean
  submitting: boolean
}) {
  const { theme } = useThemeStore()
  if (step === 'pick') return null

  const primary = step === 'write' ? { label: 'Next', enabled: writeReady, onClick: onNext }
    : step === 'media' ? { label: 'Fold & seal', enabled: writeReady, onClick: onNext }
    : { label: submitting ? 'Sealing…' : 'Seal letter', enabled: sealReady, onClick: onSeal }

  return (
    <div className="px-4 py-4 shrink-0 flex items-center gap-3"
      style={{ borderTop: `1px solid ${theme.glass.border}` }}>
      <button
        onClick={onBack}
        className="text-sm px-4 py-2.5 rounded-full"
        style={{
          background: theme.glass.bg,
          color: theme.text.muted,
          border: `1px solid ${theme.glass.border}`,
          fontFamily: 'Georgia, serif',
        }}
      >
        Back
      </button>
      <button
        onClick={primary.onClick}
        disabled={!primary.enabled}
        className="flex-1 py-2.5 rounded-full text-sm transition"
        style={{
          background: primary.enabled ? theme.accent.primary : `${theme.accent.primary}40`,
          color: '#fff',
          cursor: primary.enabled ? 'pointer' : 'not-allowed',
          fontFamily: 'Georgia, serif',
        }}
      >
        {primary.label}
      </button>
    </div>
  )
}

// -----------------------------------------------------------------
// Steps
// -----------------------------------------------------------------

function WriteStep({
  song,
  onSong,
  body,
  onBody,
}: {
  song: string
  onSong: (v: string) => void
  body: string
  onBody: (v: string) => void
}) {
  return (
    <Card scroll={false}>
      <SongField value={song} onChange={onSong} />
      <SectionLabel>The letter</SectionLabel>
      <textarea
        value={body}
        onChange={e => onBody(e.target.value)}
        placeholder="Dear future me…"
        maxLength={LETTER_BODY_MAX}
        className="flex-1 min-h-0 w-full resize-none outline-none rounded-lg p-3"
        style={{
          fontFamily: 'var(--font-caveat), Georgia, serif',
          fontSize: `${JOURNAL.FONT_SIZE}px`,
          lineHeight: `${JOURNAL.LINE_HEIGHT}px`,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid var(--paper-border, rgba(0,0,0,0.1))`,
          color: 'inherit',
          overflowY: 'auto',
          minHeight: 160,
        }}
      />
      <CharCount value={body.length} max={LETTER_BODY_MAX} />
    </Card>
  )
}

function MediaStep({
  photos,
  onPhotoAdd,
  doodleStrokes,
  onStrokesChange,
}: {
  photos: Photo[]
  onPhotoAdd: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  doodleStrokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
}) {
  const { theme } = useThemeStore()
  const dateCaption = new Date()
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()
  return (
    <Card scroll>
      <SectionLabel>Photos</SectionLabel>
      <PhotoBlock photos={photos} onPhotoAdd={onPhotoAdd} dateCaption={dateCaption} />
      <SectionLabel>Draw</SectionLabel>
      <div style={{ height: 220 }}>
        <CompactDoodleCanvas
          strokes={doodleStrokes}
          onStrokesChange={onStrokesChange}
          doodleColors={[theme.text.primary, theme.accent.primary, theme.accent.warm, theme.text.muted]}
          canvasBackground={theme.bg.secondary}
          canvasBorder={theme.glass.border}
          textColor={theme.text.primary}
          mutedColor={theme.text.muted}
        />
      </div>
    </Card>
  )
}

function SealStep({
  recipient,
  unlockDate,
  minUnlockDate,
  onUnlockDate,
  recipientName,
  onRecipientName,
  recipientEmail,
  onRecipientEmail,
  question,
  onQuestion,
  answer,
  onAnswer,
  error,
}: {
  recipient: Recipient
  unlockDate: string
  minUnlockDate: string
  onUnlockDate: (v: string) => void
  recipientName: string
  onRecipientName: (v: string) => void
  recipientEmail: string
  onRecipientEmail: (v: string) => void
  question: string
  onQuestion: (v: string) => void
  answer: string
  onAnswer: (v: string) => void
  error: string | null
}) {
  const { theme } = useThemeStore()
  const fieldStyle: React.CSSProperties = {
    border: `1px solid ${theme.glass.border}`,
    color: theme.text.primary,
    background: 'rgba(255,255,255,0.03)',
  }
  return (
    <Card scroll>
      {recipient === 'friend' && (
        <>
          <SectionLabel>Who is it for?</SectionLabel>
          <input
            type="text"
            value={recipientName}
            onChange={e => onRecipientName(e.target.value)}
            placeholder="Their name"
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none mb-2"
            style={fieldStyle}
          />
          <input
            type="email"
            value={recipientEmail}
            onChange={e => onRecipientEmail(e.target.value)}
            placeholder="Their email"
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
            style={fieldStyle}
          />

          <SectionLabel>A question only they can answer</SectionLabel>
          <input
            type="text"
            value={question}
            onChange={e => onQuestion(e.target.value)}
            placeholder="e.g. The name of our school"
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none mb-2"
            style={fieldStyle}
          />
          <input
            type="text"
            value={answer}
            onChange={e => onAnswer(e.target.value)}
            placeholder="The answer (we never store this)"
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
            style={fieldStyle}
          />
          <div className="text-[10px] italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
            The letter unlocks for them only when they type this answer.
          </div>
        </>
      )}

      <SectionLabel>Opens on</SectionLabel>
      <input
        type="date"
        value={unlockDate}
        min={minUnlockDate}
        onChange={e => onUnlockDate(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
        style={fieldStyle}
      />
      <div className="text-[10px] italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
        Earliest: one week from today.
      </div>

      {error && (
        <div className="text-xs rounded-lg px-3 py-2 mt-2"
          style={{ background: 'rgba(192,57,43,0.12)', color: '#c0392b' }}>
          {error}
        </div>
      )}
    </Card>
  )
}

// -----------------------------------------------------------------
// Atoms
// -----------------------------------------------------------------

function Card({ children, scroll }: { children: React.ReactNode; scroll: boolean }) {
  const { theme } = useThemeStore()
  return (
    <div
      className={`h-full rounded-2xl p-4 flex flex-col gap-3 min-h-0 ${scroll ? 'overflow-y-auto' : ''}`}
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        WebkitBackdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      }}
    >
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] font-medium mt-1"
      style={{ color: theme.text.muted }}>
      {children}
    </div>
  )
}

function CharCount({ value, max }: { value: number; max: number }) {
  const { theme } = useThemeStore()
  return (
    <div className="text-right text-[10px] shrink-0"
      style={{ color: value > max * 0.9 ? theme.accent.warm : theme.text.muted }}>
      {value} / {max}
    </div>
  )
}

function SongField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme } = useThemeStore()
  return (
    <div className="shrink-0">
      <SectionLabel>Add a song (optional)</SectionLabel>
      {value && (value.startsWith('{') || /https?:\/\//.test(value)) ? (
        <div className="relative">
          <SongEmbed url={value} compact audioOnly />
          <button
            onClick={() => onChange('')}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs"
            style={{ background: theme.glass.bg, color: theme.text.muted }}
          >
            ×
          </button>
        </div>
      ) : (
        <SongPicker
          value={value}
          onChange={(next) => onChange(next ?? '')}
          placeholder="Search a song or paste a link…"
        />
      )}
    </div>
  )
}

function RecipientCard({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  const { theme } = useThemeStore()
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl px-5 py-5 transition"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
      }}
    >
      <div className="text-base mb-1"
        style={{ color: theme.text.primary, fontFamily: 'var(--font-playfair), Georgia, serif' }}>
        {title}
      </div>
      <div className="text-xs italic"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
        {subtitle}
      </div>
    </button>
  )
}
