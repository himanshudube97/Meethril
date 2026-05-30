import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SoundStore {
  ambientEnabled: boolean
  ambientVolume: number
  uiSoundsEnabled: boolean
  setAmbientEnabled: (v: boolean) => void
  setAmbientVolume: (v: number) => void
  setUiSoundsEnabled: (v: boolean) => void
}

export const useSoundStore = create<SoundStore>()(
  persist(
    (set) => ({
      ambientEnabled: false,
      ambientVolume: 0.3,
      uiSoundsEnabled: false,
      setAmbientEnabled: (v) => set({ ambientEnabled: v }),
      setAmbientVolume: (v) => set({ ambientVolume: Math.max(0, Math.min(1, v)) }),
      setUiSoundsEnabled: (v) => set({ uiSoundsEnabled: v }),
    }),
    { name: 'meethril-sound' }
  )
)
