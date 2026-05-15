'use client'

import { useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import CameraModal from '@/components/desk/CameraModal'

interface CollagePhotoProps {
  position: 'top-right' | 'bottom-left'
  photo: string | null
  onPhotoChange: (dataUrl: string | null) => void
  /** Compact / letter-slot mode: renders in normal flow instead of using
   *  the large absolute offsets tuned for the journal desk layout.
   *  Existing callers that omit this prop are unaffected. */
  compact?: boolean
}

const MAX_WIDTH = 1200
const POLAROID_ASPECT_RATIO = 4 / 5

async function processImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('No canvas context')); return }

      let width = img.width
      let height = img.height
      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width
        width = MAX_WIDTH
      }

      const targetHeight = width / POLAROID_ASPECT_RATIO
      let sx = 0, sy = 0, sw = img.width, sh = img.height

      if (height > targetHeight) {
        const cropAmount = (height - targetHeight) / 2
        sy = (cropAmount / height) * img.height
        sh = img.height - (2 * sy)
        height = targetHeight
      } else if (height < targetHeight) {
        const targetWidth = height * POLAROID_ASPECT_RATIO
        const cropAmount = (width - targetWidth) / 2
        sx = (cropAmount / width) * img.width
        sw = img.width - (2 * sx)
        width = targetWidth
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)

      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while (dataUrl.length > 5 * 1024 * 1024 * 1.37 && quality > 0.3) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(dataUrl)
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export default function CollagePhoto({ position, photo, onPhotoChange, compact = false }: CollagePhotoProps) {
  const { theme } = useThemeStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  const rotation = position === 'top-right' ? 7 : -7

  // Journal desk layout: large absolute offsets so the polaroid overlaps the
  // page edge for a scattered effect.
  // Compact / letter-slot mode: in-flow positioning so the component fills its
  // parent container without overflowing it.
  const positionStyle: React.CSSProperties = compact
    ? { position: 'relative', width: '100%', height: '100%', zIndex: 10 }
    : position === 'top-right'
      ? { top: -30, right: -110, zIndex: 10, position: 'absolute' }
      : { bottom: -30, left: -110, zIndex: 10, position: 'absolute' }

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    setIsProcessing(true)
    try {
      const dataUrl = await processImage(file)
      onPhotoChange(dataUrl)
    } catch (error) {
      console.error('Failed to process image:', error)
    } finally {
      setIsProcessing(false)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onPhotoChange])

  if (photo) {
    return (
      <motion.div
        style={positionStyle}
        initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: compact ? 0 : rotation }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <div
          className="rounded-sm overflow-hidden shadow-lg cursor-pointer group relative"
          style={{
            background: theme.glass.bg,
            backdropFilter: `blur(12px)`,
            border: `1px solid ${theme.glass.border}`,
            padding: compact ? '4px 4px 14px 4px' : '6px 6px 20px 6px',
            width: compact ? '100%' : 120,
            height: compact ? '100%' : undefined,
            boxSizing: compact ? 'border-box' : 'content-box',
            boxShadow: '0 6px 20px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)',
          }}
          onClick={() => onPhotoChange(null)}
          title="Remove photo"
        >
          <div className="w-full overflow-hidden rounded-sm" style={{ height: compact ? 'calc(100% - 14px)' : undefined, aspectRatio: compact ? undefined : '4/5' }}>
            <img src={photo} alt="Collage photo" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-sm">
            <span className="text-white text-lg font-light">x</span>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      style={positionStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.8, duration: 0.6 }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      <motion.div
        animate={{ rotate: compact ? 0 : rotation }}
        className="flex flex-col items-center justify-center"
        style={{
          width: compact ? '100%' : 100,
          height: compact ? '100%' : undefined,
          aspectRatio: compact ? undefined : '4/5',
          border: `2px dashed ${theme.accent.warm}60`,
          borderRadius: '4px',
          background: `${theme.glass.bg}`,
          padding: '6px 6px 18px 6px',
          boxSizing: compact ? 'border-box' : 'content-box',
        }}
      >
        {isProcessing ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="text-sm"
            style={{ color: theme.text.muted }}
          >
            ...
          </motion.span>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 w-full">
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: theme.text.secondary }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[10px] font-medium">Upload</span>
            </motion.button>
            <motion.button
              onClick={() => setShowCamera(true)}
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: theme.text.secondary }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span className="text-[10px] font-medium">Camera</span>
            </motion.button>
          </div>
        )}
      </motion.div>

      <CameraModal
        isOpen={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(dataUrl) => {
          onPhotoChange(dataUrl)
          setShowCamera(false)
        }}
      />
    </motion.div>
  )
}
