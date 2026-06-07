'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { themes, ThemeName } from '@/lib/themes'

// Hearth and Linen are temporarily hidden from the showcase until their views
// are polished. The themes themselves remain registered.
const themeList: { key: ThemeName; emoji: string }[] = [
  { key: 'rose', emoji: '🌸' },
  { key: 'sage', emoji: '🌿' },
  { key: 'postal', emoji: '✉️' },
  { key: 'ocean', emoji: '🌊' },
  { key: 'rivendell', emoji: '🌲' },
  { key: 'sunset', emoji: '🌅' },
]

export default function ThemeShowcase() {
  const { theme, themeName, setTheme } = useThemeStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  })

  const y = useTransform(scrollYProgress, [0, 1], [100, -100])

  return (
    <section
      ref={containerRef}
      className="relative py-24 px-6 overflow-hidden transition-all duration-700"
      style={{
        background: theme.bg.gradient,
      }}
    >
      {/* Parallax Background Elements */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ y }}
      >
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute text-4xl opacity-20"
            style={{
              left: `${20 + i * 15}%`,
              top: `${10 + i * 20}%`,
            }}
            animate={{
              y: [-10, 10, -10],
              rotate: [-5, 5, -5],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {themeList[i].emoji}
          </motion.div>
        ))}
      </motion.div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Section Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
        >
          <h2
            className="text-3xl md:text-4xl font-serif mb-4"
            style={{ color: theme.text.primary }}
          >
            Find your ambience
          </h2>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: theme.text.secondary }}
          >
            Eleven unique themes, each with its own mood, particles, and color palette
          </p>
        </motion.div>

        {/* Theme Carousel */}
        <div className="relative">
          <div className="flex gap-4 overflow-x-auto py-4 px-4 -mx-4 scrollbar-hide snap-x snap-mandatory">
            {themeList.map(({ key, emoji }) => {
              const themeData = themes[key]
              const isActive = key === themeName

              return (
                <motion.div
                  key={key}
                  className="flex-shrink-0 snap-center py-2"
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <motion.button
                    onClick={() => setTheme(key)}
                    className="w-64 p-6 rounded-2xl text-left transition-all duration-300"
                    style={{
                      background: isActive
                        ? themeData.glass.bg
                        : `${themeData.bg.secondary}90`,
                      backdropFilter: `blur(${themeData.glass.blur})`,
                      border: `2px solid ${isActive ? themeData.accent.primary : themeData.glass.border}`,
                      boxShadow: isActive
                        ? `0 0 30px ${themeData.accent.primary}30`
                        : 'none',
                    }}
                    whileHover={{ y: -5 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {/* Theme Emoji & Name */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl">{emoji}</span>
                      <div>
                        <h3
                          className="font-medium"
                          style={{ color: themeData.text.primary }}
                        >
                          {themeData.name}
                        </h3>
                        <p
                          className="text-xs"
                          style={{ color: themeData.text.muted }}
                        >
                          {themeData.particles}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <p
                      className="text-sm mb-4"
                      style={{ color: themeData.text.secondary }}
                    >
                      {themeData.description}
                    </p>

                    {/* Mood Emoji Preview */}
                    <div className="flex gap-2">
                      {themeData.moodEmojis.map((moodEmoji, i) => (
                        <motion.span
                          key={i}
                          className="text-lg"
                          whileHover={{ scale: 1.3 }}
                        >
                          {moodEmoji}
                        </motion.span>
                      ))}
                    </div>

                    {/* Color Palette Preview */}
                    <div className="flex gap-1 mt-4">
                      {[
                        themeData.accent.primary,
                        themeData.accent.secondary,
                        themeData.accent.warm,
                        themeData.accent.highlight,
                      ].map((color, i) => (
                        <motion.div
                          key={i}
                          className="w-6 h-2 rounded-full"
                          style={{ background: color }}
                          whileHover={{ scaleY: 2 }}
                        />
                      ))}
                    </div>
                  </motion.button>
                </motion.div>
              )
            })}
          </div>

          {/* Scroll Indicators */}
          <div className="flex justify-center gap-2 mt-4">
            {themeList.map(({ key }) => (
              <motion.button
                key={key}
                onClick={() => setTheme(key)}
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  background:
                    key === themeName
                      ? theme.accent.primary
                      : theme.text.muted,
                }}
                whileHover={{ scale: 1.5 }}
              />
            ))}
          </div>
        </div>

        {/* Active Theme Preview */}
        <motion.div
          className="mt-12 p-8 rounded-2xl text-center"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
          layout
          transition={{ duration: 0.5 }}
        >
          <motion.p
            className="text-2xl font-serif italic"
            style={{ color: theme.text.primary }}
            key={themeName}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            "{theme.description}"
          </motion.p>
          <motion.div
            className="flex justify-center gap-4 mt-6"
            key={`moods-${themeName}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {theme.moodEmojis.map((emoji, i) => (
              <motion.span
                key={i}
                className="text-3xl"
                animate={{ y: [0, -5, 0] }}
                transition={{
                  delay: i * 0.1,
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {emoji}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Gradient Overlay for Smooth Transition */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, transparent, ${theme.bg.primary})`,
        }}
      />
    </section>
  )
}
