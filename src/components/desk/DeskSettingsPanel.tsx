'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { useCursorStore } from '@/store/cursor'
import { useDeskPanel } from '@/store/deskPanel'
import { useTourStore } from '@/store/tour'
import { themes, ThemeName } from '@/lib/themes'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import { cursors, cursorIcons, CursorName } from '@/lib/cursors'

const themeIcons: Record<ThemeName, string> = {
  rivendell: '🌲',
  firelight: '🔥',
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
  const requestTour = useTourStore((s) => s.requestStart)

  // Themes hidden from the picker (still registered, just not offered).
  // Hearth, Linen, and Rain are temporarily hidden until their views are polished.
  const HIDDEN_THEMES: ThemeName[] = ['firelight', 'linen', 'rain']
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
                          <span className="text-sm leading-tight" style={{ color: theme.text.primary }}>
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
                          <span className="text-sm leading-tight" style={{ color: theme.text.primary }}>
                            {c.name}
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                </section>
                )}

                {/* Guided tour — replayable walkthrough entry point. */}
                <section>
                  <h3 className="text-xs uppercase tracking-[0.15em] mb-3" style={{ color: theme.text.muted }}>
                    Tour
                  </h3>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setOpen(false)
                      requestTour()
                    }}
                    className="w-full p-3 rounded-xl flex items-center gap-3 text-left transition-all"
                    style={{
                      background: `${theme.accent.primary}18`,
                      border: `1px solid ${theme.accent.primary}`,
                    }}
                    aria-label="Take a guided tour of Meethril"
                  >
                    <span
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-lg"
                      style={{ background: `linear-gradient(135deg, ${theme.accent.warm}, ${theme.accent.primary})` }}
                    >
                      🧭
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm leading-tight" style={{ color: theme.text.primary }}>
                        Take a tour
                      </span>
                      <span className="text-xs mt-0.5" style={{ color: theme.text.muted }}>
                        A quick walkthrough of every corner
                      </span>
                    </span>
                  </motion.button>
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
