import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cursors, CursorSet, CursorName } from '@/lib/cursors'

interface CursorStore {
  cursorName: CursorName
  cursor: CursorSet
  setCursor: (name: CursorName) => void
}

export const useCursorStore = create<CursorStore>()(
  persist(
    (set) => ({
      cursorName: 'golden',
      cursor: cursors.golden,
      setCursor: (name: CursorName) => set({
        cursorName: name,
        cursor: cursors[name]
      }),
    }),
    {
      name: 'meethril-cursor',
    }
  )
)
