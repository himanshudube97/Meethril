'use client'

import React, { memo, useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'

interface CameraModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (dataUrl: string) => void
}

const MAX_WIDTH = 1200
const POLAROID_ASPECT_RATIO = 4 / 5

// An overlay layer that CSS `filter` can't produce on its own — what gives a
// preset its "film" feel beyond a flat colour shift. Composited identically in
// the live preview (CSS layers) and the capture (<canvas>), so WYSIWYG.
interface FilterOverlay {
  /** Edge darkening, 0..1. */
  vignette?: number
  /** Film-grain opacity, 0..1 (over the shared noise texture). */
  grain?: number
  /** Soft colour wash / light-leak. */
  tint?: { color: string; opacity: number }
}

interface CameraFilter {
  name: string
  /** Colour grade — valid CSS filter string, applied to <video> + ctx.filter. */
  css: string
  overlay?: FilterOverlay
}

const FILTERS: CameraFilter[] = [
  { name: 'Original', css: 'none' },
  { name: 'Mono', css: 'grayscale(100%) contrast(1.06)', overlay: { vignette: 0.28, grain: 0.1 } },
  { name: 'Sepia', css: 'sepia(70%) contrast(1.05) brightness(1.02)', overlay: { vignette: 0.22, grain: 0.07 } },
  { name: 'Golden', css: 'saturate(1.35) contrast(1.04) brightness(1.03) hue-rotate(-8deg)', overlay: { vignette: 0.18, tint: { color: 'rgba(255,170,80,0.85)', opacity: 0.5 } } },
  { name: 'Frost', css: 'saturate(0.92) brightness(1.05) contrast(1.02) hue-rotate(12deg)', overlay: { tint: { color: 'rgba(120,170,230,0.85)', opacity: 0.4 } } },
  { name: 'Film', css: 'sepia(22%) contrast(1.12) saturate(1.05) brightness(0.98)', overlay: { vignette: 0.34, grain: 0.16 } },
  { name: 'Faded', css: 'contrast(0.86) brightness(1.09) saturate(0.85)', overlay: { grain: 0.06, tint: { color: 'rgba(245,235,220,0.95)', opacity: 0.22 } } },
  { name: 'Vivid', css: 'saturate(1.7) contrast(1.12)', overlay: { vignette: 0.16 } },
  { name: 'Dreamy', css: 'brightness(1.12) contrast(0.92) saturate(1.08)', overlay: { vignette: 0.12, tint: { color: 'rgba(255,255,255,0.9)', opacity: 0.18 } } },
  { name: 'Rose', css: 'saturate(1.2) brightness(1.03) hue-rotate(-12deg)', overlay: { vignette: 0.14, tint: { color: 'rgba(240,150,170,0.85)', opacity: 0.3 } } },
]

// One-time monochrome noise texture, reused as a CSS background (preview) and a
// canvas pattern (capture) so the grain matches in both.
function buildNoiseCanvas(size = 128): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const cx = c.getContext('2d')
  if (!cx) return null
  const img = cx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 256)
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  cx.putImageData(img, 0, 0)
  return c
}

// Bakes the overlay layers onto the capture canvas, on top of the colour-graded
// frame. Mirrors <FilterOverlays/> below. Runs in identity transform so the
// front-camera mirror (applied for drawImage) doesn't skew the layers.
function paintOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlay: FilterOverlay | undefined,
  noise: HTMLCanvasElement | null,
) {
  if (!overlay) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'

  if (overlay.tint) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = overlay.tint.opacity
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, overlay.tint.color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  if (overlay.grain && noise) {
    const pat = ctx.createPattern(noise, 'repeat')
    if (pat) {
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = overlay.grain
      ctx.fillStyle = pat
      ctx.fillRect(0, 0, w, h)
    }
  }

  if (overlay.vignette) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    const r = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.7)
    r.addColorStop(0, 'rgba(0,0,0,0)')
    r.addColorStop(1, `rgba(0,0,0,${overlay.vignette})`)
    ctx.fillStyle = r
    ctx.fillRect(0, 0, w, h)
  }

  ctx.restore()
}

// Live-preview twin of paintOverlays — CSS layers over the <video>.
function FilterOverlays({ overlay, grainUrl }: { overlay?: FilterOverlay; grainUrl: string | null }) {
  if (!overlay) return null
  return (
    <>
      {overlay.tint && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${overlay.tint.color}, transparent)`,
            mixBlendMode: 'soft-light',
            opacity: overlay.tint.opacity,
          }}
        />
      )}
      {overlay.grain && grainUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${grainUrl})`,
            backgroundSize: '128px 128px',
            backgroundRepeat: 'repeat',
            mixBlendMode: 'overlay',
            opacity: overlay.grain,
          }}
        />
      )}
      {overlay.vignette && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${overlay.vignette}) 100%)`,
          }}
        />
      )}
    </>
  )
}

const CameraModal = memo(function CameraModal({
  isOpen,
  onClose,
  onCapture,
}: CameraModalProps) {
  const { theme } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [activeFilter, setActiveFilter] = useState(0)
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  // Shared film-grain texture: a <canvas> for baking into the capture and its
  // data URL for the CSS preview layer. Built once.
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [grainUrl, setGrainUrl] = useState<string | null>(null)
  useEffect(() => {
    const c = buildNoiseCanvas(128)
    if (c) {
      noiseCanvasRef.current = c
      setGrainUrl(c.toDataURL())
    }
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setError(null)

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: MAX_WIDTH },
          height: { ideal: MAX_WIDTH / POLAROID_ASPECT_RATIO },
        },
        audio: false,
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsStreaming(true)
      }
    } catch (err) {
      console.error('Camera access error:', err)
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access in your browser settings.')
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.')
        } else {
          setError('Could not access camera. Please try again.')
        }
      } else {
        setError('Could not access camera.')
      }
    }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsStreaming(false)
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !isStreaming) return

    const video = videoRef.current
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Calculate crop for polaroid aspect ratio
    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    const targetHeight = videoWidth / POLAROID_ASPECT_RATIO

    let sx = 0, sy = 0, sw = videoWidth, sh = videoHeight

    if (videoHeight > targetHeight) {
      // Crop top and bottom
      sy = (videoHeight - targetHeight) / 2
      sh = targetHeight
    } else {
      // Crop left and right
      const targetWidth = videoHeight * POLAROID_ASPECT_RATIO
      sx = (videoWidth - targetWidth) / 2
      sw = targetWidth
    }

    // Set canvas size
    const outputWidth = Math.min(sw, MAX_WIDTH)
    const outputHeight = outputWidth / POLAROID_ASPECT_RATIO

    canvas.width = outputWidth
    canvas.height = outputHeight

    // Mirror horizontally for front camera to match preview
    if (facingMode === 'user') {
      ctx.translate(outputWidth, 0)
      ctx.scale(-1, 1)
    }

    // Apply selected filter
    const filterCss = FILTERS[activeFilter].css
    if (filterCss !== 'none') {
      ctx.filter = filterCss
    }

    // Draw cropped video frame
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight)

    // Bake the grain/vignette/tint overlay on top so the saved photo matches
    // the live preview exactly.
    paintOverlays(ctx, outputWidth, outputHeight, FILTERS[activeFilter].overlay, noiseCanvasRef.current)

    // Get data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCapturedImage(dataUrl)
    stopCamera()
  }, [isStreaming, stopCamera, facingMode, activeFilter])

  const retakePhoto = useCallback(() => {
    setCapturedImage(null)
    startCamera()
  }, [startCamera])

  const usePhoto = useCallback(() => {
    if (capturedImage) {
      onCapture(capturedImage)
      setCapturedImage(null)
      onClose()
    }
  }, [capturedImage, onCapture, onClose])

  const toggleCamera = useCallback(() => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user')
  }, [])

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen && !capturedImage) {
      // Use void to indicate intentional fire-and-forget
      void startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera, capturedImage])

  // Restart camera when facing mode changes
  useEffect(() => {
    if (isOpen && isStreaming) {
      void startCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  // Grab a small snapshot for filter thumbnails
  useEffect(() => {
    if (!isStreaming || !videoRef.current) {
      setThumbnailSrc(null)
      return
    }
    const grabFrame = () => {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) return
      const c = document.createElement('canvas')
      c.width = 48
      c.height = 60
      const cx = c.getContext('2d')
      if (!cx) return
      if (facingMode === 'user') {
        cx.translate(48, 0)
        cx.scale(-1, 1)
      }
      cx.drawImage(video, 0, 0, 48, 60)
      setThumbnailSrc(c.toDataURL('image/jpeg', 0.5))
    }
    grabFrame()
    const id = setInterval(grabFrame, 2000)
    return () => clearInterval(id)
  }, [isStreaming, facingMode])

  const handleClose = useCallback(() => {
    stopCamera()
    setCapturedImage(null)
    setError(null)
    setActiveFilter(0)
    setThumbnailSrc(null)
    onClose()
  }, [stopCamera, onClose])

  useEffect(() => { setMounted(true) }, [])

  if (!isOpen) return null

  const modal = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.8)' }}
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative max-w-lg w-full rounded-xl overflow-hidden"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(${theme.glass.blur})`,
            border: `1px solid ${theme.glass.border}`,
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ borderColor: theme.glass.border }}
          >
            <h3 className="text-lg font-medium" style={{ color: theme.text.primary }}>
              Take Photo
            </h3>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              style={{ color: theme.text.muted }}
            >
              X
            </button>
          </div>

          {/* Camera view / Captured image. isolate scopes the filter blend
              modes so they composite with the video, not the modal behind. */}
          <div className="relative" style={{ aspectRatio: '4/5', isolation: 'isolate' }}>
            {error ? (
              <div
                className="absolute inset-0 flex items-center justify-center p-8 text-center"
                style={{ color: theme.text.muted }}
              >
                <div>
                  <div className="text-4xl mb-4 opacity-50">:(</div>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            ) : capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{
                    transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                    filter: FILTERS[activeFilter].css,
                  }}
                />
                {isStreaming && (
                  <FilterOverlays overlay={FILTERS[activeFilter].overlay} grainUrl={grainUrl} />
                )}
                {!isStreaming && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)' }}
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-8 h-8 border-2 border-white border-t-transparent rounded-full"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Filters */}
          {!capturedImage && !error && (
            <div
              className="flex gap-2 px-4 py-2 overflow-x-auto"
              style={{ borderTop: `1px solid ${theme.glass.border}` }}
            >
              {FILTERS.map((f, i) => (
                <button
                  key={f.name}
                  onClick={() => setActiveFilter(i)}
                  className="shrink-0 flex flex-col items-center gap-1"
                >
                  <div
                    className="relative isolate w-12 h-12 rounded-lg overflow-hidden border-2 transition-all"
                    style={{
                      borderColor: activeFilter === i ? theme.accent.warm : 'transparent',
                      opacity: activeFilter === i ? 1 : 0.7,
                    }}
                  >
                    {thumbnailSrc ? (
                      <>
                        <img
                          src={thumbnailSrc}
                          alt={f.name}
                          className="w-full h-full object-cover"
                          style={{ filter: f.css }}
                        />
                        <FilterOverlays overlay={f.overlay} grainUrl={grainUrl} />
                      </>
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{ background: 'rgba(255,255,255,0.1)' }}
                      />
                    )}
                  </div>
                  <span
                    className="text-[9px]"
                    style={{
                      color: activeFilter === i ? theme.accent.warm : theme.text.muted,
                      fontWeight: activeFilter === i ? 600 : 400,
                    }}
                  >
                    {f.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="p-4 flex items-center justify-center gap-4">
            {capturedImage ? (
              <>
                <motion.button
                  onClick={retakePhoto}
                  className="px-6 py-3 rounded-full text-sm font-medium"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: theme.text.primary,
                    border: `1px solid ${theme.glass.border}`,
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Retake
                </motion.button>
                <motion.button
                  onClick={usePhoto}
                  className="px-8 py-3 rounded-full text-sm font-medium"
                  style={{
                    background: theme.accent.warm,
                    color: 'white',
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Use Photo
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  onClick={toggleCamera}
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: theme.text.primary,
                    border: `1px solid ${theme.glass.border}`,
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title="Switch camera"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9h4.5l1.5-3h6l1.5 3H21"/>
                    <path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/>
                    <path d="M20 4h-2"/>
                    <path d="M17 4v3"/>
                  </svg>
                </motion.button>
                <motion.button
                  onClick={capturePhoto}
                  disabled={!isStreaming}
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: isStreaming ? theme.accent.warm : 'rgba(255,255,255,0.1)',
                    color: 'white',
                    opacity: isStreaming ? 1 : 0.5,
                  }}
                  whileHover={isStreaming ? { scale: 1.1 } : {}}
                  whileTap={isStreaming ? { scale: 0.9 } : {}}
                >
                  <div
                    className="w-12 h-12 rounded-full border-4"
                    style={{ borderColor: 'white' }}
                  />
                </motion.button>
                <div className="w-12" /> {/* Spacer for alignment */}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )

  return mounted ? createPortal(modal, document.body) : null
})

export default CameraModal
