'use client'

import { useEffect, useMemo, useState } from 'react'
import Stamp from './Stamp'
import ReceiptModal from './ReceiptModal'
import type { SentStamp } from '../letterTypes'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

type Mode = 'monthly' | 'yearly'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return reduced
}

interface JarSentViewProps {
  stamps: SentStamp[]
  /** First valid (year, month) — defaults to (2026, 0) i.e. Jan 2026 (Hearth launch). */
  launchYear?: number
  launchMonth?: number
}

function todayYM() {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() }
}

export default function JarSentView({
  stamps,
  launchYear = 2026,
  launchMonth = 0,
}: JarSentViewProps) {
  const [open, setOpen] = useState<SentStamp | null>(null)
  const [opened, setOpened] = useState(false)
  const [mode, setMode] = useState<Mode>('monthly')

  const canGoPrev = (mode: Mode, year: number, month: number): boolean => {
    if (mode === 'yearly') return year > launchYear
    return year > launchYear || (year === launchYear && month > launchMonth)
  }
  const canGoNext = (mode: Mode, year: number, month: number): boolean => {
    const t = todayYM()
    if (mode === 'yearly') return year < t.y
    return year < t.y || (year === t.y && month < t.m)
  }
  const clampToBounds = (year: number, month: number): { y: number; m: number } => {
    const t = todayYM()
    if (year > t.y || (year === t.y && month > t.m)) return { y: t.y, m: t.m }
    if (year < launchYear || (year === launchYear && month < launchMonth)) {
      return { y: launchYear, m: launchMonth }
    }
    return { y: year, m: month }
  }

  const mostRecent = useMemo(() => {
    if (!stamps.length) {
      const t = todayYM()
      return clampToBounds(t.y, t.m)
    }
    const sorted = [...stamps].sort((a, b) => +new Date(b.sealedAt) - +new Date(a.sealedAt))
    const d = new Date(sorted[0].sealedAt)
    return clampToBounds(d.getFullYear(), d.getMonth())
  }, [stamps]) // eslint-disable-line react-hooks/exhaustive-deps -- launchYear/launchMonth captured intentionally; bounds are stable per mount

  const [year, setYear] = useState(mostRecent.y)
  const [month, setMonth] = useState(mostRecent.m)

  const filtered = useMemo(() => {
    return stamps.filter(s => {
      const d = new Date(s.sealedAt)
      if (d.getFullYear() !== year) return false
      if (mode === 'monthly') return d.getMonth() === month
      return true
    })
  }, [stamps, mode, year, month])

  const sealed = filtered.filter(s => !s.isDelivered).length
  const delivered = filtered.filter(s => s.isDelivered).length
  const total = filtered.length

  const prevAllowed = canGoPrev(mode, year, month)
  const nextAllowed = canGoNext(mode, year, month)

  const goPrev = () => {
    if (!prevAllowed) return
    setOpened(false)
    if (mode === 'yearly') setYear(y => y - 1)
    else {
      if (month === 0) { setMonth(11); setYear(y => y - 1) }
      else setMonth(m => m - 1)
    }
  }
  const goNext = () => {
    if (!nextAllowed) return
    setOpened(false)
    if (mode === 'yearly') setYear(y => y + 1)
    else {
      if (month === 11) { setMonth(0); setYear(y => y + 1) }
      else setMonth(m => m + 1)
    }
  }

  const onModeChange = (m: Mode) => {
    setOpened(false)
    if (m === 'monthly') {
      // when entering monthly, ensure (year, month) is within bounds
      const c = clampToBounds(year, month)
      setYear(c.y); setMonth(c.m)
    } else {
      // yearly: clamp year alone
      const t = todayYM()
      if (year > t.y) setYear(t.y)
      else if (year < launchYear) setYear(launchYear)
    }
    setMode(m)
  }

  const tagLabel = mode === 'yearly' ? String(year) : `${MONTHS[month]} ${year}`

  return (
    <section
      className="sent"
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at 50% -10%, var(--paper-1), transparent 55%), linear-gradient(180deg, var(--bg-1), var(--bg-2))',
        padding: '170px 56px 100px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 22 }}>
        <h2
          style={{
            fontFamily: 'var(--font-caveat), Caveat, cursive',
            fontSize: 38,
            lineHeight: 1.1,
            margin: 0,
            color: 'var(--text-primary, #4a2c2a)',
          }}
        >
          letters i&rsquo;ve sent
        </h2>
        <p
          style={{
            margin: '14px auto 0',
            maxWidth: 680,
            fontFamily: 'Cormorant Garamond, serif',
            fontStyle: 'italic',
            color: 'var(--text-primary, #4a2c2a)',
            fontSize: 26,
            lineHeight: 1.35,
            letterSpacing: 0.3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 14, opacity: 0.55, color: 'var(--accent-primary, #b35870)' }}>✦</span>
          tap the jar to see
          {' '}
          <span style={{ color: 'var(--accent-primary, #b35870)', fontWeight: 500 }}>who you&rsquo;ve written to</span>
          <span style={{ fontSize: 14, opacity: 0.55, color: 'var(--accent-primary, #b35870)' }}>✦</span>
        </p>
        <p
          style={{
            margin: '6px 0 0',
            fontFamily: 'Cormorant Garamond, serif',
            fontStyle: 'italic',
            color: 'var(--text-muted, #8a6868)',
            fontSize: 13,
            letterSpacing: 0.4,
          }}
        >
          each stamp inside is a letter you&rsquo;ve sent on its way
        </p>
      </header>

      <ModeToggle mode={mode} onChange={onModeChange} />

      {/* Fanout area — appears above jar when opened */}
      <div className={`fanout ${opened ? 'is-open' : ''}`}>
        {opened && filtered.length > 0 && (
          <div className="fan-grid">
            {filtered.map(s => (
              <Stamp key={s.id} stamp={s} onClick={setOpen} />
            ))}
          </div>
        )}
        {opened && filtered.length === 0 && (
          <div className="empty">
            no letters in this {mode === 'yearly' ? 'year' : 'month'}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Jar stage at bottom */}
      <div className="jar-stage">
        <div className="jar-block">
          <Jar
            sealed={sealed}
            delivered={delivered}
            total={total}
            totalEver={stamps.length}
            opened={opened}
            onToggle={() => setOpened(o => !o)}
          />
          <HangingTag
            label={tagLabel}
            count={total}
            onPrev={goPrev}
            onNext={goNext}
            canPrev={prevAllowed}
            canNext={nextAllowed}
          />
        </div>
        <div className="shelf" />
      </div>

      <ReceiptModal stamp={open} onClose={() => setOpen(null)} />

      {/* Screen-reader summary — narrates the current selection when navigating
          with the tag arrows or toggling mode. Visually hidden via clip. */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1, height: 1,
          margin: -1, padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Showing {total} letter{total === 1 ? '' : 's'} from {tagLabel}
        {total > 0 && `: ${sealed} sealed, ${delivered} delivered`}
      </div>

      <style jsx>{`
        .fanout {
          margin: 8px auto 0;
          max-width: 1100px;
          width: 100%;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity .35s ease, transform .35s ease;
          pointer-events: none;
          min-height: 0;
        }
        .fanout.is-open {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        .fan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
          gap: 26px 14px;
          padding: 14px 12px 6px;
        }
        .empty {
          text-align: center;
          margin-top: 24px;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 14px;
          color: var(--text-muted);
          opacity: 0.7;
        }
        .jar-stage {
          width: fit-content;
          margin: 0 auto;
          position: relative;
        }
        .jar-block {
          position: relative;
          width: 520px;
          height: 410px;
          margin: 0 auto;
        }
        .shelf {
          width: 380px;
          height: 10px;
          margin: -4px auto 0;
          background:
            linear-gradient(180deg,
              color-mix(in oklab, var(--shelf, var(--accent-warm)) 70%, #000 10%) 0%,
              var(--shelf, var(--accent-warm)) 60%,
              color-mix(in oklab, var(--shelf, var(--accent-warm)) 80%, #000 8%) 100%);
          border-radius: 2px;
          box-shadow:
            0 14px 22px -8px rgba(0,0,0,0.18),
            0 1px 0 rgba(255,255,255,0.25) inset;
        }
        @media (max-width: 640px) {
          /* Override the section's inline padding so the jar block
             doesn't get squeezed by 56px gutters on narrow phones. */
          .sent {
            padding: 80px 16px 60px !important;
          }
          .jar-block {
            width: 320px;
            height: 420px;
          }
          .jar-block :global(svg) {
            width: 240px;
            height: 290px;
          }
          /* Anchor the jar to the TOP of jar-block on mobile (instead of bottom),
             so the tag can stack underneath it without overlapping. */
          .jar-block :global(button.jar) {
            bottom: auto !important;
            top: 0;
          }
          .jar-block :global(button.jar:hover) {
            transform: translateX(-50%) translateY(-3px);
          }
        }
      `}</style>
    </section>
  )
}

/* ---------- Mode toggle ---------- */

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mt">
      <button className={mode === 'monthly' ? 'on' : ''} onClick={() => onChange('monthly')}>
        monthly
      </button>
      <button className={mode === 'yearly' ? 'on' : ''} onClick={() => onChange('yearly')}>
        full year
      </button>
      <style jsx>{`
        .mt {
          display: flex;
          gap: 4px;
          justify-content: center;
          margin: 0 auto 8px;
          background: var(--paper-1);
          border: 1px solid var(--paper-2);
          padding: 4px;
          border-radius: 999px;
          width: fit-content;
          box-shadow: 0 4px 14px rgba(0,0,0,0.06);
        }
        button {
          background: transparent;
          border: none;
          color: var(--text-muted);
          padding: 6px 16px;
          border-radius: 999px;
          font-family: 'Cormorant Garamond', serif;
          font-size: 12.5px;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: background .25s, color .25s;
        }
        button:hover { color: var(--text-primary); }
        button.on {
          background: var(--accent-primary);
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  )
}

/* ---------- Jar (SVG) ---------- */

interface JarProps {
  sealed: number
  delivered: number
  total: number
  totalEver: number
  opened: boolean
  onToggle: () => void
}

function Jar({ sealed, delivered, total, totalEver, opened, onToggle }: JarProps) {
  const CAP = 14
  const sealedShown = Math.min(sealed, Math.max(0, CAP - delivered))
  const deliveredShown = Math.min(delivered, CAP)
  const overflow = total - (sealedShown + deliveredShown)
  const reducedMotion = useReducedMotion()

  const sealedPositions = useMemo(() => spread(sealedShown, 'top'), [sealedShown])
  const deliveredPositions = useMemo(() => spread(deliveredShown, 'bottom'), [deliveredShown])

  return (
    <button
      className={`jar ${opened ? 'is-open' : ''}`}
      onClick={onToggle}
      aria-label={opened ? 'Close jar' : 'Open jar'}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translateX(-50%)',
      }}
    >
      <svg width="320" height="388" viewBox="0 0 280 340" fill="none" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="jar-glow" cx="50%" cy="95%" r="65%">
            <stop offset="0%" stopColor="rgba(255, 218, 170, 0.55)" />
            <stop offset="55%" stopColor="rgba(255, 218, 170, 0.10)" />
            <stop offset="100%" stopColor="rgba(255, 218, 170, 0)" />
          </radialGradient>
          <linearGradient id="cork" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#d6b48b" />
            <stop offset="50%"  stopColor="#c79a6b" />
            <stop offset="100%" stopColor="#a87a4d" />
          </linearGradient>
          <linearGradient id="cork-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#e3c094" />
            <stop offset="100%" stopColor="#c79a6b" />
          </linearGradient>
          <radialGradient id="wax" cx="50%" cy="40%" r="60%">
            <stop offset="0%"   stopColor="color-mix(in oklab, var(--accent-primary) 80%, white 20%)" />
            <stop offset="100%" stopColor="var(--accent-primary)" />
          </radialGradient>
          <clipPath id="jar-inside">
            <path d="M76 90 Q56 96 56 114 L56 278 Q56 298 76 298 L204 298 Q224 298 224 278 L224 114 Q224 96 204 90 Z" />
          </clipPath>
        </defs>

        <ellipse cx="140" cy="320" rx="105" ry="6" fill="rgba(0,0,0,0.10)" />

        {/* Cork lid + wax seal */}
        <g className="lid">
          {/* lower flange of cork (sits on jar mouth) */}
          <rect x="78" y="44" width="124" height="14" rx="2"
                fill="url(#cork)"
                stroke="color-mix(in oklab, #6b4a26 60%, transparent)"
                strokeWidth="1" />
          {/* main cork plug */}
          <rect x="92" y="20" width="96" height="26" rx="3"
                fill="url(#cork-top)"
                stroke="color-mix(in oklab, #6b4a26 60%, transparent)"
                strokeWidth="1" />
          {/* cork grain — subtle horizontal speckle lines */}
          <line x1="98" y1="28" x2="116" y2="28" stroke="rgba(107,74,38,0.35)" strokeWidth="0.6" />
          <line x1="124" y1="33" x2="146" y2="33" stroke="rgba(107,74,38,0.30)" strokeWidth="0.6" />
          <line x1="156" y1="27" x2="178" y2="27" stroke="rgba(107,74,38,0.35)" strokeWidth="0.6" />
          <line x1="100" y1="38" x2="120" y2="38" stroke="rgba(107,74,38,0.25)" strokeWidth="0.6" />
          <line x1="158" y1="40" x2="182" y2="40" stroke="rgba(107,74,38,0.30)" strokeWidth="0.6" />
          {/* wax seal blob on top */}
          <ellipse cx="140" cy="14" rx="14" ry="9" fill="url(#wax)"
                   stroke="color-mix(in oklab, var(--accent-primary) 50%, #000 25%)"
                   strokeWidth="0.8" />
          {/* drip on right edge */}
          <path d="M152 13 Q156 18 154 22 Q151 24 150 21 Z"
                fill="url(#wax)" stroke="color-mix(in oklab, var(--accent-primary) 50%, #000 25%)" strokeWidth="0.6" />
          {/* embossed flower on wax */}
          <text x="140" y="18" textAnchor="middle"
                fontFamily="Cormorant Garamond, serif"
                fontSize="11"
                fill="color-mix(in oklab, var(--accent-primary) 30%, #000 30%)"
                opacity="0.85">✿</text>
        </g>

        {/* Jar body — glass */}
        <g className="body">
          <path
            d="M70 70 Q70 60 80 60 L200 60 Q210 60 210 70 L210 84
               Q230 92 230 110 L230 280
               Q230 304 210 304 L70 304
               Q50 304 50 280 L50 110
               Q50 92 70 84 Z"
            fill="color-mix(in oklab, var(--paper-1) 70%, white 30%)"
            stroke="color-mix(in oklab, var(--text-primary) 28%, transparent)"
            strokeWidth="1.4"
          />
          {/* base ring — adds depth at bottom */}
          <ellipse cx="140" cy="304" rx="89" ry="3"
                   fill="color-mix(in oklab, var(--text-primary) 14%, transparent)" />
          {/* warm inner glow */}
          <path
            d="M76 90 Q56 96 56 114 L56 278 Q56 298 76 298 L204 298 Q224 298 224 278 L224 114 Q224 96 204 90 Z"
            fill="url(#jar-glow)"
          />
          {/* glass sheen left */}
          <path
            d="M62 120 Q62 108 72 108 L72 270 Q72 282 62 282 Z"
            fill="rgba(255,255,255,0.55)"
            opacity="0.6"
          />
          {/* glass sheen right */}
          <path
            d="M218 130 Q218 122 224 122 L224 250 Q224 256 218 256 Z"
            fill="rgba(255,255,255,0.30)"
          />
          {/* top curve highlight */}
          <path
            d="M86 64 Q140 60 194 64"
            stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" fill="none" strokeLinecap="round"
          />
        </g>

        {/* Twine wrap around the neck */}
        <g className="twine">
          <line x1="78" y1="62" x2="202" y2="62"
                stroke="color-mix(in oklab, var(--accent-warm) 60%, var(--text-primary) 25%)"
                strokeWidth="1" />
          <line x1="78" y1="65" x2="202" y2="65"
                stroke="color-mix(in oklab, var(--accent-warm) 50%, var(--text-primary) 30%)"
                strokeWidth="0.8" />
          <line x1="78" y1="68" x2="202" y2="68"
                stroke="color-mix(in oklab, var(--accent-warm) 60%, var(--text-primary) 25%)"
                strokeWidth="1" />
          {/* small bow on left side */}
          <path d="M82 64 Q72 58 70 64 Q72 70 82 64 Z"
                fill="color-mix(in oklab, var(--accent-warm) 70%, var(--text-primary) 15%)"
                stroke="color-mix(in oklab, var(--text-primary) 30%, transparent)" strokeWidth="0.5" />
          <path d="M82 64 Q70 70 68 76"
                stroke="color-mix(in oklab, var(--accent-warm) 60%, var(--text-primary) 25%)"
                strokeWidth="0.8" fill="none" />
        </g>

        {/* Embossed fleuron on glass front */}
        <text x="140" y="182" textAnchor="middle"
              fontFamily="Cormorant Garamond, serif"
              fontSize="22"
              fill="color-mix(in oklab, var(--text-primary) 10%, transparent)"
              opacity="0.6">❦</text>

        <g clipPath="url(#jar-inside)">
          {/* settled pile shadow */}
          <ellipse cx="140" cy="296" rx="74" ry="8"
                   fill="color-mix(in oklab, var(--text-primary) 8%, transparent)" />
          {deliveredPositions.map((p, i) => (
            <Envelope key={`d-${i}`} x={p.x} y={p.y} rot={p.rot} delivered />
          ))}
          {sealedPositions.map((p, i) => (
            <Envelope key={`s-${i}`} x={p.x} y={p.y} rot={p.rot} />
          ))}
          {/* fireflies — tiny warm glow particles */}
          <g className="fireflies">
            <circle cx="92" cy="200" r="1.6" fill="rgba(255,210,140,0.85)">
              {!reducedMotion && (
                <animate attributeName="opacity" values="0.3;1;0.3" dur="3.4s" repeatCount="indefinite" />
              )}
            </circle>
            <circle cx="178" cy="170" r="1.3" fill="rgba(255,225,160,0.8)">
              {!reducedMotion && (
                <animate attributeName="opacity" values="1;0.3;1" dur="2.8s" repeatCount="indefinite" />
              )}
            </circle>
            <circle cx="155" cy="225" r="1.7" fill="rgba(255,210,140,0.85)">
              {!reducedMotion && (
                <animate attributeName="opacity" values="0.4;1;0.4" dur="4.1s" repeatCount="indefinite" />
              )}
            </circle>
            <circle cx="105" cy="255" r="1.2" fill="rgba(255,225,170,0.75)">
              {!reducedMotion && (
                <animate attributeName="opacity" values="0.5;1;0.5" dur="3.2s" repeatCount="indefinite" />
              )}
            </circle>
          </g>
          {overflow > 0 && (
            <text
              x="140" y="216"
              textAnchor="middle"
              fontFamily="Caveat, cursive"
              fontSize="20"
              fill="color-mix(in oklab, var(--text-primary) 55%, transparent)"
            >
              + {overflow} more
            </text>
          )}
        </g>
      </svg>

      {totalEver === 0 ? (
        <div className="empty-state">
          you haven&rsquo;t sealed any letters yet — your jar is waiting
        </div>
      ) : (
        <div className="legend">
          <span className="dot sealed" /> {sealed} sealed
          <span className="sep">·</span>
          <span className="dot delivered" /> {delivered} delivered
        </div>
      )}

      <style jsx>{`
        .jar {
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: transform .3s ease;
        }
        .jar:hover { transform: translateX(-50%) translateY(-3px); }
        .jar :global(.lid) { transition: transform .35s ease; transform-origin: 140px 50px; }
        .jar.is-open :global(.lid) { transform: translateY(-14px) rotate(-6deg); }
        .legend {
          margin-top: 2px;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 11.5px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legend .dot {
          width: 8px;
          height: 8px;
          border-radius: 2px;
          display: inline-block;
        }
        .legend .dot.sealed   { background: var(--accent-primary); }
        .legend .dot.delivered{ background: color-mix(in oklab, var(--text-primary) 30%, transparent); }
        .legend .sep { opacity: 0.5; margin: 0 4px; }
        .empty-state {
          margin-top: 6px;
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 12.5px;
          color: var(--text-muted);
          letter-spacing: 0.3px;
          text-align: center;
          max-width: 280px;
        }
        @media (prefers-reduced-motion: reduce) {
          .jar { transition: none; }
          .jar:hover { transform: translateX(-50%); }
          .jar :global(.lid) { transition: none; }
        }
      `}</style>
    </button>
  )
}

/* ---------- Hanging tag (the selector) ---------- */

interface TagProps {
  label: string
  count: number
  onPrev: () => void
  onNext: () => void
  canPrev: boolean
  canNext: boolean
}

function HangingTag({ label, count, onPrev, onNext, canPrev, canNext }: TagProps) {
  return (
    <div className="hang">
      {/* string: from jar's right neck (~x=210, y=58 in SVG / from center-of-stage that's right side) down-right to tag */}
      <svg className="rope" width="160" height="120" viewBox="0 0 160 120" style={{ overflow: 'visible' }}>
        <path
          d="M 0 0 Q 50 22 125 86"
          stroke="color-mix(in oklab, var(--text-primary) 38%, transparent)"
          strokeWidth="0.9"
          fill="none"
          strokeDasharray="2 2"
        />
      </svg>

      <div className="tag-wrap">
        <div className="eyelet" />
        <div className="tag">
          <div className="inner-border">
            <button
              className="nav prev"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label={`Previous ${label}`}
            >‹</button>
            <div className="label">
              <div className="title">
                <span className="orn">❦</span>
                {label}
                <span className="orn">❦</span>
              </div>
              <div className="count">{count} letter{count === 1 ? '' : 's'}</div>
            </div>
            <button
              className="nav next"
              onClick={onNext}
              disabled={!canNext}
              aria-label={`Next ${label}`}
            >›</button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .hang {
          position: absolute;
          /* jar-block 520x410, jar svg 320×388 anchored bottom-center (left=100, top=22).
             Right of neck-top in block coords = 100 + 210×(320/280) = 340.
             Neck-top y = 22 + 58×(388/340) ≈ 88. Rope start lands here. */
          top: 88px;
          left: 340px;
          z-index: 3;
          pointer-events: none;
        }
        .rope {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
        }
        .tag-wrap {
          position: absolute;
          top: 80px;
          left: 36px;
          transform: rotate(-4deg);
          filter: drop-shadow(0 8px 14px rgba(0,0,0,0.14)) drop-shadow(0 2px 3px rgba(0,0,0,0.08));
          pointer-events: auto;
        }
        .eyelet {
          position: absolute;
          top: -1px;
          left: 50%;
          transform: translateX(-50%);
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 50% 50%,
              var(--bg-2) 0,
              var(--bg-2) 3px,
              color-mix(in oklab, var(--text-primary) 45%, transparent) 3.5px,
              color-mix(in oklab, var(--text-primary) 25%, transparent) 5px,
              color-mix(in oklab, var(--paper-1) 90%, var(--accent-warm) 10%) 5.5px);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.5) inset,
            0 -1px 0 rgba(0,0,0,0.08) inset;
          z-index: 2;
        }
        .tag {
          width: 178px;
          padding: 14px 6px 12px;
          background:
            radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.5), transparent 60%),
            linear-gradient(160deg,
              color-mix(in oklab, var(--paper-1) 94%, var(--accent-warm) 6%) 0%,
              color-mix(in oklab, var(--paper-1) 86%, var(--accent-warm) 14%) 100%);
          /* notched top corners + softly notched bottom corners (luggage-tag silhouette) */
          clip-path: polygon(
            12px 0,
            calc(100% - 12px) 0,
            100% 12px,
            100% calc(100% - 6px),
            calc(100% - 6px) 100%,
            6px 100%,
            0 calc(100% - 6px),
            0 12px
          );
        }
        .inner-border {
          border: 1px dashed color-mix(in oklab, var(--text-primary) 30%, transparent);
          padding: 6px 4px 6px;
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .label {
          flex: 1;
          text-align: center;
        }
        .title {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: 19px;
          font-weight: 500;
          color: var(--text-primary);
          line-height: 1.1;
          letter-spacing: 0.4px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .orn {
          font-size: 11px;
          font-style: normal;
          color: color-mix(in oklab, var(--accent-primary) 70%, var(--text-muted) 30%);
          opacity: 0.75;
          transform: translateY(-1px);
        }
        .count {
          font-family: 'Caveat', cursive;
          font-size: 15px;
          color: var(--accent-primary);
          line-height: 1;
          margin-top: 3px;
        }
        .nav {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 24px;
          line-height: 1;
          padding: 4px 4px;
          cursor: pointer;
          font-family: 'Cormorant Garamond', serif;
          align-self: stretch;
          display: flex;
          align-items: center;
          border-radius: 3px;
          transition: background .2s, color .2s, transform .15s;
        }
        .nav:hover:not(:disabled) {
          color: var(--accent-primary);
          background: color-mix(in oklab, var(--accent-primary) 10%, transparent);
          transform: scale(1.08);
        }
        .nav:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }
        @media (max-width: 640px) {
          /* On mobile the tag stacks UNDER the jar instead of dangling
             beside it (which overflowed the viewport on iPhone-class widths).
             Jar SVG is 290 tall anchored to top:0 of jar-block; tag sits
             centered below it, leaving the dotted rope hidden. */
          .hang {
            top: 300px;
            left: 50%;
            transform: translateX(-50%);
          }
          .rope {
            display: none;
          }
          .tag-wrap {
            position: relative;
            top: 0;
            left: 0;
            transform: rotate(-3deg);
          }
          .tag {
            width: 160px;
          }
          .title {
            font-size: 17px;
          }
        }
      `}</style>
    </div>
  )
}

/* ---------- Envelope inside jar ---------- */

function Envelope({ x, y, rot, delivered }: { x: number; y: number; rot: number; delivered?: boolean }) {
  const fill = delivered
    ? 'color-mix(in oklab, var(--paper-2) 75%, var(--text-primary) 5%)'
    : 'var(--paper-1)'
  const stroke = delivered
    ? 'color-mix(in oklab, var(--text-primary) 25%, transparent)'
    : 'color-mix(in oklab, var(--text-primary) 45%, transparent)'
  const seal = delivered
    ? 'color-mix(in oklab, var(--text-primary) 20%, transparent)'
    : 'var(--accent-primary)'
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-13" y="-9" width="26" height="18" rx="1.5"
            fill={fill} stroke={stroke} strokeWidth="0.8" />
      <path d="M-13 -9 L0 1 L13 -9" fill="none"
            stroke={stroke} strokeWidth="0.8" />
      <circle cx="0" cy="3" r="2.2" fill={seal} opacity={delivered ? 0.6 : 1} />
    </g>
  )
}

function spread(n: number, where: 'top' | 'bottom'): { x: number; y: number; rot: number }[] {
  if (n <= 0) return []
  const xMin = 78, xMax = 202
  const yTop = [110, 175]
  const yBot = [240, 286]
  const out: { x: number; y: number; rot: number }[] = []
  for (let i = 0; i < n; i++) {
    const seed = (i + 1) * (where === 'top' ? 37 : 53)
    const fx = ((seed * 9301 + 49297) % 233280) / 233280
    const fy = ((seed * 6151 + 12345) % 233280) / 233280
    const fr = ((seed * 1103 + 97) % 233280) / 233280
    const x = xMin + fx * (xMax - xMin)
    const yRange = where === 'top' ? yTop : yBot
    const y = yRange[0] + fy * (yRange[1] - yRange[0])
    const rot = (fr * 60) - 30
    out.push({ x, y, rot })
  }
  if (where === 'bottom') out.sort((a, b) => a.y - b.y)
  return out
}
