// src/app/letters/write/page.tsx
'use client'

import LettersTokens from '@/components/letters/LettersTokens'
import ComposeView from '@/components/letters/compose/ComposeView'
import MobileLetterCompose from '@/components/letters/MobileLetterCompose'
import { useLayoutMode } from '@/hooks/useMediaQuery'

export default function LettersWritePage() {
  const layoutMode = useLayoutMode()
  return (
    <>
      <LettersTokens />
      {layoutMode === 'mobile' ? <MobileLetterCompose /> : <ComposeView />}
    </>
  )
}
