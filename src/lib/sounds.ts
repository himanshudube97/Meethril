import type { Theme } from '@/lib/themes'

export const ambientSources: Record<Theme['ambience'], string | null> = {
  forest: '/sounds/ambient/forest.mp3',
  firelight: '/sounds/ambient/candle.mp3',
  rose: '/sounds/ambient/spring.mp3',
  sage: null,
  ocean: '/sounds/ambient/ocean.mp3',
  postal: null,
  linen: null,
  sunset: null,
  rainy: '/sounds/ambient/rainy.mp3',
}

export type SfxName = 'pageTurn'

export const sfxSources: Record<SfxName, string> = {
  pageTurn: '/sounds/ui/page-turn.mp3',
}
