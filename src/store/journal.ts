import { create } from 'zustand'
import type { EntryStyle } from '@/lib/entry-style'

export interface JournalEntry {
  id: string
  text: string
  textPreview?: string
  createdAt: string
  updatedAt: string
  song?: string
  tags: string[]
  doodles: Doodle[]
  photos?: { id?: string; url?: string; encryptedRef?: string; encryptedRefIV?: string; rotation: number; position: number; spread: number }[]
  spreads?: number
  isArchived?: boolean
  style?: EntryStyle | null
  // Letter draft marker — JournalEntry is used as a draft while composing;
  // when sealed, the Letter row is created and the JE draft is deleted.
  entryType?: 'normal' | 'letter' | 'unsent_letter' | 'ephemeral'
  // E2EE per-field IV map — all entries are E2EE
  e2eeIVs?: Record<string, string> | null
}

export interface Doodle {
  id: string
  strokes: StrokeData[]
  positionInEntry: number
}

export interface StrokeData {
  points: number[][]
  color: string
  size: number
}

interface JournalStore {
  entries: JournalEntry[]
  currentText: string
  currentSong: string
  isLoading: boolean
  activeTab: 'write' | 'timeline' | 'calendar'
  doodleMode: boolean
  currentDoodleStrokes: StrokeData[]

  setEntries: (entries: JournalEntry[]) => void
  addEntry: (entry: JournalEntry) => void
  setCurrentText: (text: string) => void
  setCurrentSong: (song: string) => void
  setIsLoading: (loading: boolean) => void
  setActiveTab: (tab: 'write' | 'timeline' | 'calendar') => void
  setDoodleMode: (mode: boolean) => void
  addDoodleStroke: (stroke: StrokeData) => void
  setDoodleStrokes: (strokes: StrokeData[]) => void
  clearDoodleStrokes: () => void
  resetCurrentEntry: () => void
}

export const useJournalStore = create<JournalStore>((set) => ({
  entries: [],
  currentText: '',
  currentSong: '',
  isLoading: false,
  activeTab: 'write',
  doodleMode: false,
  currentDoodleStrokes: [],

  setEntries: (entries) => set({ entries }),
  addEntry: (entry) => set((state) => ({ entries: [entry, ...state.entries] })),
  setCurrentText: (text) => set({ currentText: text }),
  setCurrentSong: (song) => set({ currentSong: song }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setDoodleMode: (mode) => set({ doodleMode: mode }),
  addDoodleStroke: (stroke) => set((state) => ({
    currentDoodleStrokes: [...state.currentDoodleStrokes, stroke]
  })),
  setDoodleStrokes: (strokes) => set({ currentDoodleStrokes: strokes }),
  clearDoodleStrokes: () => set({ currentDoodleStrokes: [] }),
  resetCurrentEntry: () => set({
    currentText: '',
    currentSong: '',
    currentDoodleStrokes: []
  }),
}))
