'use client'

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import { createNoise2D } from 'simplex-noise'
import { useThemeStore } from '@/store/theme'
import { useDeskSettings } from '@/store/deskSettings'
import type { ISourceOptions } from '@tsparticles/engine'

// ========== PARTICLE CONFIGURATIONS ==========

// Fireflies configuration - magical forest glow
const getFirefliesConfig = (): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 35, density: { enable: true } },
    color: { value: ['#D4A84B', '#E8A855', '#F0C060'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.2, max: 0.9 },
      animation: {
        enable: true,
        speed: 0.8,
        sync: false,
        mode: 'random' as const,
      },
    },
    size: {
      value: { min: 2, max: 5 },
      animation: {
        enable: true,
        speed: 2,
        sync: false,
      },
    },
    move: {
      enable: true,
      speed: { min: 0.3, max: 1.2 },
      direction: 'none' as const,
      random: true,
      straight: false,
      outModes: { default: 'bounce' as const },
      warp: true,
    },
    glow: {
      enable: true,
      color: '#D4A84B',
      radius: 15,
    } as any,
    shadow: {
      enable: true,
      color: '#D4A84B',
      blur: 10,
      offset: { x: 0, y: 0 },
    },
  },
  detectRetina: true,
})

// Sakura configuration - cherry blossom petals (very slow, dreamy falling)
const getSakuraConfig = (mode: 'light' | 'dark' = 'dark'): ISourceOptions => {
  const minOpacity = mode === 'light' ? 0.25 : 0.5
  const maxOpacity = mode === 'light' ? 0.5 : 0.85
  return {
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 30, density: { enable: true } },
    color: { value: ['#FFB7C5', '#FFC0CB', '#FFD4E0', '#FFDAE0', '#E8A0B8'] },
    shape: {
      type: 'image',
      options: {
        image: [
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyMCAyNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZWxsaXBzZSBjeD0iMTAiIGN5PSIxMiIgcng9IjgiIHJ5PSIxMCIgZmlsbD0iI0ZGQjdDNSIgZmlsbC1vcGFjaXR5PSIwLjkiLz48L3N2Zz4=',
            width: 20,
            height: 24,
          },
        ],
      },
    },
    opacity: {
      value: { min: minOpacity, max: maxOpacity },
    },
    size: {
      value: { min: 6, max: 12 },
    },
    move: {
      enable: true,
      speed: { min: 0.15, max: 0.4 },
      direction: 'bottom' as const,
      outModes: { default: 'out' as const },
      drift: { min: -0.2, max: 0.2 },
    },
    rotate: {
      value: { min: 0, max: 360 },
      animation: {
        enable: true,
        speed: 1,
        sync: false,
      },
    },
    tilt: {
      enable: true,
      value: { min: 0, max: 15 },
      animation: {
        enable: true,
        speed: 0.8,
        sync: false,
      },
    },
    wobble: {
      enable: true,
      distance: 8,
      speed: { min: -0.5, max: 0.5 },
    },
  },
  detectRetina: true,
  }
}

// Mist particles configuration (smaller, subtle wisps)
const getMistConfig = (): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 25, density: { enable: true } },
    color: { value: ['#C8D8E8', '#B8C8D8', '#D0E0F0'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.03, max: 0.12 },
    },
    size: {
      value: { min: 8, max: 25 },
    },
    move: {
      enable: true,
      speed: { min: 0.08, max: 0.2 },
      direction: 'right' as const,
      random: true,
      outModes: { default: 'out' as const },
    },
    blur: {
      enable: true,
      value: 8,
    } as any,
  },
  detectRetina: true,
})

// Dust motes configuration - floating particles near candlelight
const getDustConfig = (mode: 'light' | 'dark' = 'dark'): ISourceOptions => {
  const maxOpacity = mode === 'light' ? 0.3 : 0.4
  return {
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 30, density: { enable: true } },
    color: { value: ['#FFE0B0', '#FFD090', '#FFC070'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.1, max: maxOpacity },
      animation: {
        enable: true,
        speed: 0.2,
        sync: false,
        mode: 'random' as const,
      },
    },
    size: {
      value: { min: 1, max: 3 },
    },
    move: {
      enable: true,
      speed: { min: 0.05, max: 0.15 },
      direction: 'none' as const,
      random: true,
      outModes: { default: 'bounce' as const },
    },
    shadow: {
      enable: true,
      color: '#E8A050',
      blur: 5,
      offset: { x: 0, y: 0 },
    },
  },
  detectRetina: true,
  }
}

// Foam configuration - floating sea foam/bubbles
const getFoamConfig = (mode: 'light' | 'dark' = 'dark'): ISourceOptions => {
  const maxOpacity = mode === 'light' ? 0.35 : 0.5
  return {
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 25, density: { enable: true } },
    color: { value: ['#B0E0F0', '#C8E8F8', '#E0F4FF'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.2, max: maxOpacity },
      animation: {
        enable: true,
        speed: 0.15,
        sync: false,
      },
    },
    size: {
      value: { min: 2, max: 6 },
    },
    move: {
      enable: true,
      speed: { min: 0.05, max: 0.12 },
      direction: 'top-right' as const,
      random: true,
      outModes: { default: 'out' as const },
      drift: { min: -0.1, max: 0.1 },
    },
    wobble: {
      enable: true,
      distance: 4,
      speed: { min: -0.2, max: 0.2 },
    },
  },
  detectRetina: true,
  }
}

// Sunbeam configuration - warm pollen-like motes drifting in afternoon light
const getSunbeamConfig = (mode: 'light' | 'dark' = 'dark'): ISourceOptions => {
  const maxOpacity = mode === 'light' ? 0.4 : 0.5
  return {
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 28, density: { enable: true } },
    color: { value: ['#F5C078', '#E8945A', '#FFD4A8', '#F2A06B'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.15, max: maxOpacity },
      animation: {
        enable: true,
        speed: 0.3,
        sync: false,
        mode: 'random' as const,
      },
    },
    size: {
      value: { min: 2, max: 5 },
    },
    move: {
      enable: true,
      speed: { min: 0.05, max: 0.18 },
      direction: 'top-right' as const,
      random: true,
      straight: false,
      outModes: { default: 'out' as const },
      drift: { min: -0.1, max: 0.1 },
    },
    wobble: {
      enable: true,
      distance: 6,
      speed: { min: -0.2, max: 0.2 },
    },
    shadow: {
      enable: true,
      color: '#F5C078',
      blur: 6,
      offset: { x: 0, y: 0 },
    },
  },
  detectRetina: true,
  }
}

// Embers configuration - rising warm embers for Hearth theme
const getEmbersConfig = (): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 40, density: { enable: true } },
    color: { value: ['#E8A050', '#FFD090', '#C8742C'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.2, max: 0.7 },
      animation: {
        enable: true,
        speed: 0.4,
        sync: false,
        mode: 'random' as const,
      },
    },
    size: {
      value: { min: 1.5, max: 4 },
    },
    move: {
      enable: true,
      speed: { min: 0.15, max: 0.4 },
      direction: 'top' as const,
      random: true,
      straight: false,
      outModes: { default: 'out' as const },
      drift: { min: -0.15, max: 0.15 },
    },
    shadow: {
      enable: true,
      color: '#E8A050',
      blur: 8,
      offset: { x: 0, y: 0 },
    },
  },
  detectRetina: true,
})

// Gold flecks configuration - drifting gold leaf flakes for Midnight theme
const getGoldFlecksConfig = (): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: 25, density: { enable: true } },
    color: { value: ['#C9A04A', '#F2D488', '#E0BC68'] },
    shape: { type: 'square' },
    opacity: {
      value: { min: 0.15, max: 0.5 },
      animation: {
        enable: true,
        speed: 0.2,
        sync: false,
        mode: 'random' as const,
      },
    },
    size: {
      value: { min: 2, max: 5 },
    },
    move: {
      enable: true,
      speed: { min: 0.08, max: 0.2 },
      direction: 'bottom' as const,
      random: true,
      straight: false,
      outModes: { default: 'out' as const },
      drift: { min: -0.1, max: 0.1 },
    },
    rotate: {
      value: { min: 0, max: 360 },
      animation: {
        enable: true,
        speed: 4,
        sync: false,
      },
    },
    shadow: {
      enable: true,
      color: '#C9A04A',
      blur: 4,
      offset: { x: 0, y: 0 },
    },
  },
  detectRetina: true,
})

// Rain configuration - small pale droplets falling gently straight down
const getRainConfig = (): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 90, density: { enable: true } },
    color: { value: ['#B8C8DC', '#A8BCD0', '#CDD8E6'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.35, max: 0.7 },
    },
    size: {
      value: { min: 1.2, max: 2.4 },
    },
    move: {
      enable: true,
      speed: { min: 1.4, max: 2.4 },
      direction: 'bottom' as const,
      straight: true,
      random: false,
      outModes: { default: 'out' as const },
    },
  },
  detectRetina: true,
})

// Leaves configuration - gently falling leaves for Sage and Garden themes
const getLeavesConfig = (color: string, count: number): ISourceOptions => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 30,
  particles: {
    number: { value: count, density: { enable: true } },
    color: { value: [color] },
    shape: {
      type: 'image',
      options: {
        image: [
          {
            src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTQiIHZpZXdCb3g9IjAgMCAxMCAxNCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNNSwxIEMyLDMgMSw3IDUsMTMgQzksNyA4LDMgNSwxIFoiIGZpbGw9IndoaXRlIi8+PC9zdmc+',
            width: 10,
            height: 14,
          },
        ],
      },
    },
    opacity: {
      value: { min: 0.2, max: 0.4 },
    },
    size: {
      value: { min: 5, max: 10 },
    },
    move: {
      enable: true,
      speed: { min: 0.1, max: 0.3 },
      direction: 'bottom' as const,
      outModes: { default: 'out' as const },
      drift: { min: -0.3, max: 0.3 },
    },
    rotate: {
      value: { min: 0, max: 360 },
      animation: {
        enable: true,
        speed: 3,
        sync: false,
      },
    },
  },
  detectRetina: true,
})

// ========== CSS AURORA COMPONENT (simple, elegant) ==========

const CssAurora = React.memo(function CssAurora() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Aurora ribbon 1 - green */}
      <motion.div
        className="absolute"
        style={{
          top: '5%',
          left: '-10%',
          width: '120%',
          height: '35%',
          background: 'linear-gradient(180deg, transparent 0%, rgba(78, 204, 163, 0.08) 30%, rgba(78, 204, 163, 0.15) 50%, rgba(78, 204, 163, 0.08) 70%, transparent 100%)',
          filter: 'blur(40px)',
          transformOrigin: 'center center',
        }}
        animate={{
          scaleX: [1, 1.05, 0.98, 1.03, 1],
          scaleY: [1, 1.1, 0.95, 1.05, 1],
          x: [0, 20, -15, 10, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Aurora ribbon 2 - teal/cyan */}
      <motion.div
        className="absolute"
        style={{
          top: '8%',
          left: '-5%',
          width: '110%',
          height: '30%',
          background: 'linear-gradient(180deg, transparent 0%, rgba(136, 212, 171, 0.06) 30%, rgba(136, 212, 171, 0.12) 50%, rgba(136, 212, 171, 0.06) 70%, transparent 100%)',
          filter: 'blur(50px)',
          transformOrigin: 'center center',
        }}
        animate={{
          scaleX: [1, 0.97, 1.04, 0.99, 1],
          scaleY: [1, 1.08, 0.96, 1.04, 1],
          x: [0, -25, 15, -10, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Aurora ribbon 3 - purple hint */}
      <motion.div
        className="absolute"
        style={{
          top: '2%',
          left: '0%',
          width: '100%',
          height: '25%',
          background: 'linear-gradient(180deg, transparent 0%, rgba(123, 104, 238, 0.05) 30%, rgba(123, 104, 238, 0.1) 50%, rgba(123, 104, 238, 0.05) 70%, transparent 100%)',
          filter: 'blur(60px)',
          transformOrigin: 'center center',
        }}
        animate={{
          scaleX: [1, 1.03, 0.96, 1.02, 1],
          scaleY: [1, 0.94, 1.06, 0.98, 1],
          x: [0, 15, -20, 8, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
      />

      {/* Soft vertical streaks */}
      <motion.div
        className="absolute"
        style={{
          top: '0%',
          left: '20%',
          width: '8%',
          height: '40%',
          background: 'linear-gradient(180deg, rgba(78, 204, 163, 0.12) 0%, rgba(78, 204, 163, 0.04) 100%)',
          filter: 'blur(25px)',
        }}
        animate={{ opacity: [0.3, 0.6, 0.3], height: ['35%', '45%', '35%'] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute"
        style={{
          top: '0%',
          left: '55%',
          width: '6%',
          height: '35%',
          background: 'linear-gradient(180deg, rgba(136, 212, 171, 0.1) 0%, rgba(136, 212, 171, 0.03) 100%)',
          filter: 'blur(20px)',
        }}
        animate={{ opacity: [0.4, 0.7, 0.4], height: ['30%', '40%', '30%'] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
      <motion.div
        className="absolute"
        style={{
          top: '0%',
          left: '75%',
          width: '5%',
          height: '30%',
          background: 'linear-gradient(180deg, rgba(123, 104, 238, 0.08) 0%, rgba(123, 104, 238, 0.02) 100%)',
          filter: 'blur(18px)',
        }}
        animate={{ opacity: [0.35, 0.55, 0.35], height: ['25%', '35%', '25%'] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 7 }}
      />
    </div>
  )
})

// ========== SIMPLEX NOISE MIST COMPONENT ==========

const NoiseMist = React.memo(function NoiseMist() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const noise2D = useMemo(() => createNoise2D(), [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let time = 0

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw multiple mist layers
      const layers = [
        { baseY: 0.5, opacity: 0.08, speed: 0.0003, scale: 0.003 },
        { baseY: 0.6, opacity: 0.12, speed: 0.0005, scale: 0.004 },
        { baseY: 0.7, opacity: 0.15, speed: 0.0004, scale: 0.005 },
      ]

      layers.forEach((layer) => {
        ctx.beginPath()

        for (let x = 0; x <= canvas.width; x += 8) {
          const noiseVal = noise2D(x * layer.scale + time * layer.speed, layer.baseY)
          const noiseVal2 = noise2D(x * layer.scale * 2 + time * layer.speed * 0.5, layer.baseY + 100)
          const combined = (noiseVal + noiseVal2 * 0.3) / 1.3

          const baseY = canvas.height * layer.baseY
          const waveHeight = canvas.height * 0.08
          const y = baseY + combined * waveHeight

          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }

        ctx.lineTo(canvas.width, canvas.height)
        ctx.lineTo(0, canvas.height)
        ctx.closePath()

        const gradient = ctx.createLinearGradient(0, canvas.height * layer.baseY, 0, canvas.height)
        gradient.addColorStop(0, `rgba(200, 216, 232, 0)`)
        gradient.addColorStop(0.3, `rgba(200, 216, 232, ${layer.opacity})`)
        gradient.addColorStop(1, `rgba(200, 216, 232, ${layer.opacity * 0.5})`)

        ctx.fillStyle = gradient
        ctx.filter = 'blur(15px)'
        ctx.fill()
        ctx.filter = 'none'
      })

      time++
      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [noise2D])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
    />
  )
})

// ========== MOUNTAIN LAYERS (SVG) ==========

const MountainLayer = React.memo(function MountainLayer({
  layer,
  color,
  opacity,
}: {
  layer: number
  color: string
  opacity: number
}) {
  const paths = [
    "M0,85 Q15,70 30,80 T60,75 T90,82 L100,85 L100,100 L0,100 Z",
    "M0,90 L15,72 Q25,65 35,75 L50,60 Q60,55 70,68 L85,70 Q95,78 100,75 L100,100 L0,100 Z",
    "M0,100 L10,82 L25,65 Q30,60 35,65 L45,55 Q55,48 60,58 L75,62 Q82,58 88,68 L100,78 L100,100 L0,100 Z",
    "M0,100 L8,85 Q15,78 20,82 L30,68 Q38,60 45,70 L55,58 Q65,50 72,62 L82,70 Q90,75 95,82 L100,88 L100,100 L0,100 Z",
    "M0,100 L5,92 L15,78 Q22,72 28,80 L38,70 Q48,62 55,75 L65,68 Q75,60 82,72 L92,80 Q96,85 100,82 L100,100 L0,100 Z",
  ]

  return (
    <motion.svg
      className="absolute bottom-0 left-0 w-full"
      style={{ height: `${55 - layer * 8}%` }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: opacity, y: 0 }}
      transition={{ duration: 1.5, delay: layer * 0.2 }}
    >
      <defs>
        <linearGradient id={`mountain-grad-${layer}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path d={paths[layer]} fill={`url(#mountain-grad-${layer})`} />
    </motion.svg>
  )
})

// ========== FLYING BIRDS ==========

const FlyingBird = React.memo(function FlyingBird({ delay, yPosition }: { delay: number; yPosition: number }) {
  return (
    <motion.svg
      className="absolute"
      style={{ left: '-5%', top: `${yPosition}%`, width: '20px', height: '10px' }}
      viewBox="0 0 20 10"
      initial={{ x: 0, opacity: 0 }}
      animate={{
        x: ['0vw', '110vw'],
        opacity: [0, 0.5, 0.5, 0],
        y: [0, -10, 5, -8, 0],
      }}
      transition={{
        duration: 25 + Math.random() * 15,
        delay: delay,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      <motion.path
        d="M0,5 Q5,0 10,5 Q15,0 20,5"
        fill="none"
        stroke="rgba(90, 100, 120, 0.5)"
        strokeWidth="1.5"
        strokeLinecap="round"
        animate={{
          d: [
            "M0,5 Q5,0 10,5 Q15,0 20,5",
            "M0,5 Q5,3 10,5 Q15,3 20,5",
            "M0,5 Q5,0 10,5 Q15,0 20,5",
          ],
        }}
        transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.svg>
  )
})

// ========== FLOATING CLOUD ==========

const FloatingCloud = React.memo(function FloatingCloud({ startX, yPosition, size, delay, duration }: {
  startX: number; yPosition: number; size: number; delay: number; duration: number
}) {
  return (
    <motion.svg
      className="absolute"
      style={{ left: `${startX}%`, top: `${yPosition}%`, width: `${size}px`, height: `${size * 0.5}px` }}
      viewBox="0 0 100 50"
      initial={{ x: 0, opacity: 0 }}
      animate={{ x: [0, 80, 0], opacity: [0.2, 0.4, 0.2], y: [0, -5, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <defs>
        <filter id={`cloud-blur-${startX}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
      </defs>
      <g fill="rgba(200, 216, 232, 0.35)" filter={`url(#cloud-blur-${startX})`}>
        <ellipse cx="30" cy="30" rx="20" ry="12" />
        <ellipse cx="50" cy="25" rx="25" ry="15" />
        <ellipse cx="70" cy="30" rx="18" ry="11" />
        <ellipse cx="45" cy="32" rx="22" ry="13" />
      </g>
    </motion.svg>
  )
})

// ========== SHOOTING STAR ==========

const ShootingStar = React.memo(function ShootingStar({ delay }: { delay: number }) {
  const startX = 10 + Math.random() * 50
  const startY = 5 + Math.random() * 25

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${startX}%`,
        top: `${startY}%`,
        width: '3px',
        height: '3px',
        background: '#FFFFFF',
        borderRadius: '50%',
        boxShadow: '0 0 8px #FFFFFF, -30px 0 20px rgba(255,255,255,0.5), -60px 0 35px rgba(255,255,255,0.3)',
      }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{ opacity: [0, 1, 1, 0], x: [0, 200, 280], y: [0, 100, 150] }}
      transition={{
        duration: 1.8,
        delay,
        repeat: Infinity,
        repeatDelay: 12 + Math.random() * 18,
        ease: 'easeOut',
      }}
    />
  )
})

// ========== MAIN BACKGROUND COMPONENT ==========

// Global particle engine initialization (runs once)
let particlesInitialized = false
let particlesInitPromise: Promise<void> | null = null

function initParticlesOnce() {
  if (particlesInitialized) return Promise.resolve()
  if (particlesInitPromise) return particlesInitPromise

  particlesInitPromise = initParticlesEngine(async (engine) => {
    await loadSlim(engine)
  }).then(() => {
    particlesInitialized = true
  })

  return particlesInitPromise
}

type BackgroundProps = {
  /**
   * When true, the outer container uses absolute positioning instead of fixed,
   * so the background is contained by its positioned ancestor (e.g. a section).
   * Default: false (full-viewport fixed layer, current behavior).
   */
  bounded?: boolean
}

function BackgroundComponent({ bounded = false }: BackgroundProps = {}) {
  const [mounted, setMounted] = useState(false)
  const [particlesReady, setParticlesReady] = useState(false)
  const { theme, themeName } = useThemeStore()
  const animationsEnabled = useDeskSettings((s) => s.animationsEnabled)

  useEffect(() => {
    setMounted(true)
    initParticlesOnce().then(() => setParticlesReady(true))
  }, [])

  const particlesLoaded = useCallback(async () => {}, [])

  const particleConfig = useMemo(() => {
    const mode = theme.mode
    if (theme.particles === 'fireflies') return getFirefliesConfig()
    if (theme.particles === 'sakura') return getSakuraConfig(mode)
    if (theme.particles === 'mist') return getMistConfig()
    if (theme.particles === 'dust') return getDustConfig(mode)
    if (theme.particles === 'foam') return getFoamConfig(mode)
    if (theme.particles === 'sunbeam') return getSunbeamConfig(mode)
    if (theme.particles === 'embers') return getEmbersConfig()
    if (theme.particles === 'goldFlecks') return getGoldFlecksConfig()
    if (theme.particles === 'rain') return getRainConfig()
    if (theme.particles === 'leaves') {
      return getLeavesConfig(theme.accent.primary, 18)
    }
    return getFirefliesConfig()
  }, [theme.particles, theme.mode, theme.accent.primary])

  if (!mounted) return null

  const isMistyMountains = theme.particles === 'mist'
  const isCherryBlossom = theme.particles === 'sakura'
  const isCandlelight = theme.particles === 'dust'
  const isOceanTwilight = theme.particles === 'foam'
  const isSunset = theme.ambience === 'sunset'
  const isRain = theme.ambience === 'rainy'

  return (
    <div className={`${bounded ? 'absolute' : 'fixed'} inset-0 overflow-hidden pointer-events-none`}>
      {/* Base gradient — always renders so the theme color is visible even
          when animations are disabled. */}
      <div className="absolute inset-0" style={{ background: theme.bg.gradient }} />

      {animationsEnabled && (
      <>
      {/* Theme-specific ambient effects */}
      {isMistyMountains && (
        <>
          {/* Ambient mountain glow */}
          <motion.div
            className="absolute"
            style={{
              bottom: '30%',
              left: '15%',
              width: '70%',
              height: '25%',
              background: 'radial-gradient(ellipse at 50% 100%, rgba(200, 216, 232, 0.12) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floating clouds */}
          <FloatingCloud startX={5} yPosition={6} size={140} delay={0} duration={70} />
          <FloatingCloud startX={45} yPosition={10} size={110} delay={8} duration={60} />
          <FloatingCloud startX={75} yPosition={4} size={90} delay={15} duration={65} />

          {/* Mountain layers */}
          <MountainLayer layer={0} color="#2A3040" opacity={0.4} />
          <MountainLayer layer={1} color="#252A35" opacity={0.55} />
          <MountainLayer layer={2} color="#1F242D" opacity={0.7} />
          <MountainLayer layer={3} color="#1A1E26" opacity={0.85} />
          <MountainLayer layer={4} color="#15181F" opacity={1} />

          {/* Simplex noise mist */}
          <NoiseMist />

          {/* Flying birds */}
          <FlyingBird delay={8} yPosition={18} />
          <FlyingBird delay={28} yPosition={14} />
          <FlyingBird delay={50} yPosition={22} />
        </>
      )}

      {isCherryBlossom && (
        <>
          {/* Pink ambient glow */}
          <motion.div
            className="absolute"
            style={{
              top: '-10%',
              right: '-5%',
              width: '65%',
              height: '55%',
              background: 'radial-gradient(ellipse at center, rgba(232, 160, 184, 0.15) 0%, transparent 70%)',
            }}
            animate={{ opacity: [0.6, 0.9, 0.6], scale: [1, 1.05, 1] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Branch silhouette */}
          <svg className="absolute top-0 right-0 w-72 h-72 opacity-[0.08]" viewBox="0 0 200 200">
            <path d="M200,0 Q180,40 160,50 Q140,60 130,90 Q125,110 140,130" fill="none" stroke="#E8A0B8" strokeWidth="4" />
            <path d="M160,50 Q145,55 135,45 Q125,35 115,50" fill="none" stroke="#E8A0B8" strokeWidth="2.5" />
            <circle cx="130" cy="90" r="10" fill="#FFD4E0" opacity="0.4" />
            <circle cx="115" cy="50" r="7" fill="#FFD4E0" opacity="0.4" />
          </svg>
        </>
      )}

      {/* Rivendell forest glow (default) */}
      {theme.particles === 'fireflies' && (
        <>
          <motion.div
            className="absolute"
            style={{
              top: '-8%',
              right: '-8%',
              width: '55%',
              height: '45%',
              background: 'radial-gradient(ellipse at center, rgba(212, 168, 75, 0.14) 0%, transparent 70%)',
            }}
            animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.05, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Decorative vine - Left side */}
          <motion.svg
            className="absolute top-0 left-0 w-52 h-52 opacity-[0.15]"
            viewBox="0 0 200 200"
            animate={{ rotate: [-1, 1, -1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M0,20 Q50,30 40,80 Q35,120 60,150" fill="none" stroke="#5E8B5A" strokeWidth="2.5" />
            <path d="M20,0 Q30,40 50,60 Q70,80 60,120" fill="none" stroke="#5E8B5A" strokeWidth="2" />
            <ellipse cx="40" cy="80" rx="7" ry="11" fill="#5E8B5A" transform="rotate(-30, 40, 80)" />
            <ellipse cx="55" cy="60" rx="6" ry="9" fill="#5E8B5A" transform="rotate(20, 55, 60)" />
          </motion.svg>

          {/* Decorative vine - Right side (mirror) */}
          <motion.svg
            className="absolute top-0 right-0 w-52 h-52 opacity-[0.15]"
            viewBox="0 0 200 200"
            animate={{ rotate: [1, -1, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <path d="M200,20 Q150,30 160,80 Q165,120 140,150" fill="none" stroke="#5E8B5A" strokeWidth="2.5" />
            <path d="M180,0 Q170,40 150,60 Q130,80 140,120" fill="none" stroke="#5E8B5A" strokeWidth="2" />
            <ellipse cx="160" cy="80" rx="7" ry="11" fill="#5E8B5A" transform="rotate(30, 160, 80)" />
            <ellipse cx="145" cy="60" rx="6" ry="9" fill="#5E8B5A" transform="rotate(-20, 145, 60)" />
          </motion.svg>
        </>
      )}

      {/* Candlelight ambience */}
      {isCandlelight && (
        <>
          {/* Main candle glow - warm center */}
          <motion.div
            className="absolute"
            style={{
              bottom: '20%',
              left: '45%',
              width: '20%',
              height: '30%',
              background: 'radial-gradient(ellipse at 50% 80%, rgba(232, 160, 80, 0.25) 0%, rgba(240, 184, 104, 0.12) 30%, transparent 60%)',
              filter: 'blur(30px)',
            }}
            animate={{
              opacity: [0.7, 0.9, 0.75, 0.85, 0.7],
              scale: [1, 1.02, 0.98, 1.01, 1],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Ambient room warmth */}
          <motion.div
            className="absolute"
            style={{
              bottom: '0%',
              left: '20%',
              width: '60%',
              height: '50%',
              background: 'radial-gradient(ellipse at 50% 100%, rgba(232, 160, 80, 0.08) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }}
            animate={{ opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Subtle flicker on walls */}
          <motion.div
            className="absolute"
            style={{
              top: '0%',
              left: '0%',
              width: '100%',
              height: '100%',
              background: 'radial-gradient(ellipse at 50% 70%, rgba(255, 208, 144, 0.03) 0%, transparent 50%)',
            }}
            animate={{ opacity: [0.3, 0.5, 0.35, 0.45, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Ocean Twilight ambience */}
      {isOceanTwilight && (
        <>
          {/* Sunset horizon glow */}
          <motion.div
            className="absolute"
            style={{
              bottom: '25%',
              left: '0%',
              width: '100%',
              height: '30%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(255, 140, 100, 0.06) 40%, rgba(80, 160, 200, 0.08) 100%)',
              filter: 'blur(40px)',
            }}
            animate={{ opacity: [0.5, 0.7, 0.5] }}
            transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Ocean surface shimmer */}
          <motion.div
            className="absolute"
            style={{
              bottom: '0%',
              left: '-5%',
              width: '110%',
              height: '35%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(80, 160, 200, 0.05) 50%, rgba(80, 160, 200, 0.1) 100%)',
            }}
            animate={{ opacity: [0.6, 0.8, 0.6] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Wave motion hint - subtle horizontal movement */}
          <motion.div
            className="absolute"
            style={{
              bottom: '5%',
              left: '0%',
              width: '100%',
              height: '15%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(176, 224, 240, 0.06) 25%, rgba(176, 224, 240, 0.08) 50%, rgba(176, 224, 240, 0.06) 75%, transparent 100%)',
              filter: 'blur(20px)',
            }}
            animate={{ x: [-20, 20, -20] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Moon reflection */}
          <motion.div
            className="absolute"
            style={{
              top: '8%',
              right: '15%',
              width: '60px',
              height: '60px',
              background: 'radial-gradient(circle, rgba(255, 255, 240, 0.15) 0%, rgba(255, 255, 240, 0.05) 40%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(5px)',
            }}
            animate={{ opacity: [0.6, 0.8, 0.6], scale: [1, 1.05, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Sunset ambience — warm sun, horizon haze, drifting silhouette birds */}
      {isSunset && (
        <>
          {/* Soft sun disc, low on the horizon */}
          <motion.div
            className="absolute"
            style={{
              top: '38%',
              left: '70%',
              width: '220px',
              height: '220px',
              background: 'radial-gradient(circle, rgba(255, 220, 150, 0.55) 0%, rgba(255, 180, 110, 0.35) 35%, rgba(240, 130, 90, 0.15) 60%, transparent 80%)',
              borderRadius: '50%',
              filter: 'blur(2px)',
            }}
            animate={{ opacity: [0.85, 1, 0.85], scale: [1, 1.04, 1] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Wide warm horizon glow */}
          <motion.div
            className="absolute"
            style={{
              bottom: '20%',
              left: '-5%',
              width: '110%',
              height: '32%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(255, 168, 110, 0.18) 45%, rgba(232, 110, 80, 0.10) 100%)',
              filter: 'blur(40px)',
            }}
            animate={{ opacity: [0.55, 0.8, 0.55] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Long golden ray */}
          <motion.div
            className="absolute"
            style={{
              top: '20%',
              left: '40%',
              width: '50%',
              height: '40%',
              background: 'linear-gradient(120deg, transparent 0%, rgba(255, 210, 150, 0.10) 40%, transparent 80%)',
              filter: 'blur(30px)',
              transformOrigin: 'top right',
            }}
            animate={{ opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Distant silhouette birds drifting across the sky */}
          <FlyingBird delay={5} yPosition={22} />
          <FlyingBird delay={20} yPosition={28} />
          <FlyingBird delay={42} yPosition={18} />
        </>
      )}

      {/* Rain ambience — overcast wash, distant window warmth, low fog */}
      {isRain && (
        <>
          {/* Soft overcast top wash — diffuse cool light from a dim sky */}
          <motion.div
            className="absolute"
            style={{
              top: '-10%',
              left: '-5%',
              width: '110%',
              height: '55%',
              background: 'radial-gradient(ellipse at 50% 0%, rgba(168, 194, 220, 0.16) 0%, rgba(120, 152, 184, 0.08) 35%, transparent 70%)',
              filter: 'blur(40px)',
            }}
            animate={{ opacity: [0.55, 0.75, 0.55] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Distant lit window — small warm amber smudge far away, the only
              point of warmth on a rainy night. Slow gentle pulse. */}
          <motion.div
            className="absolute"
            style={{
              top: '32%',
              left: '78%',
              width: '90px',
              height: '60px',
              background: 'radial-gradient(ellipse at center, rgba(212, 168, 120, 0.32) 0%, rgba(212, 168, 120, 0.12) 45%, transparent 75%)',
              filter: 'blur(8px)',
              borderRadius: '20%',
            }}
            animate={{ opacity: [0.6, 0.85, 0.65, 0.8, 0.6] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Drifting low cloud layer */}
          <motion.div
            className="absolute"
            style={{
              top: '8%',
              left: '-10%',
              width: '120%',
              height: '18%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(108, 128, 152, 0.18) 50%, transparent 100%)',
              filter: 'blur(30px)',
            }}
            animate={{ x: [-30, 30, -30] }}
            transition={{ duration: 40, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Horizon haze — wet air pooling near the ground */}
          <motion.div
            className="absolute"
            style={{
              bottom: '0%',
              left: '-5%',
              width: '110%',
              height: '32%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(122, 152, 184, 0.10) 50%, rgba(80, 100, 124, 0.16) 100%)',
              filter: 'blur(28px)',
            }}
            animate={{ opacity: [0.55, 0.75, 0.55] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Faint wet-pavement reflection — thin shimmer at the very bottom */}
          <motion.div
            className="absolute"
            style={{
              bottom: '0%',
              left: '0%',
              width: '100%',
              height: '6%',
              background: 'linear-gradient(180deg, transparent 0%, rgba(168, 194, 220, 0.12) 100%)',
            }}
            animate={{ opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* tsParticles layer */}
      {particlesReady && (
        <Particles
          key={`particles-${themeName}`}
          id="tsparticles-main"
          className="absolute inset-0"
          particlesLoaded={particlesLoaded}
          options={particleConfig}
        />
      )}
      </>
      )}
    </div>
  )
}

// Memoize to prevent re-renders on navigation
const Background = React.memo(BackgroundComponent)
export default Background
