'use client'

import { useEffect, useState } from 'react'
import JarSentView from './JarSentView'
import type { SentStamp } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'

export default function SentView() {
  const [stamps, setStamps] = useState<SentStamp[]>([])
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  useEffect(() => {
    let cancelled = false
    fetch('/api/letters/sent')
      .then(r => r.json())
      .then(async d => {
        if (cancelled) return
        const raw = (d.stamps || []) as SentStamp[]
        const decrypted = (await decryptEntriesFromServer(
          raw as unknown as JournalEntry[]
        )) as unknown as SentStamp[]
        setStamps(decrypted)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [decryptEntriesFromServer, isE2EEReady])

  return <JarSentView stamps={stamps} />
}
