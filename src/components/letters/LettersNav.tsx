// src/components/letters/LettersNav.tsx
'use client'

import type { LettersTab } from './letterTypes'

interface Props {
  active: LettersTab
  onChange: (t: LettersTab) => void
  newCount?: number   // count of unread inbox letters; shown on the 'letters' tab
}

export default function LettersNav({ active, onChange, newCount = 0 }: Props) {
  return (
    <nav
      className="
        fixed top-[80px] left-1/2 -translate-x-1/2 z-[80]
        flex items-center gap-1
        rounded-full p-[5px]
        bg-[var(--paper-1)] border border-[var(--paper-2)]
        shadow-[0_10px_30px_rgba(0,0,0,0.12)]
      "
    >
      {(['inbox', 'sent', 'lights'] as LettersTab[]).map(t => (
        <button
          key={t}
          data-tour={`letters-${t}`}
          onClick={() => onChange(t)}
          className={`
            px-[22px] py-[7px] pb-[9px] rounded-full
            font-serif text-[14px] tracking-wide lowercase
            transition-colors
            ${active === t
              ? 'bg-[var(--accent-primary)] text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] font-medium'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--paper-2)]'}
          `}
        >
          {t === 'inbox' ? 'letters' : t === 'sent' ? 'sent' : 'to a stranger'}
        </button>
      ))}
    </nav>
  )
}
