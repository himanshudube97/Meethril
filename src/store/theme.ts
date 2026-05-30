import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { themes, Theme, ThemeName } from '@/lib/themes'

const LEGACY_THEME_REMAP: Record<string, ThemeName> = {
  cherryBlossom: 'rose',
  winterSunset: 'firelight',
  hearth: 'firelight',
  northernLights: 'rose',
  mistyMountains: 'linen',
  gentleRain: 'rain',
  cosmos: 'rose',
  midnight: 'rose',
  candlelight: 'firelight',
  oceanTwilight: 'ocean',
  quietSnow: 'linen',
  warmPeaceful: 'linen',
  hobbiton: 'sage',
  paperSun: 'linen',
  saffron: 'rose',
  garden: 'sage',
}

function resolveThemeName(name: string | undefined): ThemeName {
  if (!name) return 'rose'
  if (name in themes) return name as ThemeName
  if (name in LEGACY_THEME_REMAP) return LEGACY_THEME_REMAP[name]
  return 'rose'
}

type LayoutMode = 'mobile' | 'tablet' | 'desktop'
const MOBILE_FORCED_THEME: ThemeName = 'sunset'

interface ThemeStore {
  /** Theme the user picked via the gear panel. Persisted. */
  userThemeName: ThemeName
  /** Effective theme name — equals userThemeName on desktop/tablet,
   * forced to sunset on mobile. Not persisted. */
  themeName: ThemeName
  /** Effective theme object. Not persisted. */
  theme: Theme
  /** User-initiated theme pick (desktop settings panel + landing showcase). */
  setTheme: (name: ThemeName) => void
  /** Called by LayoutContent whenever the viewport crosses a breakpoint. */
  setLayoutMode: (mode: LayoutMode) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      userThemeName: 'rose',
      themeName: 'rose',
      theme: themes.rose,
      setTheme: (name: ThemeName) =>
        set({
          userThemeName: name,
          themeName: name,
          theme: themes[name],
        }),
      setLayoutMode: (mode: LayoutMode) => {
        const userName = get().userThemeName
        const effective: ThemeName = mode === 'mobile' ? MOBILE_FORCED_THEME : userName
        if (get().themeName !== effective) {
          set({ themeName: effective, theme: themes[effective] })
        }
      },
    }),
    {
      name: 'meethril-theme',
      // Only the user's desktop pick persists. The effective themeName/theme
      // are derived from layout at runtime, so they live in memory only.
      partialize: (state) => ({
        userThemeName: state.userThemeName,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const stateLoose = state as unknown as { themeName?: string; userThemeName?: string }
        // Resolution order:
        // 1. New schema's `userThemeName` is the source of truth once present.
        // 2. Old schema's `themeName` is migrated forward — UNLESS it's
        //    'sunset', which was almost certainly written by an earlier bug
        //    that forced sunset whenever the viewport went mobile. Treat
        //    that case as contamination and fall back to the default. A
        //    user who legitimately picked sunset on desktop will just need
        //    to repick it from the gear once.
        // 3. Nothing persisted → default 'rose'.
        let resolved: ThemeName
        if (stateLoose.userThemeName) {
          resolved = resolveThemeName(stateLoose.userThemeName)
        } else if (stateLoose.themeName && stateLoose.themeName !== 'sunset') {
          resolved = resolveThemeName(stateLoose.themeName)
        } else {
          resolved = 'rose'
        }
        state.userThemeName = resolved
        // If we're already on a mobile viewport at hydrate-time, apply the
        // sunset override synchronously so the first paint matches what the
        // user will see (avoids a brief flash of the desktop theme).
        const isMobileNow =
          typeof window !== 'undefined' &&
          !window.matchMedia('(min-width: 1024px)').matches
        const effective: ThemeName = isMobileNow ? MOBILE_FORCED_THEME : resolved
        state.themeName = effective
        state.theme = themes[effective]
      },
    }
  )
)
