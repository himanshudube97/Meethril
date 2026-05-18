// src/lib/letters/asset-bundler.ts
//
// Phase 4.1: at friend-letter seal time, decrypt every photo/doodle on the
// draft under the sender's master key and re-encrypt under K (the ephemeral
// letter key). Photos return as upload-ready asset blobs; doodles return
// as inline plaintext-JSON ready to embed in the transient body.

import { decryptString, decryptBytes } from '@/lib/e2ee/crypto'
import { encryptWithLetterKey } from './answer-crypto'

export interface DraftPhoto {
  encryptedRef: string | null
  encryptedRefIV: string | null
  url: string | null
  position: number
  spread: number
  rotation: number
  ordinal: number
}

export interface DraftDoodle {
  // For E2EE drafts, the strokes column holds `{encryptedStrokes, e2eeIV}`.
  // For legacy plain drafts, strokes is the raw stroke array.
  strokes: unknown
  spread: number
  positionInEntry: number
}

export interface BundledPhotoAsset {
  ciphertext: string
  iv: string
  type: 'photo'
  position: number
  spread: number
  rotation: number
  ordinal: number
}

export interface BundledDoodle {
  strokes: unknown // plaintext stroke JSON, ready to JSON-serialize inline
  spread: number
  positionInEntry: number
}

export interface AssetBundle {
  photoAssets: BundledPhotoAsset[]
  inlineDoodles: BundledDoodle[]
}

/**
 * Fetch the encrypted bytes for a single E2EE photo, decrypt with the
 * master key, and return plaintext bytes ready for re-encryption.
 */
async function fetchAndDecryptPhoto(
  encryptedRef: string,
  encryptedRefIV: string,
  masterKey: CryptoKey,
): Promise<ArrayBuffer> {
  const refJson = await decryptString(encryptedRef, encryptedRefIV, masterKey)
  const { handle, iv } = JSON.parse(refJson) as { handle: string; iv: string }
  const res = await fetch(`/api/photos/${encodeURIComponent(handle)}`)
  if (!res.ok) throw new Error(`photo fetch ${res.status}: ${handle}`)
  const ct = await res.arrayBuffer()
  return decryptBytes(arrayBufferToBase64(ct), iv, masterKey)
}

// Inline base64 helper (the existing one in @/lib/e2ee/crypto is not exported
// here for boundary reasons — keep the surface tight).
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/**
 * Decrypt a doodle's strokes. Handles both E2EE-encrypted strokes
 * (`{encryptedStrokes, e2eeIV}` shape on the Doodle row) and legacy
 * plain-JSON strokes.
 */
async function decryptDoodleStrokes(strokes: unknown, masterKey: CryptoKey): Promise<unknown> {
  if (
    strokes &&
    typeof strokes === 'object' &&
    'encryptedStrokes' in strokes &&
    'e2eeIV' in strokes
  ) {
    const { encryptedStrokes, e2eeIV } = strokes as { encryptedStrokes: string; e2eeIV: string }
    const json = await decryptString(encryptedStrokes, e2eeIV, masterKey)
    return JSON.parse(json)
  }
  // Legacy plain strokes — return as-is.
  return strokes
}

/**
 * Bundle every photo and doodle on a friend-letter draft for delivery.
 *
 * For each photo: decrypt-with-master-key → re-encrypt-with-letterKey →
 * return the upload payload. The letterKey-encrypted blob will land in a
 * LetterDeliveryAsset row.
 *
 * For each doodle: decrypt-with-master-key → return plaintext strokes.
 * The recipient page reads them inline from the transient JSON.
 */
export async function bundleFriendLetterAssets(args: {
  photos: DraftPhoto[]
  doodles: DraftDoodle[]
  masterKey: CryptoKey
  letterKey: Uint8Array
}): Promise<AssetBundle> {
  const photoAssets: BundledPhotoAsset[] = []
  for (const p of args.photos) {
    let plaintextBytes: ArrayBuffer | null = null

    if (p.encryptedRef && p.encryptedRefIV) {
      plaintextBytes = await fetchAndDecryptPhoto(p.encryptedRef, p.encryptedRefIV, args.masterKey)
    } else if (p.url) {
      const res = await fetch(p.url)
      if (!res.ok) throw new Error(`photo url fetch ${res.status}: ${p.url}`)
      plaintextBytes = await res.arrayBuffer()
    } else {
      continue
    }

    const { ciphertext, iv } = await encryptWithLetterKey(plaintextBytes, args.letterKey)
    photoAssets.push({
      ciphertext,
      iv,
      type: 'photo',
      position: p.position,
      spread: p.spread,
      rotation: p.rotation,
      ordinal: p.ordinal,
    })
  }

  const inlineDoodles: BundledDoodle[] = []
  for (const d of args.doodles) {
    const strokes = await decryptDoodleStrokes(d.strokes, args.masterKey)
    inlineDoodles.push({
      strokes,
      spread: d.spread,
      positionInEntry: d.positionInEntry,
    })
  }

  return { photoAssets, inlineDoodles }
}
