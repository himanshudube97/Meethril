'use client'

import { useMemo } from 'react'

// Generates a dim, wet-looking red-brick wall as the room "wallpaper" behind
// the window. The bricks lean dusky-brown rather than tomato-red so they sit
// inside Rain's slate-blue palette instead of fighting it.

const BRICK_W = 96
const BRICK_H = 30
const MORTAR = 5
const COLS = 26
const ROWS = 30

const SHADES = [
  '#3a2823',
  '#42302a',
  '#37251f',
  '#4a3530',
  '#2e1e1a',
  '#463129',
  '#382722',
  '#3e2b25',
  '#322320',
  '#4a3429',
]

// Stable pseudo-random per brick coord so the wall doesn't shimmer between renders.
function seedRand(x: number, y: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return v - Math.floor(v)
}

export function BrickWall() {
  const bricks = useMemo(() => {
    const result: Array<{
      key: string
      x: number
      y: number
      w: number
      h: number
      fill: string
      shadeAlpha: number
    }> = []

    for (let row = 0; row < ROWS; row++) {
      const offset = row % 2 === 0 ? 0 : -BRICK_W / 2
      for (let col = -1; col < COLS; col++) {
        const x = col * (BRICK_W + MORTAR) + offset
        const y = row * (BRICK_H + MORTAR)
        const shadeIdx = Math.floor(seedRand(col, row) * SHADES.length)
        const shadeAlpha = 0.06 + seedRand(col + 7, row + 3) * 0.14
        result.push({
          key: `${row}-${col}`,
          x,
          y,
          w: BRICK_W,
          h: BRICK_H,
          fill: SHADES[shadeIdx],
          shadeAlpha,
        })
      }
    }
    return result
  }, [])

  const viewBoxW = COLS * (BRICK_W + MORTAR)
  const viewBoxH = ROWS * (BRICK_H + MORTAR)

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ background: '#15100e', display: 'block' }}
      >
        {bricks.map((b) => (
          <g key={b.key}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill={b.fill}
              rx={1}
            />
            {/* Subtle per-brick top-edge highlight for texture */}
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={1}
              fill={`rgba(0,0,0,${b.shadeAlpha})`}
            />
          </g>
        ))}
      </svg>

      {/* Cool slate overlay — pushes the wall toward the rain palette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(20,30,45,0.5) 0%, rgba(20,30,45,0.22) 55%, rgba(10,15,25,0.6) 100%)',
        }}
      />

      {/* Subtle wet sheen from above-left, as if a streetlamp catches damp brick */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 25% 0%, rgba(140,165,195,0.09) 0%, transparent 55%)',
        }}
      />

      {/* Edge vignette — pulls focus toward the window */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  )
}
