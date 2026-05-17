// src/components/letters/recipient/LetterDoodles.tsx
'use client'

interface Stroke {
  points: number[][]
  color: string
  size: number
}

interface Doodle {
  strokes: Stroke[]
  spread: number
  positionInEntry: number
}

interface Props {
  doodles: Doodle[]
}

export function LetterDoodles({ doodles }: Props) {
  if (!doodles || doodles.length === 0) return null

  return (
    <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {doodles
        .slice()
        .sort((a, b) => (a.spread - b.spread) || (a.positionInEntry - b.positionInEntry))
        .map((d, i) => (
          <svg
            key={i}
            viewBox="0 0 600 400"
            style={{ width: '100%', maxWidth: 600, height: 'auto', background: 'transparent' }}
          >
            {d.strokes.map((s, j) => (
              <polyline
                key={j}
                points={s.points.map((p) => `${p[0]},${p[1]}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={s.size}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        ))}
    </div>
  )
}
