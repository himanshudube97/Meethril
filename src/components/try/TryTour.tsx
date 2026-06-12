'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useThemeStore } from '@/store/theme'
import DeskScene from '@/components/desk/DeskScene'
import MobileLettersView from '@/components/letters/MobileLettersView'
import ButterflyMemoryView from '@/components/memory/ButterflyMemoryView'
import ShelfScene from '@/components/shelf/ShelfScene'

const STEPS = [
  { key: 'write',  label: 'Write a page',     render: () => <DeskScene /> },
  { key: 'letter', label: 'Send a letter',    render: () => <MobileLettersView /> },
  { key: 'memory', label: 'Revisit a memory', render: () => <ButterflyMemoryView /> },
  { key: 'shelf',  label: 'Your shelf',       render: () => <ShelfScene /> },
] as const

export default function TryTour() {
  const { theme } = useThemeStore()
  const router = useRouter()
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1
  return (
    <div className="fixed inset-0">
      <div key={step.key} className="absolute inset-0">{step.render()}</div>
      <div
        className="absolute bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 px-6 py-4"
        style={{ background: `linear-gradient(to top, ${theme.bg.primary}, transparent)` }}
      >
        <span className="text-sm" style={{ color: theme.text.secondary }}>{step.label}</span>
        <button
          onClick={() => last ? router.push('/login') : setI(n => Math.min(n + 1, STEPS.length - 1))}
          className="px-5 py-2 rounded-xl font-medium transition-transform hover:scale-[1.03]"
          style={{ background: theme.accent.primary, color: theme.bg.primary }}
        >
          {last ? 'Make it mine' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
