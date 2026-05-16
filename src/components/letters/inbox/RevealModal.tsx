'use client'

import { useEffect, useState } from 'react'
import type { InboxLetter } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'

interface Props {
  letter: InboxLetter | null
  onClose: () => void
  /** Called once when the user breaks the seal on an unread letter. */
  onMarkRead: (id: string) => void
}

type Phase = 'sealed' | 'breaking' | 'opening' | 'shown'

export default function RevealModal({ letter, onClose, onMarkRead }: Props) {
  const [phase, setPhase] = useState<Phase>('sealed')
  const [body, setBody] = useState<string>('')
  const { decryptEntryFromServer, isE2EEReady } = useE2EE()

  useEffect(() => {
    if (!letter) return
    setPhase(letter.isViewed ? 'shown' : 'sealed')
    setBody('')

    // Prefer the ciphertext/text that is included inline in the inbox response
    // (added in Phase 4). This avoids a /api/entries/[id] roundtrip that would
    // 404 for native self-letters whose id is a Letter.id with no JournalEntry.
    if (letter.text !== undefined) {
      const inlineEntry = {
        id: letter.id,
        text: letter.text,
        encryptionType: letter.encryptionType,
        e2eeIVs: letter.e2eeIVs,
      } as unknown as JournalEntry
      decryptEntryFromServer(inlineEntry)
        .then(decrypted => setBody((decrypted?.text || '').toString()))
        .catch(() => setBody(''))
      return
    }

    // Legacy fallback: fetch from /api/entries/[id] for older letters that
    // don't carry inline text. Only applies to JournalEntry-anchored rows
    // (where letter.id is a JournalEntry.id).
    fetch(`/api/entries/${letter.id}`)
      .then(r => r.json())
      .then(async d => {
        const entry = (d?.entry || d) as JournalEntry
        // Decrypt E2EE entry client-side; non-e2ee passes through unchanged.
        const decrypted = await decryptEntryFromServer(entry)
        setBody((decrypted?.text || '').toString())
      })
      .catch(() => setBody(''))
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
  const letterShown = phase === 'shown'

  return (
    <div
      className="reveal-overlay open"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <button className="reveal-close" onClick={onClose} aria-label="close">×</button>

      <div className="reveal-stage">
        <div className="reveal-meta">
          a letter <span className="from">from past you</span> · sealed {sealedLabel(letter.sealedAt)}
        </div>

        <div className={`reveal-env phase-${phase}`} onClick={breakSeal}>
          <div className="env-back" />
          <div className={`env-letter${letterShown ? ' shown' : ''}`}>
            <div className="letter-salutation">{salutationFor(letter)}</div>
            <div className="letter-body">{body}</div>
            <div className="letter-sig">
              yours, <span style={{ textDecoration: 'underline dotted' }}>me</span>
            </div>
          </div>
          <div className={`env-flap${flapOpen ? ' opened' : ''}`} />
          <div className={`env-seal${!sealed ? ' broken' : ''}`}>
            <div className={`wax-half left${!sealed ? ' broken' : ''}`} />
            <div className={`wax-half right${!sealed ? ' broken' : ''}`} />
            <div className="seal-mark">✦</div>
          </div>
        </div>

        {sealed && <div className="reveal-prompt">tap to break the seal</div>}
      </div>

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

        .env-letter {
          position: absolute;
          left: 8%; right: 8%;
          bottom: 8%;
          height: 70%;
          background:
            repeating-linear-gradient(transparent, transparent 22px,
              rgba(120,90,50,0.15) 22px, rgba(120,90,50,0.15) 23px),
            var(--paper-cream, #f4ead0);
          border-radius: 2px;
          padding: 14px 16px 12px;
          font-family: 'Caveat', cursive;
          color: #1f2750;
          text-align: left;
          line-height: 23px;
          overflow: hidden;
          transform-origin: bottom center;
          transform: translateY(0) scale(0.85);
          opacity: 0;
          box-shadow: 0 -2px 4px rgba(0,0,0,0.1);
          transition:
            transform 1.1s cubic-bezier(.3, .8, .3, 1) 0.6s,
            opacity 0.8s ease 0.6s,
            width 0.6s ease 0.6s;
          z-index: 2;
        }
        .env-letter.shown {
          z-index: 10;
          opacity: 1;
          transform: translateY(-220px) scale(2.2);
          pointer-events: auto;
        }
        .env-letter .letter-salutation {
          font-size: 15px;
          margin-bottom: 5px;
        }
        .env-letter .letter-body {
          font-size: 11px;
          line-height: 17px;
        }
        .env-letter .letter-sig {
          margin-top: 8px;
          font-size: 12px;
          text-align: right;
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

function salutationFor(l: InboxLetter): string {
  const r = l.recipientName ?? 'future me'
  if (r.startsWith('to ')) return `Dear ${r.slice(3)},`
  return r === 'future me' ? 'Dear future me,' : `Dear ${r},`
}
