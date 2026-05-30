'use client'

import { useEffect, useState } from 'react'
import { MONTHS } from '../lettersData'

interface Props {
  year: number
  monthIdx: number
  yearMin: number
  yearMax: number
  /** highest selectable month in the current year (0-11). For the current real year, this is `today.getMonth()`. */
  monthMaxForCurrentYear: number
  onYearChange: (y: number) => void
  onMonthChange: (m: number) => void
}

export default function PostboxControls(p: Props) {
  const [yFlip, setYFlip] = useState(false)
  const [mFlip, setMFlip] = useState(false)

  useEffect(() => { setYFlip(true); const t = setTimeout(() => setYFlip(false), 320); return () => clearTimeout(t) }, [p.year])
  useEffect(() => { setMFlip(true); const t = setTimeout(() => setMFlip(false), 320); return () => clearTimeout(t) }, [p.monthIdx])

  const monthMax = p.year === p.yearMax ? p.monthMaxForCurrentYear : 11

  return (
    <div className="pb-controls" onClick={e => e.stopPropagation()}>
      <div className="pb-pill">
        <button className="pb-arrow"
                disabled={p.year <= p.yearMin}
                onClick={() => p.onYearChange(p.year - 1)}>◁</button>
        <span className={`pb-value${yFlip ? ' flip' : ''}`}>{p.year}</span>
        <button className="pb-arrow"
                disabled={p.year >= p.yearMax}
                onClick={() => p.onYearChange(p.year + 1)}>▷</button>
      </div>
      <div className="pb-pill">
        <button className="pb-arrow"
                disabled={p.monthIdx <= 0}
                onClick={() => p.onMonthChange(p.monthIdx - 1)}>◁</button>
        <span className={`pb-value${mFlip ? ' flip' : ''}`}>{MONTHS[p.monthIdx].toUpperCase()}</span>
        <button className="pb-arrow"
                disabled={p.monthIdx >= monthMax}
                onClick={() => p.onMonthChange(p.monthIdx + 1)}>▷</button>
      </div>
      <style jsx>{`
        /* the two engraved placards on the postbox face */
        .pb-controls {
          position: absolute;
          top: 246px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          gap: 6px;
          z-index: 4;
          width: 102px;
        }
        /* Solid dark engraved plate — opaque so the placard reads the same on
           every theme regardless of how light/dark the postbox body is. */
        .pb-pill {
          display: flex;
          align-items: stretch;
          background:
            linear-gradient(180deg, #221a14 0%, #14100c 50%, #221a14 100%);
          border: 1px solid rgba(0,0,0,0.7);
          border-top-color: rgba(255,255,255,0.16);
          border-radius: 3px;
          box-shadow:
            inset 0 1px 3px rgba(0,0,0,0.7),
            inset 0 -1px 0 rgba(255,255,255,0.08),
            0 1px 0 rgba(255,255,255,0.16);
          height: 26px;
          overflow: hidden;
        }
        .pb-arrow {
          background: transparent;
          border: none;
          color: rgba(255, 236, 210, 0.85);
          cursor: pointer;
          font-size: 11px;
          padding: 0 7px;
          line-height: 1;
          transition: color .15s, background .15s;
          user-select: none;
        }
        .pb-arrow:hover {
          color: var(--accent-highlight);
          background: rgba(255, 220, 180, 0.08);
        }
        .pb-arrow:disabled {
          color: rgba(255, 236, 210, 0.3);
          cursor: not-allowed;
          background: transparent;
        }
        .pb-value {
          flex: 1;
          text-align: center;
          align-self: center;
          font-family: 'Cormorant Garamond', serif;
          font-weight: 600;
          color: rgba(255, 244, 228, 0.98);
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          text-shadow:
            0 1px 2px rgba(0,0,0,0.8),
            0 0 6px color-mix(in oklab, var(--accent-highlight) 30%, transparent);
          transition: opacity .2s, transform .2s;
          white-space: nowrap;
        }
        .pb-value.flip {
          animation: pbFlip 0.32s ease;
        }
        @keyframes pbFlip {
          0%   { opacity: 1; transform: translateY(0); }
          50%  { opacity: 0; transform: translateY(-6px); }
          51%  { transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
