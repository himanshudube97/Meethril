'use client'

import { ReactNode } from 'react'

interface Props {
  /** Slot for PostboxControls (year/month placards). Stage 4 fills this. */
  children?: ReactNode
  onClick?: () => void
}

export default function Postbox({ children, onClick }: Props) {
  return (
    <div className="postbox-wrap relative cursor-pointer">
      <div className="postbox" onClick={onClick}>
        <div className="dome" />
        <div className="brim" />
        <div className="body" />
        <div className="slot-hood"><span>letters</span></div>
        <div className="slot" />
        <div className="pincode">MEETHRIL · 1</div>
        <div className="band-mid" />
        <div className="swoosh-area">
          <svg viewBox="0 0 56 16" width="44" height="13" aria-hidden>
            <path d="M3,11 Q11,2 19,9 Q27,15 35,5 Q43,1 53,9"
                  stroke="var(--accent-warm)" strokeWidth="3"
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="53" cy="9" r="2.2" fill="var(--accent-warm)" />
          </svg>
          <span className="label">meethril post</span>
        </div>

        {children}

        <div className="band-base" />
      </div>
      <div className="pulse" />
      <style jsx>{`
        /* ── Indian-pillar postbox parts ── */

        .postbox-wrap {
          position: relative;
          cursor: pointer;
        }
        .postbox-wrap::after {
          content: '';
          position: absolute;
          left: -20%; right: -20%;
          bottom: -8px;
          height: 14px;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.30), transparent 70%);
          pointer-events: none;
        }
        .postbox {
          position: relative;
          width: 154px;
          height: 420px;
          transition: transform .35s cubic-bezier(.25,.8,.4,1);
        }
        .postbox-wrap:hover .postbox { transform: translateY(-3px); }

        /* Domed top */
        .postbox .dome {
          position: absolute;
          top: 0; left: 4px; right: 4px;
          height: 60px;
          background:
            radial-gradient(ellipse at 35% 28%,
              color-mix(in oklab, var(--postbox-1) 70%, white) 0%,
              var(--postbox-1) 28%,
              var(--postbox-2) 70%,
              var(--postbox-3) 100%);
          border-radius: 60% 60% 6px 6px / 100% 100% 6px 6px;
          box-shadow:
            inset 0 5px 10px rgba(255,255,255,0.22),
            inset 0 -3px 4px rgba(0,0,0,0.30),
            0 4px 8px rgba(0,0,0,0.28);
          z-index: 2;
        }

        /* Flat black brim/lip just under the dome */
        .postbox .brim {
          position: absolute;
          top: 54px; left: -8px; right: -8px;
          height: 14px;
          background:
            linear-gradient(180deg,
              #161210 0%,
              #2a221c 30%,
              #1a1410 70%,
              #050505 100%);
          border-radius: 3px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.18),
            inset 0 -2px 0 rgba(0,0,0,0.55),
            0 4px 6px rgba(0,0,0,0.30);
          z-index: 3;
        }

        /* Cylindrical body — horizontal gradient gives roundness */
        .postbox .body {
          position: absolute;
          left: 0; right: 0;
          top: 64px;
          bottom: 0;
          background:
            linear-gradient(90deg,
              var(--postbox-3) 0%,
              var(--postbox-2) 14%,
              var(--postbox-1) 36%,
              var(--postbox-1) 50%,
              var(--postbox-1) 64%,
              var(--postbox-2) 86%,
              var(--postbox-3) 100%);
          border-radius: 4px 4px 6px 6px;
          box-shadow:
            inset 0 0 18px rgba(0,0,0,0.22),
            0 12px 28px rgba(0,0,0,0.30);
        }

        /* Arched plate above the slot — "letters" sign */
        .postbox .slot-hood {
          position: absolute;
          top: 86px;
          left: 50%;
          transform: translateX(-50%);
          width: 96px;
          height: 36px;
          background: linear-gradient(180deg, #2c3236 0%, #0e1112 100%);
          border-radius: 4px 4px 22px 22px / 4px 4px 16px 16px;
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.20),
            inset 0 -3px 5px rgba(0,0,0,0.55),
            0 1px 2px rgba(0,0,0,0.4);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 4px;
          z-index: 3;
        }
        .postbox .slot-hood span {
          font-family: 'Caveat', cursive;
          font-style: italic;
          color: rgba(225, 225, 220, 0.9);
          font-size: 17px;
          letter-spacing: 1px;
          line-height: 1;
        }

        /* The actual slot opening — beneath the hood */
        .postbox .slot {
          position: absolute;
          top: 124px; left: 50%;
          transform: translateX(-50%);
          width: 80px; height: 7px;
          background: #050505;
          border-radius: 1.5px;
          box-shadow:
            inset 0 2px 4px rgba(0,0,0,0.95),
            0 1px 0 rgba(255,255,255,0.15);
          z-index: 3;
        }

        /* Pin-code-style label below the slot */
        .postbox .pincode {
          position: absolute;
          top: 140px;
          left: 50%;
          transform: translateX(-50%);
          color: rgba(255, 245, 230, 0.92);
          font-family: 'Cormorant Garamond', serif;
          font-size: 9px;
          letter-spacing: 2.5px;
          z-index: 3;
          text-shadow: 0 1px 2px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.9);
        }

        /* Middle horizontal black band */
        .postbox .band-mid {
          position: absolute;
          top: 168px;
          left: -6px; right: -6px;
          height: 16px;
          background:
            linear-gradient(180deg, #1a1310 0%, #0a0606 60%, #0a0606 100%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 -1px 0 rgba(255,255,255,0.05),
            0 1px 2px rgba(0,0,0,0.4);
          z-index: 3;
        }

        /* Swoosh logo + "meethril post" label */
        .postbox .swoosh-area {
          position: absolute;
          top: 196px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          z-index: 3;
        }
        .postbox .swoosh-area svg {
          filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));
        }
        .postbox .swoosh-area .label {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          color: rgba(255, 245, 230, 0.95);
          font-size: 9px;
          letter-spacing: 3px;
          text-transform: lowercase;
          text-shadow: 0 1px 2px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.9);
        }

        /* Bottom black base ring */
        .postbox .band-base {
          position: absolute;
          bottom: 0;
          left: -6px; right: -6px;
          height: 22px;
          background:
            linear-gradient(180deg, #1a1310 0%, #0a0606 50%, #0a0606 100%);
          border-radius: 0 0 6px 6px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 6px 10px rgba(0,0,0,0.35);
          z-index: 3;
        }

        /* pulse on the slot to invite clicking */
        .postbox-wrap .pulse {
          position: absolute;
          left: 50%; top: 124px;
          width: 80px; height: 7px;
          transform: translateX(-50%);
          border-radius: 2px;
          box-shadow: 0 0 0 0 var(--accent-highlight);
          pointer-events: none;
          animation: pulse 3s ease-out infinite;
          z-index: 4;
        }
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent-highlight) 50%, transparent); }
          80%  { box-shadow: 0 0 0 16px color-mix(in oklab, var(--accent-highlight) 0%, transparent); }
          100% { box-shadow: 0 0 0 0   color-mix(in oklab, var(--accent-highlight) 0%, transparent); }
        }
      `}</style>
    </div>
  )
}
