'use client'

import { useState } from 'react'
import LettersTokens from '@/components/letters/LettersTokens'
import LettersNav from '@/components/letters/LettersNav'
import InboxView from '@/components/letters/inbox/InboxView'
import SentView from '@/components/letters/sent/SentView'
import LightsView from '@/components/letters/lights/LightsView'
import MobileLettersView from '@/components/letters/MobileLettersView'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import type { LettersTab } from '@/components/letters/letterTypes'

export default function LettersPage() {
  const [tab, setTab] = useState<LettersTab>('inbox')
  const [newCount, setNewCount] = useState(0)
  const layoutMode = useLayoutMode()

  // Mobile gets a simpler list-driven layout — the desktop's postbox/lamp
  // scene + jar metaphor don't translate to narrow viewports.
  if (layoutMode === 'mobile') {
    return (
      <>
        <LettersTokens />
        <MobileLettersView />
      </>
    )
  }

  return (
    <>
      <LettersTokens />
      <LettersNav active={tab} onChange={setTab} newCount={newCount} />
      {tab === 'inbox' && <InboxView onUnreadCountChange={setNewCount} />}
      {tab === 'sent' && <SentView />}
      {tab === 'lights' && <LightsView />}
    </>
  )
}
