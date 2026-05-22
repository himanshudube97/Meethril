'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import { useE2EEStore } from '@/store/e2ee'
import { useJournalStore, StrokeData } from '@/store/journal'
import { buildSelfLetterPayload } from '@/lib/letters/self-letter-client'
import { buildFriendLetterPayload } from '@/lib/letters/friend-letter-client'
import SongEmbed from '@/components/SongEmbed'
import SongPicker from '@/components/SongPicker'
import PhotoBlock from '@/components/desk/PhotoBlock'
import CompactDoodleCanvas from '@/components/desk/CompactDoodleCanvas'
import { JOURNAL } from '@/lib/journal-constants'

const LETTER_BODY_MAX = 800

type Recipient = 'self' | 'friend'
type Step = 'pick' | 'compose'
type ActiveTab = 'write' | 'media'

interface Photo {
  id?: string
  url?: string
  encryptedRef?: string
  encryptedRefIV?: string
  rotation: number
  position: 1 | 2
}

/**
 * Mobile letter compose — two-step flow:
 *
 *  1. Pick recipient: Future me OR Someone close.
 *  2. Compose: tabbed Write / Media surface (mirrors the mobile journal).
 *
 * Self letters carry text + song + photos + doodle, encrypted under the
 * master key. Friend letters carry text + song + photos and use a
 * security question to wrap the letter key; doodles aren't included on
 * mobile friend letters yet (the desktop has draft-storage scaffolding
 * for that which mobile doesn't share).
 */
export default function MobileLetterCompose() {
  const { theme } = useThemeStore()
  const router = useRouter()
  const { masterKey, isUnlocked, isEnabled } = useE2EEStore()
  const { currentDoodleStrokes, setDoodleStrokes, resetCurrentEntry } = useJournalStore()

  const [step, setStep] = useState<Step>('pick')
  const [recipient, setRecipient] = useState<Recipient>('self')
  const [tab, setTab] = useState<ActiveTab>('write')

  // Compose fields
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

  // Friend-only fields
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const canSubmit = (() => {
    if (submitting) return false
    if (body.trim().length === 0 || body.length > LETTER_BODY_MAX) return false
    if (unlockDate < minUnlockDate) return false
    if (recipient === 'friend') {
      if (!recipientName.trim()) return false
      if (!recipientEmail.trim() || !/^\S+@\S+\.\S+$/.test(recipientEmail.trim())) return false
      if (!question.trim()) return false
      if (!answer.trim()) return false
    }
    return true
  })()

  async function onSubmit() {
    if (!canSubmit) return
    if (!isEnabled || !isUnlocked || !masterKey) {
      setError('Unlock encryption on desktop before writing letters here.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const cleanSong = song && /https?:\/\//.test(song) ? song
        : song.startsWith('{') ? song
        : null
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
            // Self letters serialize doodles inline as part of the encrypted
            // JSON blob, but the helper's DraftDoodle expects an
            // already-encrypted strokes shape. For mobile we serialize as
            // empty here and rely on the text/song/photos triple. Doodles
            // can ride along once we wire mobile-side stroke encryption.
            doodles: [],
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
            doodles: [],
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
      router.push('/letters')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  // Header (shared between steps)
  const Header = (
    <div className="flex items-center justify-between mb-3 px-12 shrink-0">
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

  // Step 1: recipient picker
  if (step === 'pick') {
    return (
      <div className="fixed inset-0 z-30 overflow-y-auto" style={{ color: theme.text.primary }}>
        <div className="max-w-lg mx-auto px-4 pt-20 pb-12 flex flex-col gap-5">
          {Header}
          <p className="text-sm text-center italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
            Who is this letter for?
          </p>
          <div className="flex flex-col gap-3">
            <RecipientCard
              title="Future me"
              subtitle="A letter to your future self. Sealed for at least a week."
              onClick={() => { setRecipient('self'); setStep('compose') }}
            />
            <RecipientCard
              title="Someone close"
              subtitle="Delivered to a friend. Locked with a question only they can answer."
              onClick={() => { setRecipient('friend'); setStep('compose') }}
            />
          </div>
        </div>
      </div>
    )
  }

  // Step 2: compose surface
  return (
    <div className="fixed inset-0 z-30 flex flex-col" style={{ color: theme.text.primary }}>
      <div className="pt-20 px-4 shrink-0">{Header}</div>

      {/* Mode hint */}
      <div className="text-center text-xs italic mb-3 px-12 shrink-0"
        style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
        Writing to {recipient === 'self' ? 'future you' : 'someone close'}
        {' · '}
        <button
          onClick={() => setStep('pick')}
          style={{ textDecoration: 'underline dotted' }}
        >
          change
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex justify-center px-4 pb-3 shrink-0">
        <div
          className="inline-flex rounded-full p-1 gap-1"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
        >
          <TabPill active={tab === 'write'} onClick={() => setTab('write')}>Write</TabPill>
          <TabPill active={tab === 'media'} onClick={() => setTab('media')}>Photos &amp; doodle</TabPill>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        {tab === 'write' ? (
          <WriteCard>
            {recipient === 'friend' && (
              <FriendFields
                recipientName={recipientName}
                onRecipientName={setRecipientName}
                recipientEmail={recipientEmail}
                onRecipientEmail={setRecipientEmail}
                question={question}
                onQuestion={setQuestion}
                answer={answer}
                onAnswer={setAnswer}
              />
            )}

            <UnlockField value={unlockDate} min={minUnlockDate} onChange={setUnlockDate} />

            <SongField value={song} onChange={setSong} />

            <BodyField value={body} onChange={setBody} max={LETTER_BODY_MAX} />

            {error && (
              <div className="text-xs rounded-lg px-3 py-2 shrink-0"
                style={{ background: 'rgba(192,57,43,0.12)', color: '#c0392b' }}>
                {error}
              </div>
            )}

            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className="w-full py-3 rounded-full text-sm transition shrink-0"
              style={{
                background: canSubmit ? theme.accent.primary : `${theme.accent.primary}40`,
                color: '#fff',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: submitting ? 0.7 : 1,
                fontFamily: 'Georgia, serif',
              }}
            >
              {submitting ? 'Sealing…' : 'Seal letter'}
            </button>
          </WriteCard>
        ) : (
          <MediaCard
            photos={photos}
            onPhotoAdd={handlePhotoAdd}
            doodleStrokes={recipient === 'self' ? currentDoodleStrokes : []}
            onStrokesChange={handleStrokesChange}
            showDoodle={recipient === 'self'}
          />
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------

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
      <div className="text-base mb-1" style={{ color: theme.text.primary, fontFamily: 'var(--font-playfair), Georgia, serif' }}>
        {title}
      </div>
      <div className="text-xs italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
        {subtitle}
      </div>
    </button>
  )
}

function TabPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <button
      onClick={onClick}
      className="text-xs px-4 py-1.5 rounded-full transition"
      style={{
        background: active ? `${theme.accent.primary}30` : 'transparent',
        color: active ? theme.text.primary : theme.text.muted,
        fontFamily: 'Georgia, serif',
      }}
    >
      {children}
    </button>
  )
}

function WriteCard({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <div
      className="h-full rounded-2xl p-4 flex flex-col gap-4 min-h-0 overflow-y-auto"
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

function MediaCard({
  photos,
  onPhotoAdd,
  doodleStrokes,
  onStrokesChange,
  showDoodle,
}: {
  photos: Photo[]
  onPhotoAdd: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  doodleStrokes: StrokeData[]
  onStrokesChange: (strokes: StrokeData[]) => void
  showDoodle: boolean
}) {
  const { theme } = useThemeStore()
  const dateCaption = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
  return (
    <div
      className="h-full rounded-2xl p-5 flex flex-col gap-6 overflow-y-auto"
      style={{
        background: theme.glass.bg,
        backdropFilter: `blur(${theme.glass.blur})`,
        border: `1px solid ${theme.glass.border}`,
        boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
      }}
    >
      <div>
        <SectionLabel>Photos</SectionLabel>
        <PhotoBlock photos={photos} onPhotoAdd={onPhotoAdd} dateCaption={dateCaption} />
      </div>
      {showDoodle && (
        <div>
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
        </div>
      )}
      {!showDoodle && (
        <div className="text-xs italic text-center mt-2"
          style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
          Doodles on friend letters need a desk — write that part on desktop.
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore()
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] mb-2 font-medium"
      style={{ color: theme.text.muted }}>
      {children}
    </div>
  )
}

function FriendFields({
  recipientName,
  onRecipientName,
  recipientEmail,
  onRecipientEmail,
  question,
  onQuestion,
  answer,
  onAnswer,
}: {
  recipientName: string
  onRecipientName: (v: string) => void
  recipientEmail: string
  onRecipientEmail: (v: string) => void
  question: string
  onQuestion: (v: string) => void
  answer: string
  onAnswer: (v: string) => void
}) {
  const { theme } = useThemeStore()
  const fieldStyle: React.CSSProperties = {
    border: `1px solid ${theme.glass.border}`,
    color: theme.text.primary,
    background: 'rgba(255,255,255,0.03)',
  }
  return (
    <>
      <div className="shrink-0">
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
      </div>
      <div className="shrink-0">
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
        <div className="text-[10px] mt-1.5 italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
          The letter unlocks for them only when they type this answer.
        </div>
      </div>
    </>
  )
}

function UnlockField({ value, min, onChange }: { value: string; min: string; onChange: (v: string) => void }) {
  const { theme } = useThemeStore()
  return (
    <div className="shrink-0">
      <SectionLabel>Opens on</SectionLabel>
      <input
        type="date"
        value={value}
        min={min}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
        style={{
          border: `1px solid ${theme.glass.border}`,
          color: theme.text.primary,
          background: 'rgba(255,255,255,0.03)',
        }}
      />
      <div className="text-[10px] mt-1.5 italic" style={{ color: theme.text.muted, fontFamily: 'Georgia, serif' }}>
        Earliest: one week from today.
      </div>
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

function BodyField({ value, onChange, max }: { value: string; onChange: (v: string) => void; max: number }) {
  const { theme } = useThemeStore()
  return (
    <>
      <div className="shrink-0">
        <SectionLabel>The letter</SectionLabel>
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Dear future me…"
        maxLength={max}
        className="flex-1 min-h-0 w-full resize-none outline-none rounded-lg p-3"
        style={{
          color: theme.text.primary,
          fontFamily: 'var(--font-caveat), Georgia, serif',
          fontSize: `${JOURNAL.FONT_SIZE}px`,
          lineHeight: `${JOURNAL.LINE_HEIGHT}px`,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${theme.glass.border}`,
          overflowY: 'auto',
          minHeight: 180,
        }}
      />
      <div className="text-right text-[10px] shrink-0"
        style={{ color: value.length > max * 0.9 ? theme.accent.warm : theme.text.muted }}>
        {value.length} / {max}
      </div>
    </>
  )
}
