'use client'

import { useState, useEffect, useCallback } from 'react'
import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import { JournalEntry } from '@/store/journal'
import type { MemoryStar } from '@/components/constellation/ConstellationRenderer'
import { GardenRenderer } from '@/components/constellation/GardenRenderer'
import { FirelightRenderer } from '@/components/constellation/FirelightRenderer'
import { useE2EE } from '@/hooks/useE2EE'
import ButterflyMemoryView from '@/components/memory/ButterflyMemoryView'

const MAX_VISIBLE_MEMORIES = 7

export default function MemoryPage() {
  const [mounted, setMounted] = useState(false)
  const layoutMode = useLayoutMode()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  if (layoutMode === 'mobile') {
    return <ButterflyMemoryView />
  }

  return <DesktopMemoryScene />
}

// Desktop / tablet: theme-driven scene (rose garden, postal balloons,
// firelight, etc.). Pre-butterfly logic — restored after butterflies were
// scoped to mobile only.
function DesktopMemoryScene() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [memoryStars, setMemoryStars] = useState<MemoryStar[]>([])
  const [selectedStar, setSelectedStar] = useState<MemoryStar | null>(null)
  const [loading, setLoading] = useState(true)

  const { theme } = useThemeStore()
  const { decryptEntriesFromServer, isE2EEReady } = useE2EE()

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/entries?limit=50')
      const data = await res.json()
      const raw = (data.entries || []) as JournalEntry[]
      const decrypted = await decryptEntriesFromServer(raw)
      setEntries(decrypted)
    } catch (error) {
      console.error('Failed to fetch entries:', error)
    } finally {
      setLoading(false)
    }
  }, [decryptEntriesFromServer])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries, isE2EEReady])

  useEffect(() => {
    if (entries.length === 0) return

    const shuffled = [...entries].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(MAX_VISIBLE_MEMORIES, entries.length))

    const stars: MemoryStar[] = selected.map((entry, index) => {
      const angle = (index / selected.length) * Math.PI * 2 + Math.random() * 0.5
      const radius = 25 + Math.random() * 20
      const centerX = 50
      const centerY = 50

      return {
        id: entry.id,
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 15,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 15,
        size: 4 + Math.random() * 3,
        entry,
        delay: index * 0.4,
      }
    })

    setMemoryStars(stars)
  }, [entries])

  const Renderer = theme.mode === 'light' ? GardenRenderer : FirelightRenderer

  return (
    <Renderer
      loading={loading}
      entries={entries}
      memoryStars={memoryStars}
      selectedStar={selectedStar}
      setSelectedStar={setSelectedStar}
      theme={theme}
    />
  )
}
