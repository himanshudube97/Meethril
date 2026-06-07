import { create } from 'zustand'

/**
 * Tiny event bus so UI outside the tour component (e.g. the Desk Settings
 * "Take a tour" entry) can ask the globally-mounted ProductTour to start.
 * `startNonce` bumps on each request; ProductTour watches it and launches.
 */
interface TourState {
  startNonce: number
  requestStart: () => void
}

export const useTourStore = create<TourState>((set) => ({
  startNonce: 0,
  requestStart: () => set((s) => ({ startNonce: s.startNonce + 1 })),
}))
