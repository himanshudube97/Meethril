'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { InboxLetter } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'
import { PostcardFront } from '../compose/PostcardFront'
import { PostcardBack } from '../compose/PostcardBack'
import type { Photo } from '@/components/desk/PhotoBlock'
import type { StrokeData, JournalEntry } from '@/store/journal'

interface Props {
  letter: InboxLetter | null
  onClose: () => void
  /** Called once when the user breaks the seal on an unread letter. */
  onMarkRead: (id: string) => void
}

type Phase = 'sealed' | 'breaking' | 'opening' | 'shown'

interface LetterContent {
  text: string
  song: string | null
  photos: Photo[]
  doodleStrokes: StrokeData[]
}

export default function RevealModal({ letter, onClose, onMarkRead }: Props) {
  const [phase, setPhase] = useState<Phase>('sealed')
  const [content, setContent] = useState<LetterContent>({
    text: '', song: null, photos: [], doodleStrokes: [],
  })
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [cardScale, setCardScale] = useState(1)
  const { decryptEntryFromServer, isE2EEReady } = useE2EE()

  // Uniformly scale the postcard to fit the viewport (same approach as the
  // journal / compose view) so its 760×860 aspect ratio never distorts.
  useEffect(() => {
    const DESIGN_W = 820
    const DESIGN_H = 900
    const MARGIN_X = 48
    const MARGIN_Y = 110
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

  useEffect(() => {
    if (!letter) return
    setPhase(letter.isViewed ? 'shown' : 'sealed')
    setFace('front')
    setContent({ text: '', song: null, photos: [], doodleStrokes: [] })

    // Self letters (new flow) encrypt a JSON blob `{text, song, photos,
    // doodleStrokes}`. Legacy / friend letters decrypt to a plain string and
    // only fill `text`.
    const apply = (raw: string) => {
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw) as {
            text?: unknown
            song?: unknown
            photos?: unknown
            doodleStrokes?: unknown
          }
          setContent({
            text: typeof parsed.text === 'string' ? parsed.text : '',
            song: typeof parsed.song === 'string' ? parsed.song : null,
            photos: Array.isArray(parsed.photos)
              ? (parsed.photos as Array<Record<string, unknown>>)
                  .filter((p) => p.position === 1 || p.position === 2)
                  .map((p) => ({
                    url: (p.url as string) ?? undefined,
                    encryptedRef: (p.encryptedRef as string) ?? undefined,
                    encryptedRefIV: (p.encryptedRefIV as string) ?? undefined,
                    rotation: typeof p.rotation === 'number' ? p.rotation : 0,
                    position: p.position as 1 | 2,
                  }))
              : [],
            doodleStrokes: Array.isArray(parsed.doodleStrokes)
              ? (parsed.doodleStrokes as StrokeData[])
              : [],
          })
          return
        } catch {
          // not JSON — fall through to plain text
        }
      }
      setContent({ text: raw, song: null, photos: [], doodleStrokes: [] })
    }

    // Prefer the ciphertext/text included inline in the inbox response — this
    // avoids a /api/entries/[id] roundtrip that 404s for native self-letters.
    if (letter.text !== undefined) {
      const inlineEntry = {
        id: letter.id,
        text: letter.text,
        encryptionType: letter.encryptionType,
        e2eeIVs: letter.e2eeIVs,
      } as unknown as JournalEntry
      decryptEntryFromServer(inlineEntry)
        .then((decrypted) => apply((decrypted?.text || '').toString()))
        .catch(() => apply(''))
      return
    }

    // Legacy fallback: fetch from /api/entries/[id] for older letters that
    // don't carry inline text.
    fetch(`/api/entries/${letter.id}`)
      .then((r) => r.json())
      .then(async (d) => {
        const entry = (d?.entry || d) as JournalEntry
        const decrypted = await decryptEntryFromServer(entry)
        apply((decrypted?.text || '').toString())
      })
      .catch(() => apply(''))
  }, [letter, decryptEntryFromServer, isE2EEReady])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!letter) return null

  function breakSeal() {
    if (phase !== 'sealed') return
    setPhase('breaking')
    emitWaxParticles()
    setTimeout(() => setPhase('opening'), 700)
    setTimeout(() => setPhase('shown'), 1500)
    if (!letter!.isViewed) onMarkRead(letter!.id)
  }

  function emitWaxParticles() {
    const env = document.querySelector('.reveal-env')
    if (!env) return
    for (let i = 0; i < 8; i++) {
      const p = document.createElement('div')
      p.className = 'wax-particle fly'
      const angle = (i / 8) * Math.PI * 2
      const dist = 40 + Math.random() * 30
      p.style.setProperty('--tx', `${Math.cos(angle) * dist}px`)
      p.style.setProperty('--ty', `${Math.sin(angle) * dist}px`)
      env.appendChild(p)
      setTimeout(() => p.remove(), 1000)
    }
  }

  const sealed = phase === 'sealed'
  const flapOpen = phase === 'opening' || phase === 'shown'
  const postcardShown = phase === 'shown'
  const salutationName = (letter.recipientName ?? 'future me').replace(/^to /, '')
  const cardRotateY = face === 'back' ? 180 : 0

  return (
    <div
      className="reveal-overlay open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button className="reveal-close" onClick={onClose} aria-label="close">×</button>

      {/* ENVELOPE STAGE — the sealed letter + seal-break gesture. Hidden once
          the postcard is shown (the envelope "becomes" the letter). */}
      {!postcardShown && (
        <div className="reveal-stage">
          <div className="reveal-meta">
            a letter <span className="from">from past you</span> · sealed {sealedLabel(letter.sealedAt)}
          </div>

          <div className={`reveal-env phase-${phase}`} onClick={breakSeal}>
            <div className="env-back" />
            <div className={`env-flap${flapOpen ? ' opened' : ''}`} />
            <div className={`env-seal${!sealed ? ' broken' : ''}`}>
              <div className={`wax-half left${!sealed ? ' broken' : ''}`} />
              <div className={`wax-half right${!sealed ? ' broken' : ''}`} />
              <div className="seal-mark">✦</div>
            </div>
          </div>

          {sealed && <div className="reveal-prompt">tap to break the seal</div>}
        </div>
      )}

      {/* POSTCARD STAGE — the exact card the user wrote, read-only + flippable. */}
      {postcardShown && (
        <motion.div
          initial={{ opacity: 0, scale: cardScale * 0.92 }}
          animate={{ opacity: 1, scale: cardScale }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ perspective: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* No leather mat here — the reveal shows just the bare postcard.
              The blotter lives on the compose/writing view only. The card keeps
              its fixed design size; the wrapper above scales it to fit. */}
          <motion.div
            style={{
              width: 760,
              height: 860,
              position: 'relative',
              transformStyle: 'preserve-3d',
            }}
          >
            <motion.div
              animate={{ rotateY: cardRotateY }}
              transition={{ duration: 0.85, ease: [0.45, 0.05, 0.15, 1] }}
              style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}
            >
              <PostcardFront
                readOnly
                active={face === 'front'}
                salutationName={salutationName}
                body={content.text}
                onTurnOver={() => setFace('back')}
                createdAt={new Date(letter.sealedAt)}
              />
              <PostcardBack
                readOnly
                active={face === 'back'}
                photos={content.photos}
                doodleStrokes={content.doodleStrokes}
                song={content.song}
                onTurnBack={() => setFace('front')}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      <style jsx>{`
        .reveal-overlay {
          position: fixed;
          inset: 0;
          z-index: 220;
          display: none;
          align-items: center;
          justify-content: center;
          background:
            radial-gradient(ellipse at center, rgba(50, 30, 18, 0.55) 0%, rgba(15, 10, 6, 0.94) 90%);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          perspective: 1600px;
        }
        .reveal-overlay.open { display: flex; }
        .reveal-stage {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          transform-style: preserve-3d;
        }
        .reveal-meta {
          color: rgba(255, 240, 210, 0.85);
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 14px;
          letter-spacing: 2.4px;
          text-transform: lowercase;
          text-align: center;
          opacity: 0;
          animation: fadeIn 1s ease 0.3s forwards;
        }
        .reveal-meta .from {
          color: var(--accent-glow, #ffd29e);
          font-family: 'Caveat', cursive;
          font-size: 18px;
          font-style: normal;
          margin: 0 4px;
          letter-spacing: 0;
        }
        @keyframes fadeIn { to { opacity: 1; } }

        .reveal-env {
          position: relative;
          width: 320px;
          height: 220px;
          transform-style: preserve-3d;
          cursor: pointer;
          opacity: 0;
          animation: floatUp 1s cubic-bezier(.2, .9, .3, 1) 0.5s forwards;
        }
        @keyframes floatUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reveal-env::before {
          content: '';
          position: absolute;
          inset: -60px;
          background: radial-gradient(circle,
            rgba(255, 220, 160, 0.35) 0%,
            rgba(255, 200, 130, 0.15) 35%,
            transparent 65%);
          pointer-events: none;
          animation: haloPulse 4s ease-in-out infinite;
          z-index: -1;
        }
        @keyframes haloPulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%      { opacity: 1;   transform: scale(1.08); }
        }

        .env-back {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(135deg,
              #f8edd2 0%, #f4ead0 40%, #ead9b0 100%);
          border-radius: 4px;
          box-shadow:
            0 20px 50px rgba(0,0,0,0.55),
            0 4px 8px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.4);
          border: 1px solid rgba(80,60,40,0.25);
        }
        .env-flap {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 56%;
          background:
            linear-gradient(180deg, #f0e2bc, #d8c890 90%);
          clip-path: polygon(0 0, 50% 100%, 100% 0);
          border-bottom: 1px solid rgba(80,60,40,0.25);
          transform-origin: top center;
          transition: transform 1s cubic-bezier(.5, 0, .3, 1);
          z-index: 3;
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .env-flap.opened {
          transform: rotateX(-178deg);
        }

        .env-seal {
          position: absolute;
          left: 50%; top: 56%;
          width: 56px; height: 56px;
          margin-left: -28px;
          margin-top: -28px;
          z-index: 5;
          pointer-events: none;
        }
        .env-seal .wax-half {
          position: absolute;
          top: 0; bottom: 0;
          width: 50%;
          background: radial-gradient(circle at 30% 30%, #c44a36, #8b3a2a 70%);
          box-shadow:
            inset 0 1px 1px rgba(255,200,180,0.4),
            inset 0 -3px 4px rgba(0,0,0,0.3),
            0 1px 3px rgba(0,0,0,0.4);
          transition: transform 1s cubic-bezier(.4, 0, .2, 1),
                      opacity 1s ease;
        }
        .env-seal .wax-half.left {
          left: 0;
          border-radius: 50% 0 0 50% / 50% 0 0 50%;
          transform-origin: right center;
        }
        .env-seal .wax-half.right {
          right: 0;
          border-radius: 0 50% 50% 0 / 0 50% 50% 0;
          transform-origin: left center;
        }
        .env-seal .wax-half.broken.left {
          transform: translateX(-50px) translateY(20px) rotate(-30deg);
          opacity: 0;
        }
        .env-seal .wax-half.broken.right {
          transform: translateX(50px) translateY(20px) rotate(30deg);
          opacity: 0;
        }
        .env-seal .seal-mark {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: rgba(255, 220, 200, 0.6);
          font-size: 22px;
          pointer-events: none;
          transition: opacity 0.6s ease;
        }
        .env-seal.broken .seal-mark { opacity: 0; }

        .wax-particle {
          position: absolute;
          left: 50%; top: 50%;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: #8b3a2a;
          pointer-events: none;
          opacity: 0;
        }
        .wax-particle.fly {
          animation: particleFly 0.9s ease-out forwards;
        }
        @keyframes particleFly {
          0%   { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.4); }
        }

        .reveal-prompt {
          color: rgba(255, 240, 210, 0.7);
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: 1.5px;
          animation: bob 2.2s ease-in-out infinite;
          transition: opacity 0.5s ease;
        }
        .reveal-prompt.gone { opacity: 0; pointer-events: none; }
        @keyframes bob {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50%      { transform: translateY(-3px); opacity: 1; }
        }

        .reveal-close {
          position: fixed;
          top: 18px; right: 22px;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255, 240, 210, 0.3);
          color: rgba(255, 240, 210, 0.85);
          width: 32px; height: 32px;
          border-radius: 50%;
          cursor: pointer;
          z-index: 230;
          font-size: 16px;
          line-height: 1;
        }
      `}</style>
    </div>
  )
}

function sealedLabel(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
