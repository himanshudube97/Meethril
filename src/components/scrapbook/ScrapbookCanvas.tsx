'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useThemeStore } from '@/store/theme'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import ScrapbookDesktopOnly from './ScrapbookDesktopOnly'
import {
  ScrapbookItem,
  TextItemData,
  StickerItemData,
  PhotoItemData,
  SongItemData,
  DoodleItemData,
  ClipItemData,
  StampItemData,
  DateItemData,
  makeStickerItem,
  makeTextItem,
  makePhotoItem,
  makeSongItem,
  makeDoodleItem,
  makeClipItem,
  makeStampItem,
  makeDateItem,
  ClipVariant,
} from '@/lib/scrapbook'
import CanvasItemWrapper from './CanvasItemWrapper'
import CanvasToolbar from './CanvasToolbar'
import TextItem from './items/TextItem'
import StickerItem from './items/StickerItem'
import PhotoItem from './items/PhotoItem'
import SongItem from './items/SongItem'
import DoodleItem from './items/DoodleItem'
import CameraModal from './CameraModal'
import ClipItem from './items/ClipItem'
import StampItem from './items/StampItem'
import DateItem from './items/DateItem'
import PageSurface from './PageSurface'
import { useAutosaveScrapbook } from '@/hooks/useAutosaveScrapbook'
import { useE2EEStore } from '@/store/e2ee'
import { encryptBytes, encryptString } from '@/lib/e2ee/crypto'
import { deletePhotoBlob } from '@/lib/storage/delete-photo-blob'
import { useShareableCapture } from '@/components/share/ShareableCapture'

const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const PHOTO_MAX_WIDTH = 1600

/**
 * Resize+JPEG-compress a picked file to ArrayBuffer ready for upload.
 * Mirrors the journal `PhotoBlock` flow — bytes go to /api/photos, never
 * inline as a data URL anymore.
 */
async function compressPhoto(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = (e) => { img.src = e.target?.result as string }
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas context unavailable'))

      let width = img.width
      let height = img.height
      if (width > PHOTO_MAX_WIDTH) {
        height = Math.round((height * PHOTO_MAX_WIDTH) / width)
        width = PHOTO_MAX_WIDTH
      }
      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      const tryEncode = (q: number) =>
        new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), 'image/jpeg', q),
        )

      ;(async () => {
        let quality = 0.85
        let blob = await tryEncode(quality)
        while (blob && blob.size > PHOTO_MAX_BYTES && quality > 0.3) {
          quality -= 0.1
          blob = await tryEncode(quality)
        }
        if (!blob) return reject(new Error('Compression failed'))
        resolve(await blob.arrayBuffer())
      })()
    }
    img.onerror = () => reject(new Error('Image load failed'))
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

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

interface UploadedPhotoRef {
  src: string | null
  encryptedRef?: string
  encryptedRefIV?: string
}

/**
 * Send the bytes through /api/photos (Postgres blob in dev, Supabase Storage
 * in prod). Returns whichever pair of fields PhotoItemData expects:
 *   - E2EE on:  src=null, encryptedRef + encryptedRefIV (E2EE-encrypted
 *               JSON of {handle, iv}; ciphertext bytes uploaded).
 *   - E2EE off: src='/api/photos/{handle}'; plaintext bytes uploaded.
 */
async function uploadScrapbookPhoto(buffer: ArrayBuffer): Promise<UploadedPhotoRef> {
  const state = useE2EEStore.getState()
  const masterKey = state.masterKey
  const isE2EEReady = state.isEnabled && state.isUnlocked && masterKey !== null

  if (isE2EEReady && masterKey) {
    const { ciphertext, iv } = await encryptBytes(buffer, masterKey)
    const binary = atob(ciphertext)
    const cipher = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) cipher[i] = binary.charCodeAt(i)
    const handle = await postBytes(cipher)
    const refEncrypted = await encryptString(JSON.stringify({ handle, iv }), masterKey)
    return {
      src: null,
      encryptedRef: refEncrypted.ciphertext,
      encryptedRefIV: refEncrypted.iv,
    }
  }

  const handle = await postBytes(buffer)
  return { src: `/api/photos/${handle}` }
}

interface Props {
  boardId: string
  initialItems: ScrapbookItem[]
}

export default function ScrapbookCanvas({ boardId, initialItems }: Props) {
  const { theme } = useThemeStore()
  const layoutMode = useLayoutMode()
  const [items, setItems] = useState<ScrapbookItem[]>(initialItems)
  const { status: saveStatus, trigger: triggerSave, flush: flushSave } = useAutosaveScrapbook({ boardId })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [cameraTargetId, setCameraTargetId] = useState<string | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Capture the live canvas DOM directly. Off-screen synthesis was fragile
  // because CanvasItemWrapper relies on the live canvasRef and other
  // contexts that don't reproduce cleanly in a hidden tree. The polaroid
  // caption shows today's date.
  const polaroidCaption = `${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · hearth`
  const { CameraButton: ShareCameraButton, Capture: ShareCapture } = useShareableCapture({
    captureTarget: () => canvasRef.current,
    surface: 'scrapbook',
    date: new Date(),
    polaroidCaption,
  })

  // Pressing Esc exits edit mode (still selected) — feels expected from
  // any text editor, and avoids users feeling trapped in a note.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && editingId) {
        setEditingId(null)
        // also blur whatever element has focus
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId])

  // Skip until items diverges from the server-provided initialItems. A bare
  // "skip first run" ref doesn't survive StrictMode's effect-replay in dev
  // (the second pass flips the flag and fires a phantom PUT). Comparing by
  // reference is robust: setItems with a new array (real edit) breaks
  // equality, while StrictMode's idle replays keep `items === initialItems`.
  const initialItemsRef = useRef(initialItems)
  useEffect(() => {
    if (items === initialItemsRef.current) return
    triggerSave(items)
  }, [items, triggerSave])

  useEffect(() => {
    const onBeforeUnload = () => { flushSave() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushSave])

  function updateItem(updated: ScrapbookItem) {
    setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
  }

  function deleteItem(id: string) {
    setItems((prev) => {
      // If we're deleting a photo item, free the underlying storage object
      // (handle URL or E2EE encryptedRef). Fire-and-forget; UI removal must
      // not block on the network round-trip.
      const removed = prev.find((it) => it.id === id)
      if (removed && removed.type === 'photo') {
        const masterKey = useE2EEStore.getState().masterKey
        void deletePhotoBlob(
          {
            url: removed.src,
            encryptedRef: removed.encryptedRef,
            encryptedRefIV: removed.encryptedRefIV,
          },
          masterKey,
        )
      }
      return prev.filter((it) => it.id !== id)
    })
    if (selectedId === id) setSelectedId(null)
    if (editingId === id) setEditingId(null)
    if (cameraTargetId === id) setCameraTargetId(null)
  }

  function selectItem(id: string) {
    setSelectedId(id)
  }

  function requestEdit(id: string) {
    setEditingId(id)
  }

  function deselectAll() {
    setSelectedId(null)
    setEditingId(null)
  }

  function addText() {
    const item = makeTextItem('a small good thing', items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
    setEditingId(item.id)
  }

  function addSticker(stickerId: string) {
    const item = makeStickerItem(stickerId, items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
  }

  function addPhoto() {
    // Drop a placeholder polaroid; user fills it via the on-canvas
    // "click" / "upload" buttons.
    const item = makePhotoItem(null, items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
  }

  function fillPhoto(id: string, ref: UploadedPhotoRef) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id && it.type === 'photo'
          ? {
              ...it,
              src: ref.src,
              encryptedRef: ref.encryptedRef,
              encryptedRefIV: ref.encryptedRefIV,
            }
          : it,
      ),
    )
  }

  function requestCameraFor(id: string) {
    setCameraTargetId(id)
  }

  function requestUploadFor(id: string) {
    setUploadTargetId(id)
    fileInputRef.current?.click()
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const targetId = uploadTargetId
    e.target.value = ''
    if (!file || !targetId) return
    try {
      const buffer = await compressPhoto(file)
      const ref = await uploadScrapbookPhoto(buffer)
      fillPhoto(targetId, ref)
    } catch (err) {
      console.error('Failed to upload photo:', err)
    }
    setUploadTargetId(null)
  }

  async function onCameraCapture(dataUrl: string) {
    const targetId = cameraTargetId
    setCameraTargetId(null)
    if (!targetId) return
    try {
      const buffer = dataUrlToArrayBuffer(dataUrl)
      const ref = await uploadScrapbookPhoto(buffer)
      fillPhoto(targetId, ref)
    } catch (err) {
      console.error('Failed to upload camera photo:', err)
    }
  }

  function addSong(url: string) {
    const item = makeSongItem(url, items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
    setEditingId(item.id)
  }

  function addDoodle() {
    const item = makeDoodleItem(items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
    // Drop straight into edit mode so the user can start drawing immediately —
    // toolbar appears below and pointer events draw on the doodle surface.
    setEditingId(item.id)
  }

  function addClip(variant: ClipVariant) {
    const defaults: Record<ClipVariant, string[]> = {
      'index-card': ['a small note'],
      'ticket-stub': ['L TRAIN · 04·28·26', 'Bedford → 1st'],
      'receipt': ['café', '$ 4.50'],
    }
    const item = makeClipItem(variant, defaults[variant], items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
    setEditingId(item.id)
  }

  function addStamp() {
    const { themeName } = useThemeStore.getState()
    const today = new Date()
    const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
    const item = makeStampItem(`apr · ${today.getDate()}`, themeName, dateStr, items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
    setEditingId(item.id)
  }

  function addDate() {
    const item = makeDateItem(new Date(), items)
    setItems((prev) => [...prev, item])
    setSelectedId(item.id)
  }

  function resetBoard() {
    setItems([])
    setSelectedId(null)
    setEditingId(null)
  }

  const tapeLeft = withAlpha(theme.accent.warm, 0.78)
  const tapeRight = withAlpha(theme.accent.secondary, 0.78)

  // Scrapbook canvas is desktop-only — free-form drag + multi-select don't
  // translate to small screens. Gate AFTER all hooks above to keep the hook
  // order stable across renders.
  if (layoutMode === 'mobile') return <ScrapbookDesktopOnly />

  return (
    <div className="w-full flex flex-col items-center">
      {/* This page sits inside LayoutContent's <main> which already supplies
          the global theme background (via <Background />), pt-20 padding,
          and min-h-screen. We must NOT add another full-viewport background
          layer here or the page will look "doubled up" and scroll past
          the viewport. */}

      <div
        style={{
          fontSize: 12,
          color: 'rgba(58, 52, 41, 0.55)',
          fontFamily: 'var(--font-caveat), cursive',
          marginBottom: 8,
          minHeight: 16,
        }}
      >
        {saveStatus === 'saving' && 'saving…'}
        {saveStatus === 'saved' && 'saved'}
        {saveStatus === 'error' && 'save error — retrying'}
      </div>

      <div className="w-full flex justify-center items-start gap-5">
        <div className="flex-shrink-0" style={{ position: 'sticky', top: 96, zIndex: 1000 }}>
          <CanvasToolbar
            onAddText={addText}
            onAddSticker={addSticker}
            onAddPhoto={addPhoto}
            onAddSong={addSong}
            onAddDoodle={addDoodle}
            onAddClip={addClip}
            onAddStamp={addStamp}
            onAddDate={addDate}
            onReset={resetBoard}
          />
        </div>

        <div
          ref={canvasRef}
          onClick={deselectAll}
          className="relative"
          style={{
            width: 'min(1102px, calc((100vh - 220px) * 1.45))',
            height: 'min(760px, calc(100vh - 220px))',
            cursor: selectedId ? 'default' : 'auto',
          }}
        >
          <PageSurface>
          <div
            className="absolute pointer-events-none"
            style={{
              inset: 18,
              border: `1.5px dashed ${withAlpha(theme.accent.warm, 0.32)}`,
              borderRadius: 2,
            }}
          />

          <CornerTape position="tl" color={tapeLeft} />
          <CornerTape position="tr" color={tapeRight} />

          {items.length === 0 && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
              style={{
                color: 'rgba(58, 52, 41, 0.45)',
                fontFamily: 'var(--font-caveat), cursive',
                fontSize: 22,
                gap: 6,
                textAlign: 'center',
                padding: 40,
              }}
            >
              <div style={{ fontSize: 28 }}>your blank page</div>
              <div style={{ fontSize: 18, opacity: 0.7 }}>
                add anything — drag, tilt, overlap.
                <br />
                nothing has to be tidy.
              </div>
            </div>
          )}

          {items.map((item) => {
            const isItemSelected = selectedId === item.id
            const isItemEditing = editingId === item.id
            return (
              <CanvasItemWrapper
                key={item.id}
                item={item}
                allItems={items}
                canvasRef={canvasRef}
                selected={isItemSelected}
                isEditing={isItemEditing}
                onSelect={() => selectItem(item.id)}
                onRequestEdit={() => requestEdit(item.id)}
                onUpdate={updateItem}
                onDelete={() => deleteItem(item.id)}
              >
                {item.type === 'text' && (
                  <TextItem
                    item={item as TextItemData}
                    selected={isItemSelected}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                  />
                )}
                {item.type === 'sticker' && <StickerItem item={item as StickerItemData} />}
                {item.type === 'photo' && (
                  <PhotoItem
                    item={item as PhotoItemData}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                    onRequestCamera={() => requestCameraFor(item.id)}
                    onRequestUpload={() => requestUploadFor(item.id)}
                  />
                )}
                {item.type === 'song' && (
                  <SongItem
                    item={item as SongItemData}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                  />
                )}
                {item.type === 'doodle' && (
                  <DoodleItem
                    item={item as DoodleItemData}
                    selected={isItemSelected}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                  />
                )}
                {item.type === 'clip' && (
                  <ClipItem
                    item={item as ClipItemData}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                  />
                )}
                {item.type === 'stamp' && (
                  <StampItem
                    item={item as StampItemData}
                    isEditing={isItemEditing}
                    onChange={updateItem}
                  />
                )}
                {item.type === 'date' && (
                  <DateItem item={item as DateItemData} />
                )}
              </CanvasItemWrapper>
            )
          })}
          </PageSurface>
        </div>
      </div>

      {cameraTargetId && (
        <CameraModal
          onCapture={onCameraCapture}
          onClose={() => setCameraTargetId(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFilePicked}
        style={{ display: 'none' }}
      />

      {/* Share camera — top-right of the screen, between fullscreen and gear.
          Outside canvasRef so it isn't itself part of the capture. */}
      <div
        className="fixed top-6 right-20 z-50 w-12 h-12 rounded-full flex items-center justify-center pointer-events-auto"
        style={{
          background: theme.glass.bg,
          backdropFilter: `blur(${theme.glass.blur})`,
          WebkitBackdropFilter: `blur(${theme.glass.blur})`,
          border: `1px solid ${theme.glass.border}`,
        }}
      >
        {ShareCameraButton}
      </div>

      {ShareCapture}
    </div>
  )
}

function CornerTape({ position, color }: { position: 'tl' | 'tr'; color: string }) {
  const isLeft = position === 'tl'
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top: -8,
        left: isLeft ? 28 : 'auto',
        right: isLeft ? 'auto' : 28,
        width: 78,
        height: 22,
        background: color,
        opacity: 0.78,
        transform: `rotate(${isLeft ? -8 : 8}deg)`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }}
    />
  )
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  if (hex.startsWith('#')) {
    const h = hex.slice(1)
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    if (![r, g, b].some(isNaN)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
  }
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\)$/, `${alpha})`)
  if (color.startsWith('rgb')) return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`)
  return color
}
