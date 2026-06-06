import { create } from 'zustand'

/**
 * Tracks whether an open memory diary spread is on screen (the MemoryDiaryView
 * modal on /memory). When true, the page chrome — nav bar, gear, fullscreen —
 * fades out so reading a memory feels immersive, like the open journal is the
 * only thing on the desk. MemoryDiaryView sets this on mount / clears on unmount.
 */
interface MemoryViewStore {
  diaryOpen: boolean
  setDiaryOpen: (value: boolean) => void
}

export const useMemoryViewStore = create<MemoryViewStore>((set) => ({
  diaryOpen: false,
  setDiaryOpen: (value) => set({ diaryOpen: value }),
}))
