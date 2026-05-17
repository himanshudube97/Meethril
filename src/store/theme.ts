import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { themes, Theme, ThemeName } from '@/lib/themes'

const LEGACY_THEME_REMAP: Record<string, ThemeName> = {
  cherryBlossom: 'rose',
  winterSunset: 'hearth',
  northernLights: 'rose',
  mistyMountains: 'linen',
  gentleRain: 'rain',
  cosmos: 'rose',
  midnight: 'rose',
  candlelight: 'hearth',
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

interface ThemeStore {
  themeName: ThemeName
  theme: Theme
  setTheme: (name: ThemeName) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      themeName: 'rose',
      theme: themes.rose,
      setTheme: (name: ThemeName) => set({
        themeName: name,
        theme: themes[name],
      }),
    }),
    {
      name: 'hearth-theme',
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const resolved = resolveThemeName(state.themeName as unknown as string)
        if (resolved !== state.themeName) {
          state.themeName = resolved
          state.theme = themes[resolved]
        } else {
          // ensure the cached theme object matches the current themes export
          // (shape may have changed across deploys, e.g. mode field added)
          state.theme = themes[resolved]
        }
      },
    }
  )
)
