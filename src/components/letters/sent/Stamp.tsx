'use client'

import type { CSSProperties } from 'react'
import type { SentStamp } from '../letterTypes'

interface Props {
  stamp: SentStamp
  onClick: (s: SentStamp) => void
}

const ICONS = ['✦','✿','❀','☽','☼','✻','♡']
const TINTS = ['s-1','s-2','s-3','s-4'] as const
// Mix shapes for visual variety. Postage stays dominant.
const SHAPES = ['postage','postage','postage','circle','rect'] as const

/** Deterministic tint/icon/tilt/shape from the stamp ID so a stamp keeps its look across renders. */
function variantFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const tint  = TINTS[Math.abs(h)       % TINTS.length]
  const icon  = ICONS[Math.abs(h >> 4)  % ICONS.length]
  const tilt  = ((Math.abs(h >> 8) % 50) - 25) / 10  // -2.5 to +2.5
  // multiplicative scramble so short IDs (e.g. "1".."10") still distribute across shapes
  const shape = SHAPES[Math.abs(h * 13 + 7) % SHAPES.length]
  return { tint, icon, tilt, shape }
}

export default function Stamp({ stamp, onClick }: Props) {
  const v = variantFor(stamp.id)
  const denom = denomFor(stamp)
  const date = new Date(stamp.sealedAt).toLocaleString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className={`mount shape-${v.shape}`} onClick={() => onClick(stamp)}>
      {v.shape !== 'circle' && (
        <>
          <div className="corner tl" /><div className="corner tr" />
          <div className="corner bl" /><div className="corner br" />
        </>
      )}
      <div className={`stamp ${v.tint} shape-${v.shape}${stamp.isDelivered ? ' delivered' : ''}`}
           style={{ '--tilt': `${v.tilt}deg` } as CSSProperties}>
        <div className="frame">
          <div className="denom">{denom}</div>
          <div className="icon">{v.icon}</div>
          <div>
            <div className="country">meethril · evening post</div>
            <div className="denom-bottom">{date}</div>
          </div>
        </div>
      </div>
      <div className="caption">
        <strong>{stamp.recipientName ?? 'to future me'}</strong>
        {captionLine(stamp)}
      </div>
      <style jsx>{`
        .mount {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: transform .25s ease;
        }
        .mount:hover { transform: translateY(-3px); }
        .mount .corner {
          position: absolute;
          width: 12px; height: 12px;
          background: color-mix(in oklab, var(--paper-1) 75%, transparent);
          border: 1px solid color-mix(in oklab, var(--text-muted) 50%, transparent);
          pointer-events: none;
          z-index: 4;
        }
        .mount .corner.tl { top: -3px; left: 6px; transform: rotate(45deg); }
        .mount .corner.tr { top: -3px; right: 6px; transform: rotate(45deg); }
        .mount .corner.bl { bottom: 26px; left: 6px; transform: rotate(45deg); }
        .mount .corner.br { bottom: 26px; right: 6px; transform: rotate(45deg); }
        .stamp {
          position: relative;
          width: 100px; height: 130px;
          background: var(--paper-1);
          box-shadow: 0 6px 14px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.10);
          overflow: hidden;
          transform: rotate(var(--tilt, 0deg));
        }
        /* Postage shape — scalloped edges via mask */
        .stamp.shape-postage {
          -webkit-mask:
            radial-gradient(circle at 6px 0, transparent 4px, #000 4.5px) 0 0/12px 100%,
            radial-gradient(circle at 6px 100%, transparent 4px, #000 4.5px) 0 0/12px 100%,
            radial-gradient(circle at 0 6px, transparent 4px, #000 4.5px) 0 0/100% 12px,
            radial-gradient(circle at 100% 6px, transparent 4px, #000 4.5px) 0 0/100% 12px,
            linear-gradient(#000, #000);
          -webkit-mask-composite: source-in, source-in, source-in, source-in, source-over;
          mask:
            radial-gradient(circle at 6px 0, transparent 4px, #000 4.5px) 0 0/12px 100%,
            radial-gradient(circle at 6px 100%, transparent 4px, #000 4.5px) 0 0/12px 100%,
            radial-gradient(circle at 0 6px, transparent 4px, #000 4.5px) 0 0/100% 12px,
            radial-gradient(circle at 100% 6px, transparent 4px, #000 4.5px) 0 0/100% 12px,
            linear-gradient(#000, #000);
          mask-composite: intersect;
        }
        /* Circle shape — round seal */
        .stamp.shape-circle {
          width: 110px; height: 110px;
          border-radius: 50%;
          border: 1px solid color-mix(in oklab, var(--text-primary) 18%, transparent);
        }
        /* Rectangle shape — clean ticket */
        .stamp.shape-rect {
          border-radius: 3px;
          border: 1px solid color-mix(in oklab, var(--text-primary) 16%, transparent);
        }
        .stamp .frame {
          position: absolute;
          inset: 8px;
          border: 1.5px solid color-mix(in oklab, var(--text-primary) 60%, transparent);
          border-radius: 2px;
          padding: 6px 6px 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
        }
        .stamp.shape-circle .frame {
          inset: 9px;
          border-radius: 50%;
          padding: 10px 6px 12px;
        }
        .stamp.shape-circle .denom { align-self: center; }
        .stamp.shape-circle .icon { font-size: 24px; }
        .stamp.shape-circle .country { font-size: 6px; letter-spacing: 1.5px; }
        .stamp.shape-rect .frame {
          inset: 7px;
          border-radius: 2px;
        }
        /* DELIVERED watermark needs to stay inside circle bounds */
        .stamp.shape-circle.delivered .frame::after {
          right: 50%;
          transform: translateX(50%) rotate(-12deg);
          bottom: 14px;
        }
        .stamp .denom {
          align-self: flex-start;
          font-family: 'Cormorant Garamond', serif;
          font-weight: 500;
          font-size: 12px;
          color: var(--text-primary);
          letter-spacing: 0.5px;
        }
        .stamp .icon {
          font-size: 26px;
          color: var(--accent-primary);
          margin: 4px 0;
          filter: drop-shadow(0 1px 0 rgba(255,255,255,0.4));
        }
        .stamp .country {
          font-family: 'Cormorant Garamond', serif;
          font-size: 7px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: var(--text-muted);
          text-align: center;
        }
        .stamp .denom-bottom {
          font-family: 'Caveat', cursive;
          font-size: 14px;
          color: var(--accent-secondary);
          line-height: 1;
        }
        .stamp.delivered .frame::after {
          content: 'DELIVERED';
          position: absolute;
          bottom: 26px;
          right: -10px;
          font-family: 'Cormorant Garamond', serif;
          font-size: 10px;
          letter-spacing: 4px;
          color: color-mix(in oklab, var(--text-primary) 60%, transparent);
          border: 1.5px solid color-mix(in oklab, var(--text-primary) 60%, transparent);
          padding: 3px 6px;
          border-radius: 50%;
          transform: rotate(-12deg);
          pointer-events: none;
        }
        .stamp.delivered::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(15deg, transparent 40%, color-mix(in oklab, var(--text-primary) 35%, transparent) 40%, color-mix(in oklab, var(--text-primary) 35%, transparent) 41.5%, transparent 41.5%),
            linear-gradient(15deg, transparent 56%, color-mix(in oklab, var(--text-primary) 35%, transparent) 56%, color-mix(in oklab, var(--text-primary) 35%, transparent) 57.5%, transparent 57.5%);
          pointer-events: none;
        }
        :global(.stamp.s-1) { background: var(--paper-1); }
        :global(.stamp.s-2) { background: var(--paper-2); }
        :global(.stamp.s-3) { background: color-mix(in oklab, var(--accent-highlight) 18%, var(--paper-1) 82%); }
        :global(.stamp.s-4) { background: color-mix(in oklab, var(--accent-warm) 14%, var(--paper-1) 86%); }
        .mount .caption {
          margin-top: 10px;
          text-align: center;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.35;
          max-width: 110px;
        }
        .mount .caption strong {
          display: block;
          font-style: normal;
          font-family: 'Caveat', cursive;
          font-size: 14px;
          color: var(--text-primary);
          margin-bottom: 1px;
        }
      `}</style>
    </div>
  )
}

function denomFor(s: SentStamp): string {
  if (!s.unlockDate) return '∞'
  const sealed = new Date(s.sealedAt).getTime()
  const unlock = new Date(s.unlockDate).getTime()
  const months = Math.round((unlock - sealed) / (1000 * 60 * 60 * 24 * 30))
  if (months >= 12 && months % 12 === 0) return `${months / 12}y`
  if (months > 0) return `${months}m`
  return '—'
}

function captionLine(s: SentStamp): string {
  if (s.isDelivered) {
    const d = new Date(s.unlockDate ?? s.sealedAt)
    return `delivered ${d.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`
  }
  if (!s.unlockDate) return 'someday'
  return `opens ${new Date(s.unlockDate).toLocaleString('en-US', { month: 'short', day: 'numeric' })}`
}
