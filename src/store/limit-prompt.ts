import { create } from 'zustand'
import type { LimitReached } from '@/lib/billing/limit-error'

// Global "you've hit a usage limit" prompt. Any create flow that gets a 429
// limit_reached response calls show(limit); the LimitReachedModal (mounted once
// in LayoutContent) renders the message + upgrade CTA.
interface LimitPromptStore {
  limit: LimitReached | null
  show: (limit: LimitReached) => void
  hide: () => void
}

export const useLimitPromptStore = create<LimitPromptStore>()((set) => ({
  limit: null,
  show: (limit) => set({ limit }),
  hide: () => set({ limit: null }),
}))
