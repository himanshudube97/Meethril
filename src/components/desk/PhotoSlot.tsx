'use client'

import React, { memo, useRef, useCallback, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { usePhotoSrc } from '@/hooks/usePhotoSrc'

interface PhotoSlotProps {
  photo?: {
    url?: string
    encryptedRef?: string
    encryptedRefIV?: string
    rotation: number
  } | null
  position: 1 | 2
  spread: number
  onPhotoAdd?: (file: File) => void
  onCameraCapture?: () => void
  /** When set, a small × button appears on the filled polaroid (hover to
   *  reveal) that calls this callback. Omit to hide the remove affordance —
   *  e.g. for read-only past entries. */
  onRemove?: () => void
  disabled?: boolean
  className?: string
  dateCaption?: string  // e.g. "apr 27"
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const MAX_WIDTH = 1200
const POLAROID_ASPECT_RATIO = 4 / 5 // 4:5 aspect ratio

// Compress and resize image client-side
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
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Calculate dimensions maintaining aspect ratio
      let width = img.width
      let height = img.height

      // Resize to max width if needed
      if (width > MAX_WIDTH) {
        height = (height * MAX_WIDTH) / width
        width = MAX_WIDTH
      }

      // Crop to polaroid aspect ratio (center crop)
      const targetHeight = width / POLAROID_ASPECT_RATIO
      let sx = 0, sy = 0, sw = img.width, sh = img.height

      if (height > targetHeight) {
        // Crop top and bottom
        const cropAmount = (height - targetHeight) / 2
        sy = (cropAmount / height) * img.height
        sh = img.height - (2 * sy)
        height = targetHeight
      } else if (height < targetHeight) {
        // Crop left and right
        const targetWidth = height * POLAROID_ASPECT_RATIO
        const cropAmount = (width - targetWidth) / 2
        sx = (cropAmount / width) * img.width
        sw = img.width - (2 * sx)
        width = targetWidth
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height)

      // Convert to JPEG with compression
      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)

      // Reduce quality if still too large
      while (dataUrl.length > MAX_SIZE_BYTES * 1.37 && quality > 0.3) {
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

const PhotoSlot = memo(function PhotoSlot({
  photo,
  position,
  spread: _spread, // Used by parent for tracking, not needed here
  onPhotoAdd,
  onCameraCapture,
  onRemove,
  disabled = false,
  className = '',
  dateCaption = '~',
}: PhotoSlotProps) {
  void _spread // Acknowledge unused parameter
  const { theme } = useThemeStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const heartColor = theme.accent.warm

  // Random tilt per mount so empty polaroids feel as natural as freshly-clicked ones
  const defaultRotation = useMemo(() => {
    const base = position === 1 ? -7 : 7
    const jitter = (Math.random() - 0.5) * 6 // ±3°
    return base + jitter
  }, [position])

  // Subtle wiggle target for hover (opposite direction = more "alive")
  const hoverRotation = defaultRotation + (position === 1 ? 2 : -2)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onPhotoAdd) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Validate file size
    if (file.size > MAX_SIZE_BYTES) {
      alert('Image must be less than 5MB')
      return
    }

    setIsProcessing(true)

    try {
      await processImage(file)
      onPhotoAdd(file)
    } catch (error) {
      console.error('Failed to process image:', error)
      alert('Failed to process image')
    } finally {
      setIsProcessing(false)
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onPhotoAdd])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleCameraClick = useCallback(() => {
    onCameraCapture?.()
  }, [onCameraCapture])

  // Resolve the image src — handles both plain URL and E2EE encrypted ref
  const resolvedSrc = usePhotoSrc(photo ?? {})

  // If photo exists, show the polaroid
  if (photo) {
    const filledRotation = photo.rotation || defaultRotation
    return (
      <motion.div
        className={`relative ${className}`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        style={{ transformOrigin: 'center center' }}
        initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: filledRotation }}
        whileHover={{ scale: 1.04, rotate: filledRotation + (position === 1 ? 2 : -2) }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <div
          className="relative"
          style={{
            background: '#f5efdc',
            padding: '8px 8px 22px',
            boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
          }}
        >
          {/* Washi-tape strip */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: '-8px',
              left: '50%',
              transform: 'translateX(-50%) rotate(-2deg)',
              width: '50px',
              height: '14px',
              background: 'rgba(220, 200, 140, 0.55)',
              border: '1px solid rgba(220, 200, 140, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {/* Photo */}
          <div
            className="w-full overflow-hidden"
            style={{ aspectRatio: '4/5' }}
          >
            {resolvedSrc ? (
              <img
                src={resolvedSrc}
                alt="Journal photo"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: 'rgba(60,40,20,0.06)' }}
              />
            )}
          </div>

          {/* Remove button — appears on hover when removal is allowed.
              Counter-rotated by the polaroid's tilt so the × stays
              visually upright. */}
          {onRemove && (
            <motion.button
              type="button"
              aria-label="Remove photo"
              title="Remove photo"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
              initial={false}
              animate={{ opacity: isHovering ? 1 : 0, scale: isHovering ? 1 : 0.85 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(20, 14, 4, 0.78)',
                color: '#f5efdc',
                border: '1px solid rgba(245, 239, 220, 0.45)',
                fontSize: 14,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                pointerEvents: isHovering ? 'auto' : 'none',
                transform: `rotate(${-filledRotation}deg)`,
              }}
            >
              ×
            </motion.button>
          )}

          {/* Date caption */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '8px',
              right: '8px',
              display: 'flex',
              justifyContent: 'flex-end',
              fontFamily: "'Caveat', cursive",
              fontSize: '11px',
              color: 'rgba(60,40,20,0.6)',
            }}
          >
            {dateCaption}
          </div>
        </div>
      </motion.div>
    )
  }

  // Empty slot on a locked entry — render an empty polaroid with a heart so
  // it reads as "no photo here" without breaking the polaroid aesthetic.
  if (disabled) {
    return (
      <motion.div
        className={`relative ${className}`}
        style={{ transformOrigin: 'center center' }}
        initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: defaultRotation }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      >
        <div
          className="relative"
          style={{
            background: '#f5efdc',
            padding: '8px 8px 22px',
            boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
          }}
        >
          {/* Washi-tape strip */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: '-8px',
              left: '50%',
              transform: 'translateX(-50%) rotate(-2deg)',
              width: '50px',
              height: '14px',
              background: 'rgba(220, 200, 140, 0.55)',
              border: '1px solid rgba(220, 200, 140, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {/* Empty photo well with heart */}
          <div
            className="w-full flex items-center justify-center"
            style={{
              aspectRatio: '4/5',
              background: 'rgba(60,40,20,0.08)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="34"
              height="34"
              fill={heartColor}
              style={{ opacity: 0.3 }}
              aria-hidden
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ transformOrigin: 'center center' }}
      initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: defaultRotation }}
      whileHover={{ scale: 1.04, rotate: hoverRotation }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Polaroid frame (cream borders, transparent center so page bg shows through) */}
      <div
        className="relative"
        style={{
          background: 'transparent',
          borderStyle: 'solid',
          borderColor: '#f5efdc',
          borderWidth: '8px 8px 22px 8px',
          boxShadow: '0 6px 14px rgba(0,0,0,0.35)',
        }}
      >
        {/* Washi-tape strip at the top (offset by border width to keep visual position) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '-16px',
            left: '50%',
            transform: 'translateX(-50%) rotate(-2deg)',
            width: '50px',
            height: '14px',
            background: 'rgba(220, 200, 140, 0.55)',
            border: '1px solid rgba(220, 200, 140, 0.25)',
            pointerEvents: 'none',
          }}
        />

        {/* Inner photo well (empty state — transparent so page bg shows through) */}
        <div
          className="w-full flex flex-col items-center justify-center"
          style={{
            aspectRatio: '4/5',
            background: 'transparent',
            border: `1px dashed ${
              isHovering ? 'rgba(245,239,220,0.7)' : 'rgba(245,239,220,0.4)'
            }`,
          }}
        >
          {isProcessing ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="text-lg"
              style={{ color: 'rgba(60,40,20,0.5)' }}
            >
              ...
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 w-3/4">
              <motion.button
                onClick={handleUploadClick}
                className="w-full py-1.5 rounded text-[11px] cursor-pointer"
                style={{
                  fontFamily: "'Caveat', cursive",
                  color: 'rgba(60,40,20,0.65)',
                  background: 'rgba(255,250,235,0.6)',
                  border: '1px solid rgba(60,40,20,0.15)',
                }}
                whileHover={{ scale: 1.03, backgroundColor: 'rgba(255,250,235,0.85)' }}
                whileTap={{ scale: 0.97 }}
              >
                Upload
              </motion.button>
              {onCameraCapture && (
                <motion.button
                  onClick={handleCameraClick}
                  className="w-full py-1.5 rounded text-[11px] cursor-pointer"
                  style={{
                    fontFamily: "'Caveat', cursive",
                    color: 'rgba(60,40,20,0.65)',
                    background: 'rgba(255,250,235,0.6)',
                    border: '1px solid rgba(60,40,20,0.15)',
                  }}
                  whileHover={{ scale: 1.03, backgroundColor: 'rgba(255,250,235,0.85)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  Click
                </motion.button>
              )}
            </div>
          )}
        </div>

        {/* Date caption — sits inside the bottom cream border */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '-18px',
            left: '0',
            right: '0',
            display: 'flex',
            justifyContent: 'flex-end',
            paddingRight: '4px',
            fontFamily: "'Caveat', cursive",
            fontSize: '11px',
            color: 'rgba(60,40,20,0.5)',
          }}
        >
          ~
        </div>
      </div>
    </motion.div>
  )
})

export default PhotoSlot
