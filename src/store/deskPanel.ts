import { create } from 'zustand'

interface DeskPanelStore {
  open: boolean
  setOpen: (value: boolean) => void
  toggle: () => void
}

export const useDeskPanel = create<DeskPanelStore>((set) => ({
  open: false,
  setOpen: (value) => set({ open: value }),
  toggle: () => set((s) => ({ open: !s.open })),
}))
