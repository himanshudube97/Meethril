'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DeskScene } from '@/components/desk'
import OptInCard from '@/components/reminders/OptInCard'
import { useDeskStore } from '@/store/desk'

export default function WritePage() {
  return (
    <Suspense fallback={<DeskScene />}>
      <WritePageInner />
    </Suspense>
  )
}

function WritePageInner() {
  const [optInShown, setOptInShown] = useState<boolean | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    fetch('/api/me/profile-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setOptInShown(Boolean(data?.profile?.reminderOptInPromptShownAt))
      })
      .catch(() => setOptInShown(true)) // fail-closed: don't show if we can't determine
  }, [])

  // Notification click → /write?write=1 lands here. Clear any in-memory
  // draft so the user starts on a blank new-entry spread, then strip
  // the query so a refresh doesn't repeat the action.
  useEffect(() => {
    if (searchParams.get('write') !== '1') return
    useDeskStore.getState().clearDrafts()
    const url = new URL(window.location.href)
    url.searchParams.delete('write')
    router.replace(url.pathname + (url.search || '') + url.hash)
  }, [searchParams, router])

  return (
    <>
      <DeskScene />
      {optInShown === false && <OptInCard alreadyShown={false} />}
    </>
  )
}
