'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useCursorStore } from '@/store/cursor'
import { useDeskSettings } from '@/store/deskSettings'
import { useDeskPanel } from '@/store/deskPanel'
import { useSoundStore } from '@/store/sound'
import { themes, ThemeName } from '@/lib/themes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import { cursors, cursorIcons, CursorName } from '@/lib/cursors'

const themeIcons: Record<ThemeName, string> = {
  rivendell: '🌲',
  hearth: '🔥',
  rose: '🌸',
  sage: '🌿',
  ocean: '🌊',
  postal: '✉️',
  linen: '🕊️',
  sunset: '🌅',
  rain: '🌧️',
}

export default function DeskSettingsPanel() {
  const { open, setOpen } = useDeskPanel()
  const { theme, themeName, setTheme } = useThemeStore()
  const { cursorName, setCursor } = useCursorStore()
  const { animationsEnabled, setAnimationsEnabled } = useDeskSettings()
  const {
    ambientEnabled,
    ambientVolume,
    uiSoundsEnabled,
    setAmbientEnabled,
    setAmbientVolume,
    setUiSoundsEnabled,
  } = useSoundStore()

  // Themes hidden from the picker (still registered, just not offered).
  // Hearth and Linen are temporarily hidden until their views are polished.
  const HIDDEN_THEMES: ThemeName[] = ['hearth', 'linen']
  // Mobile keeps just two themes: sunset + rose. The other ambiences depend
  // on particles, scenes, and chrome that don't translate well to small
  // screens. A user who set a desktop-only theme still sees it apply; they
  // just can't pick others while on mobile.
  const MOBILE_THEMES: ThemeName[] = ['sunset', 'rose']
  const layoutMode = useLayoutMode()
  const themeList = (Object.entries(themes) as [ThemeName, typeof theme][])
    .filter(([name]) => {
      if (layoutMode === 'mobile') return MOBILE_THEMES.includes(name)
      return !HIDDEN_THEMES.includes(name)
    })
  const cursorList = Object.entries(cursors) as [CursorName, (typeof cursors)[CursorName]][]

  // Mobile has no settings UI at all — the theme is locked to sunset and
  // user-tweakable preferences (cursor, animations, ambient sound) are
  // desktop-only knobs anyway.
  if (layoutMode === 'mobile') {
    return null
  }

  return (
    <>
      {/* Gear button — top-right of viewport, above the desk scene. */}
      <motion.button
        whileHover={{ scale: 1.05, rotate: 30 }}
        whileTap={{ scale: 0.95 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        onClick={() => setOpen(!open)}
        className="fixed top-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center text-xl"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
          color: theme.accent.warm,
        }}
        title="Desk settings"
        aria-label="Open desk settings"
      >
        ⚙
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside catcher. Doesn't dim the rest so the user can
                see live changes on the diary while the drawer is open. */}
            <motion.div
              key="catcher"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
            />

            {/* Right-side drawer */}
            <motion.aside
              key="drawer"
              initial={{ x: '110%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '110%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 32 }}
              className="fixed top-0 right-0 z-50 h-full w-full max-w-90 flex flex-col"
              style={{
                background: theme.glass.bg,
                backdropFilter: `blur(${theme.glass.blur})`,
                borderLeft: `1px solid ${theme.glass.border}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <header
                className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: theme.glass.border }}
              >
                <h2 className="text-sm font-medium tracking-wide uppercase" style={{ color: theme.text.primary }}>
                  Desk Settings
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-lg opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: theme.text.muted }}
                  aria-label="Close settings"
                >
                  ✕
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
                {/* Theme */}
                <section>
                  <h3 className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: theme.text.muted }}>
                    Theme
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {themeList.map(([name, t]) => {
                      const selected = themeName === name
                      return (
                        <motion.button
                          key={name}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setTheme(name)}
                          className="p-2 rounded-xl flex items-center gap-2 text-left transition-all"
                          style={{
                            background: selected ? `${t.accent.primary}25` : 'transparent',
                            border: selected
                              ? `1px solid ${t.accent.primary}`
                              : `1px solid ${theme.glass.border}`,
                          }}
                        >
                          <span
                            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base"
                            style={{
                              background: `linear-gradient(135deg, ${t.accent.warm}, ${t.accent.primary})`,
                            }}
                          >
                            {themeIcons[name]}
                          </span>
                          <span className="text-xs leading-tight" style={{ color: theme.text.primary }}>
                            {t.name}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                </section>

                {/* Cursor — custom cursors are a pointer-device feature, so
                    only offer them on true desktop. On tablet/responsive
                    widths (touch) they're dead options that just clutter the
                    panel (issue #41). */}
                {layoutMode === 'desktop' && (
                <section>
                  <h3 className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: theme.text.muted }}>
                    Cursor
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {cursorList.map(([name, c]) => {
                      const selected = cursorName === name
                      return (
                        <motion.button
                          key={name}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setCursor(name)}
                          className="p-2 rounded-xl flex items-center gap-2 text-left transition-all"
                          style={{
                            background: selected ? `${theme.accent.primary}25` : 'transparent',
                            border: selected
                              ? `1px solid ${theme.accent.primary}`
                              : `1px solid ${theme.glass.border}`,
                          }}
                        >
                          <span
                            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-base"
                            style={{
                              background: `linear-gradient(135deg, ${theme.accent.warm}30, ${theme.accent.primary}30)`,
                            }}
                          >
                            {cursorIcons[name]}
                          </span>
                          <span className="text-xs leading-tight" style={{ color: theme.text.primary }}>
                            {c.name}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                </section>
                )}

                {/* Background animations */}
                <section>
                  <h3 className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: theme.text.muted }}>
                    Background
                  </h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: theme.text.primary }}>
                        Animations
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: theme.text.muted }}>
                        Particles, drifting glows, and ambient motion
                      </p>
                    </div>
                    <button
                      onClick={() => setAnimationsEnabled(!animationsEnabled)}
                      className="w-10 h-6 rounded-full relative transition-colors"
                      style={{
                        background: animationsEnabled ? theme.accent.warm : theme.glass.border,
                      }}
                      aria-label="Toggle background animations"
                    >
                      <motion.span
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                        animate={{ left: animationsEnabled ? '18px' : '2px' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </section>

                {/* Sound */}
                <section>
                  <h3 className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: theme.text.muted }}>
                    Sound
                  </h3>

                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs" style={{ color: theme.text.primary }}>
                        Ambient
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: theme.text.muted }}>
                        Background loop matched to your theme
                      </p>
                    </div>
                    <button
                      onClick={() => setAmbientEnabled(!ambientEnabled)}
                      className="w-10 h-6 rounded-full relative transition-colors"
                      style={{
                        background: ambientEnabled ? theme.accent.warm : theme.glass.border,
                      }}
                      aria-label="Toggle ambient sound"
                    >
                      <motion.span
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                        animate={{ left: ambientEnabled ? '18px' : '2px' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>

                  <div className="mb-4" style={{ opacity: ambientEnabled ? 1 : 0.4 }}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: theme.text.muted }}>
                        Volume
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: theme.text.primary }}>
                        {Math.round(ambientVolume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(ambientVolume * 100)}
                      onChange={(e) => setAmbientVolume(Number(e.target.value) / 100)}
                      disabled={!ambientEnabled}
                      className="w-full h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${theme.accent.warm} 0%, ${theme.accent.warm} ${ambientVolume * 100}%, ${theme.glass.border} ${ambientVolume * 100}%, ${theme.glass.border} 100%)`,
                        accentColor: theme.accent.warm,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs" style={{ color: theme.text.primary }}>
                        UI sounds
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: theme.text.muted }}>
                        Page turn sound when navigating the diary
                      </p>
                    </div>
                    <button
                      onClick={() => setUiSoundsEnabled(!uiSoundsEnabled)}
                      className="w-10 h-6 rounded-full relative transition-colors"
                      style={{
                        background: uiSoundsEnabled ? theme.accent.warm : theme.glass.border,
                      }}
                      aria-label="Toggle UI sounds"
                    >
                      <motion.span
                        className="absolute top-0.5 w-5 h-5 rounded-full bg-white"
                        animate={{ left: uiSoundsEnabled ? '18px' : '2px' }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    </button>
                  </div>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
