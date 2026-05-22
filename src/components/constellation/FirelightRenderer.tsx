'use client'

// Dark-side dispatcher — mirrors GardenRenderer for light themes.
// Switches by theme.ambience. Falls back to the original
// ConstellationRenderer (cosmos starfield) for any dark theme that
// doesn't yet have its own scene (today: Rivendell).

import type { Theme } from '@/lib/themes'
import type { JournalEntry } from '@/store/journal'
import { ConstellationRenderer, type MemoryStar } from './ConstellationRenderer'
import { HearthScene } from './firelight/scenes/HearthScene'
import { RainWindowScene } from './rain/scenes/RainWindowScene'

export interface FirelightRendererProps {
  loading: boolean
  entries: JournalEntry[]
  memoryStars: MemoryStar[]
  selectedStar: MemoryStar | null
  setSelectedStar: (s: MemoryStar | null) => void
  theme: Theme
}

export function FirelightRenderer(props: FirelightRendererProps) {
  switch (props.theme.ambience) {
    case 'firelight':
      return <HearthScene {...props} />
    case 'rainy':
      return <RainWindowScene {...props} />
    default:
      return <ConstellationRenderer {...props} />
  }
}
