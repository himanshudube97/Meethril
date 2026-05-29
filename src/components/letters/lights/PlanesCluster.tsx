'use client'

import { motion } from 'framer-motion'
import type { InboxThread } from '@/hooks/useStrangerNotes'

type Kind = 'active' | 'penpal' | 'outgoing'

interface PlaneItem extends InboxThread {
  kind: Kind
}

interface Props {
  active: InboxThread[]
  penpals: InboxThread[]
  outgoing: InboxThread[]
  onPick: (id: string) => void
}

// Soft scatter positions inside a percent-based container. Picked by hand so
// planes feel arranged rather than stacked, but no two overlap at small sizes.
// Indices wrap, so the same slot may host two planes when there are many
// threads — acceptable for v1, list view can come later.
const SLOTS = [
  { x: 18, y: 16, r: -10 },
  { x: 64, y: 12, r:  14 },
  { x: 42, y: 30, r:  -4 },
  { x: 82, y: 36, r:  16 },
  { x: 14, y: 48, r:   8 },
  { x: 56, y: 54, r: -12 },
  { x: 30, y: 70, r:  18 },
  { x: 72, y: 76, r:  -8 },
  { x:  8, y: 80, r:   6 },
  { x: 88, y: 64, r: -16 },
]

export default function PlanesCluster({ active, penpals, outgoing, onPick }: Props) {
  const planes: PlaneItem[] = [
    ...active.map((t) => ({ ...t, kind: 'active' as const })),
    ...penpals.map((t) => ({ ...t, kind: 'penpal' as const })),
    ...outgoing.map((t) => ({ ...t, kind: 'outgoing' as const })),
  ]

  if (planes.length === 0) {
    return (
      <div className="flex h-80 w-full items-center justify-center">
        <p
          className="text-center font-serif text-[12px] italic"
          style={{ color: 'color-mix(in oklab, var(--text-primary) 45%, transparent)' }}
        >
          no planes yet · release one into the night
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-80 w-full sm:h-96">
      {planes.map((p, i) => {
        const slot = SLOTS[i % SLOTS.length]
        return (
          <Plane
            key={p.id}
            plane={p}
            x={slot.x}
            y={slot.y}
            rotate={slot.r}
            driftDelay={(i * 0.4) % 3}
            onClick={() => onPick(p.id)}
          />
        )
      })}
    </div>
  )
}

interface PlaneProps {
  plane: PlaneItem
  x: number
  y: number
  rotate: number
  driftDelay: number
  onClick: () => void
}

function Plane({ plane, x, y, rotate, driftDelay, onClick }: PlaneProps) {
  const isUnread = plane.unreadCount > 0
  const isOutgoing = plane.kind === 'outgoing'
  const isPenpal = plane.kind === 'penpal'

  // Color picks via CSS vars so every theme stays consistent.
  const accent = isPenpal
    ? 'var(--accent-primary)'
    : isOutgoing
    ? 'color-mix(in oklab, var(--text-primary) 35%, transparent)'
    : 'var(--accent-warm)'

  const opacity = isOutgoing ? 0.55 : 1

  return (
    <motion.button
      type="button"
      onClick={onClick}
      title={planeTitle(plane)}
      aria-label={planeTitle(plane)}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity,
        scale: 1,
        y: [0, -6, 0, 4, 0],
        rotate: [rotate - 2, rotate + 2, rotate - 2],
      }}
      transition={{
        opacity: { duration: 0.6, delay: driftDelay * 0.1 },
        scale: { duration: 0.6, delay: driftDelay * 0.1 },
        y: { duration: 5 + driftDelay, repeat: Infinity, ease: 'easeInOut', delay: driftDelay },
        rotate: { duration: 6 + driftDelay, repeat: Infinity, ease: 'easeInOut', delay: driftDelay },
      }}
      whileHover={{ scale: 1.12, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.94 }}
    >
      {/* Soft glow halo for unread */}
      {isUnread && (
        <motion.span
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 56,
            height: 56,
            background: `radial-gradient(circle, ${accent} 0%, transparent 70%)`,
            opacity: 0.45,
            filter: 'blur(4px)',
          }}
          animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.7, 0.45] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <PaperPlaneSvg color={accent} />

      {/* Unread dot indicator */}
      {isUnread && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 rounded-full"
          style={{
            width: 8,
            height: 8,
            background: accent,
            boxShadow: `0 0 6px ${accent}`,
          }}
        />
      )}

      {/* Small label under each plane */}
      <span
        className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap font-serif text-[10px] italic"
        style={{
          color: 'color-mix(in oklab, var(--text-primary) 60%, transparent)',
          maxWidth: 110,
        }}
      >
        {plane.partnerDisplayName || 'awaiting…'}
      </span>
    </motion.button>
  )
}

function planeTitle(p: PlaneItem): string {
  const name = p.partnerDisplayName || 'awaiting reply'
  if (p.unreadCount > 0) return `${name} · ${p.unreadCount} new`
  if (p.kind === 'outgoing') return `${name} · still flying`
  return name
}

function PaperPlaneSvg({ color }: { color: string }) {
  return (
    <svg
      width="40"
      height="32"
      viewBox="0 0 40 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Body of the paper plane */}
      <path
        d="M2 14 L38 2 L24 30 L18 20 L2 14 Z"
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Fold crease line */}
      <path
        d="M18 20 L38 2"
        stroke={color}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}
