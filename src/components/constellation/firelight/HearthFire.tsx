'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'

// Lottie runtime is ~200KB and only used by the firelight memory scene
// (one of 10 themes). Load it on demand via next/dynamic so it never
// ships in the main bundle for other-theme users. ssr:false because the
// player touches `document` during init.
const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((m) => m.DotLottieReact),
  { ssr: false },
)

// Loaded from /public/lottie/hearth-fire.lottie. The file itself
// is added separately in Task 12 (Himanshu picks a free animation
// from lottiefiles.com). Until then — and any time the file fails
// to load — we render the static fallback below.
const LOTTIE_SRC = '/lottie/hearth-fire.lottie'

export function HearthFire() {
  const [errored, setErrored] = useState(false)

  if (errored) return <FallbackFlame />

  return (
    <div className="absolute inset-0 pointer-events-none">
      <DotLottieReact
        src={LOTTIE_SRC}
        loop
        autoplay
        // Player respects prefers-reduced-motion automatically.
        onError={() => setErrored(true)}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}

// Static SVG flame with a soft Framer Motion flicker.
// Used both as the Lottie fallback and before the asset is added.
function FallbackFlame() {
  return (
    <svg
      viewBox="-50 -50 100 100"
      preserveAspectRatio="xMidYMax meet"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <defs>
        <radialGradient id="hearth-fallback-flame" cx="0.5" cy="0.85" r="0.7">
          <stop offset="0%" stopColor="#fff0b8" stopOpacity="0.95" />
          <stop offset="20%" stopColor="#ffb84d" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#e8742c" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#5a2008" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.ellipse
        cx="0"
        cy="10"
        rx="22"
        ry="32"
        fill="url(#hearth-fallback-flame)"
        animate={{ scaleY: [1, 1.06, 0.98, 1.04, 1], opacity: [0.85, 1, 0.9, 0.95, 0.85] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </svg>
  )
}
