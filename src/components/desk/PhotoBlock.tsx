'use client'

import React, { memo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import PhotoSlot from './PhotoSlot'
import CameraModal from './CameraModal'
import { useE2EEStore } from '@/store/e2ee'
import { encryptBytes, encryptString } from '@/lib/e2ee/crypto'

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function postBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const res = await fetch('/api/photos', {
    method: 'POST',
    body: bytes as BodyInit,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  if (!res.ok) throw new Error(`photo upload failed: ${res.status}`)
  const { handle } = (await res.json()) as { handle: string }
  return handle
}

async function uploadAndAdd(
  buffer: ArrayBuffer,
  position: 1 | 2,
  masterKey: CryptoKey | null,
  onPhotoAdd: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void,
) {
  if (masterKey) {
    // E2EE: encrypt bytes, upload, then encrypt the {handle, iv} reference.
    const { ciphertext, iv } = await encryptBytes(buffer, masterKey)
    const binary = atob(ciphertext)
    const cipher = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) cipher[i] = binary.charCodeAt(i)
    const handle = await postBytes(cipher)
    const refEncrypted = await encryptString(JSON.stringify({ handle, iv }), masterKey)
    onPhotoAdd(position, {
      encryptedRef: refEncrypted.ciphertext,
      encryptedRefIV: refEncrypted.iv,
    })
    return
  }
  // Non-E2EE: upload plaintext bytes; reference by handle URL.
  const handle = await postBytes(buffer)
  onPhotoAdd(position, { url: `/api/photos/${handle}` })
}

export interface Photo {
  id?: string
  url?: string
  encryptedRef?: string
  encryptedRefIV?: string
  rotation: number
  position: 1 | 2
}

interface PhotoBlockProps {
  photos: Photo[]
  onPhotoAdd?: (position: 1 | 2, photo: Pick<Photo, 'url' | 'encryptedRef' | 'encryptedRefIV'>) => void
  /** When set, each filled polaroid shows a × on hover that calls this with
   *  the slot position. Omit for read-only entries. */
  onPhotoRemove?: (position: 1 | 2) => void
  disabled?: boolean
  className?: string
  dateCaption?: string
  /** 'scattered' (default) keeps the overlapping tilted polaroids used by the
   *  journal. 'row' lays the two side by side with a gap (used by the letter
   *  back, which has full-width room). */
  layout?: 'scattered' | 'row'
}

const PhotoBlock = memo(function PhotoBlock({
  photos,
  onPhotoAdd,
  onPhotoRemove,
  disabled = false,
  className = '',
  dateCaption,
  layout = 'scattered',
}: PhotoBlockProps) {
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [activePosition, setActivePosition] = useState<1 | 2>(1)

  const photo1 = photos.find(p => p.position === 1)
  const photo2 = photos.find(p => p.position === 2)

  const isRow = layout === 'row'
  // Bigger polaroids in row mode — the letter back has full width to spare.
  const slotWidth = isRow ? 'w-40' : 'w-28'

  const handlePhotoAdd = useCallback((position: 1 | 2) => {
    return async (file: File) => {
      if (!onPhotoAdd) return

      const state = useE2EEStore.getState()
      const masterKey = state.masterKey
      const isE2EEReady = state.isEnabled && state.isUnlocked && masterKey !== null

      // E2EE on but locked: refuse to upload as plaintext. Doing so would
      // store a plaintext URL on an E2EE entry, which the autosave guard
      // would then silently drop — losing the photo. Prompt the user to
      // unlock instead.
      if (state.isEnabled && !isE2EEReady) {
        state.setShowUnlockModal(true)
        return
      }

      try {
        const buffer = await file.arrayBuffer()
        await uploadAndAdd(buffer, position, isE2EEReady ? masterKey : null, onPhotoAdd)
      } catch (err) {
        console.error('photo upload failed:', err)
      }
    }
  }, [onPhotoAdd])

  const handleCameraOpen = useCallback((position: 1 | 2) => {
    return () => {
      setActivePosition(position)
      setCameraModalOpen(true)
    }
  }, [])

  const handleCameraCapture = useCallback(async (dataUrl: string) => {
    if (!onPhotoAdd) return
    try {
      const state = useE2EEStore.getState()
      const masterKey = state.masterKey
      const isE2EEReady = state.isEnabled && state.isUnlocked && masterKey !== null

      if (state.isEnabled && !isE2EEReady) {
        state.setShowUnlockModal(true)
        return
      }

      const buffer = dataUrlToArrayBuffer(dataUrl)
      await uploadAndAdd(buffer, activePosition, isE2EEReady ? masterKey : null, onPhotoAdd)
    } catch (err) {
      console.error('camera photo upload failed:', err)
    }
  }, [onPhotoAdd, activePosition])

  return (
    <>
      <motion.div
        className={`relative flex items-start justify-center ${isRow ? 'gap-8' : 'gap-2'} ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {/* Photo 1 — overlaps left in scattered mode; sits in a row otherwise */}
        <div className="relative z-10" style={{ marginRight: isRow ? 0 : '-12px' }}>
          <PhotoSlot
            photo={photo1}
            position={1}
            spread={1}
            onPhotoAdd={handlePhotoAdd(1)}
            onCameraCapture={handleCameraOpen(1)}
            onRemove={onPhotoRemove ? () => onPhotoRemove(1) : undefined}
            disabled={disabled || !!photo1}
            className={slotWidth}
            dateCaption={dateCaption}
          />
        </div>

        {/* Photo 2 — overlaps right in scattered mode; sits in a row otherwise */}
        <div className="relative z-0" style={{ marginLeft: isRow ? 0 : '-12px', marginTop: isRow ? 0 : '8px' }}>
          <PhotoSlot
            photo={photo2}
            position={2}
            spread={1}
            onPhotoAdd={handlePhotoAdd(2)}
            onCameraCapture={handleCameraOpen(2)}
            onRemove={onPhotoRemove ? () => onPhotoRemove(2) : undefined}
            disabled={disabled || !!photo2}
            className={slotWidth}
            dateCaption={dateCaption}
          />
        </div>
      </motion.div>

      {/* Camera Modal */}
      <CameraModal
        isOpen={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />
    </>
  )
})

export default PhotoBlock
