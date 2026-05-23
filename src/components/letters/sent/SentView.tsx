'use client'

import { useEffect, useState } from 'react'
import JarSentView from './JarSentView'
import type { SentStamp } from '../letterTypes'
import { useE2EE } from '@/hooks/useE2EE'
import type { JournalEntry } from '@/store/journal'

export default function SentView() {
  const [stamps, setStamps] = useState<SentStamp[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    fetch('/api/letters/sent')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(async (d) => {
        if (cancelled) return
        const raw = (d.stamps || []) as SentStamp[]
        const decrypted = (await decryptEntriesFromServer(
          raw as unknown as JournalEntry[],
        )) as unknown as SentStamp[]
        if (!cancelled) setStamps(decrypted)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [decryptEntriesFromServer, isE2EEReady])

  return <JarSentView stamps={stamps} loading={loading} loadError={loadError} />
}
