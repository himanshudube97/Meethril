'use client'

import { create } from 'zustand'

interface ActiveSongState {
  activeId: string | null
  /** Mark a song as the currently-playing one. Any other SongEmbed instance listening will pause. */
  play: (id: string) => void
  /** Clear the active song (e.g., on pause / unmount of the playing one). */
  stop: () => void
}

export const useActiveSong = create<ActiveSongState>((set) => ({
  activeId: null,
  play: (id) => set({ activeId: id }),
  stop: () => set({ activeId: null }),
}))
