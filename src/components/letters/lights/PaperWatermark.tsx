'use client'

/**
 * A faint pressed-flower sprig, theme-tinted, sitting low-opacity in the
 * corner of a paper note. Decorative only. Absolutely positioned — the parent
 * must be `position: relative` and `overflow-hidden`.
 */
export default function PaperWatermark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 120"
      className="pointer-events-none absolute"
      style={{
        right: -6,
        bottom: -8,
        width: 150,
        height: 150,
        color: 'var(--text-primary)',
        opacity: 0.06,
      }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        {/* stem */}
        <path d="M30 112 C44 86 52 64 56 40" />
        {/* leaves */}
        <path d="M44 84 C34 80 28 70 30 60 C40 64 46 74 44 84 Z" fill="currentColor" fillOpacity="0.5" stroke="none" />
        <path d="M50 64 C60 60 67 50 65 40 C55 44 49 54 50 64 Z" fill="currentColor" fillOpacity="0.5" stroke="none" />
        {/* flower petals */}
        <g transform="translate(56 30)">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse key={deg} cx="0" cy="-12" rx="6" ry="12" transform={`rotate(${deg})`} fill="currentColor" fillOpacity="0.45" stroke="none" />
          ))}
          <circle cx="0" cy="0" r="5" fill="currentColor" fillOpacity="0.8" stroke="none" />
        </g>
      </g>
    </svg>
  )
}
