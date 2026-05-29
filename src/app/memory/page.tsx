'use client'

import { useState, useEffect, useMemo } from 'react'
import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import type { MemoryStar } from '@/components/constellation/ConstellationRenderer'
import { GardenRenderer } from '@/components/constellation/GardenRenderer'
import { FirelightRenderer } from '@/components/constellation/FirelightRenderer'
import { useMemories } from '@/hooks/useMemories'
import { seededUnit } from '@/lib/memory/daily'
import ButterflyMemoryView from '@/components/memory/ButterflyMemoryView'
import MemoryLocked from '@/components/memory/MemoryLocked'

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
// firelight, etc.). Gating + the fixed daily selection (issue #37) come from
// useMemories; star positions are seeded by item id so they stay put for the
// day instead of jumping on every render.
function DesktopMemoryScene() {
  const { theme } = useThemeStore()
  const { status, progress, items } = useMemories()
  const [selectedStar, setSelectedStar] = useState<MemoryStar | null>(null)

  const memoryStars = useMemo<MemoryStar[]>(() => {
    return items.map((entry, index) => {
      const angle = (index / Math.max(1, items.length)) * Math.PI * 2 + seededUnit(entry.id, 'angle') * 0.5
      const radius = 25 + seededUnit(entry.id, 'radius') * 20
      return {
        id: entry.id,
        x: 50 + Math.cos(angle) * radius + (seededUnit(entry.id, 'x') - 0.5) * 15,
        y: 50 + Math.sin(angle) * radius + (seededUnit(entry.id, 'y') - 0.5) * 15,
        size: 4 + seededUnit(entry.id, 'size') * 3,
        entry,
        delay: index * 0.4,
      }
    })
  }, [items])

  if (status === 'locked') {
    return <MemoryLocked progress={progress} />
  }

  const Renderer = theme.mode === 'light' ? GardenRenderer : FirelightRenderer

  return (
    <Renderer
      loading={status === 'loading'}
      entries={items}
      memoryStars={memoryStars}
      selectedStar={selectedStar}
      setSelectedStar={setSelectedStar}
      theme={theme}
    />
  )
}
