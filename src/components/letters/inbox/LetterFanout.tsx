'use client'

import { useEffect, useRef } from 'react'
import type { InboxLetter } from '../letterTypes'

interface Props {
  letters: InboxLetter[]
  /** Triggered when a fanned letter is clicked. */
  onLetterClick: (l: InboxLetter) => void
  /** Bumped to re-trigger the fan animation (e.g. on month change). */
  triggerKey: number
  /**
   * When false the fan stays empty — letters are tucked inside the postbox.
   * Toggled by clicking the postbox above which this component sits.
   */
  shown: boolean
}

const TILTS = [-3, 4, -5, 2, -1, 3]

export default function LetterFanout({ letters, onLetterClick, triggerKey, shown }: Props) {
  const fanRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fan = fanRef.current
    if (!fan) return
    fan.innerHTML = ''
    if (!shown) return
    if (letters.length === 0) return

    letters.forEach((l, i) => {
      const isUnread = !l.isViewed
      const tilt = TILTS[i % TILTS.length]
      const el = document.createElement('div')
      el.className = `fan-letter${isUnread ? ' unread' : ''}`
      const sub = `${isUnread ? '✦ unread · ' : ''}arrived ${formatMonthDay(l.unlockDate)}`
      el.innerHTML = `
        <div class="addr">${escape(l.recipientName ?? 'future me')}<small>${sub}</small></div>
        <div class="seal"></div>
        <div class="arrived">${isUnread ? 'sealed' : 'arrived'}</div>
      `
      // Start tucked at the postbox slot (which sits ~130px below the top of
      // the postbox / fanout anchor). Letters are then animated up to their
      // final fanned position above the dome.
      el.style.left = '0'
      el.style.top = '0'
      el.style.transform = 'translate(-50%, -50%) translateY(130px) scale(0.25)'
      el.style.opacity = '0'
      const offset = i - (letters.length - 1) / 2
      const finalRot = offset * 14 + tilt
      const finalX = offset * 80
      const finalY = -120 - Math.abs(offset) * 12
      const dur = isUnread ? 1.2 : 0.85
      const stagger = isUnread ? 220 : 150

      fan.appendChild(el)
      requestAnimationFrame(() => {
        setTimeout(() => {
          el.style.transition = `transform ${dur}s cubic-bezier(.25,.7,.4,1), opacity 0.7s ease`
          el.style.transform = `translate(-50%, -50%) translateY(${finalY}px) translateX(${finalX}px) rotate(${finalRot}deg) scale(1)`
          el.style.opacity = '1'
        }, i * stagger)
      })
      el.addEventListener('click', () => onLetterClick(l))
    })
  }, [letters, triggerKey, onLetterClick, shown])

  return (
    <div ref={fanRef} className="fanout" aria-hidden={!shown || letters.length === 0}>
      {/* styled-jsx must be `global` here because the .fan-letter elements
          are created imperatively via document.createElement above — they
          never pass through React, so the per-component scope class is
          never applied to them, and a non-global rule won't match. */}
      <style jsx global>{`
        .fanout {
          position: absolute; left: 50%; top: 0;
          width: 0; height: 0; z-index: 9; pointer-events: none;
        }
        .fan-letter {
          position: absolute;
          width: 130px; height: 86px;
          border-radius: 3px;
          background: var(--paper-1);
          box-shadow: 0 8px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.5);
          border: 1px solid var(--paper-2);
          transform-origin: bottom center;
          opacity: 0;
          cursor: pointer;
          pointer-events: auto;
          transition: filter .25s, transform .35s;
        }
        .fan-letter:hover { filter: brightness(1.05); }
        .fan-letter .seal {
          position: absolute;
          left: 50%; top: 50%;
          width: 18px; height: 18px;
          transform: translate(-50%,-30%);
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, var(--accent-warm), var(--accent-secondary) 70%);
          box-shadow: 0 1px 1px rgba(0,0,0,0.3);
        }
        .fan-letter .addr {
          position: absolute;
          left: 12px; top: 14px;
          font-family: 'Caveat', cursive;
          font-size: 14px;
          color: var(--text-primary);
        }
        .fan-letter .addr small {
          display: block;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 2px;
          letter-spacing: 0.4px;
        }
        .fan-letter .arrived {
          position: absolute;
          bottom: 6px; right: 8px;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 9px;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          color: var(--accent-secondary);
          opacity: 0.7;
        }
        .fan-letter.unread {
          box-shadow:
            0 8px 24px rgba(0,0,0,0.30),
            0 0 0 2px color-mix(in oklab, var(--accent-primary) 40%, transparent),
            0 0 24px color-mix(in oklab, var(--accent-highlight) 50%, transparent);
          animation: unreadGlow 2.4s ease-in-out infinite;
        }
        @keyframes unreadGlow {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.06); }
        }
        .fan-letter.unread .seal {
          animation: sealPulse 2s ease-in-out infinite;
        }
        @keyframes sealPulse {
          0%, 100% { transform: translate(-50%,-30%) scale(1); }
          50%      { transform: translate(-50%,-30%) scale(1.12); }
        }
      `}</style>
    </div>
  )
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'} as Record<string,string>)[c])
}
function formatMonthDay(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}
