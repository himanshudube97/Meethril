// src/lib/letters/draft-decrypt.ts
//
// Browser-side helper that turns a wire-shape Letter draft row into the
// plaintext fields the compose UI consumes. The wire shape is whatever
// GET /api/letters/drafts/[id] returns — encrypted body in
// contentCiphertext+contentIVs.content, encrypted song in
// draftSong+draftSongIV, encrypted doodle strokes nested inside draftDoodles,
// plaintext photo refs in draftPhotos, plaintext style in draftStyle.
//
// Photos remain wire-shape (encryptedRef/encryptedRefIV are decrypted lazily
// by PhotoBlock / usePhotoSrc when they're actually rendered).

import { decryptString } from '@/lib/e2ee/crypto'

export interface LetterDraftWire {
  id: string
  letterType: 'self' | 'friend'
  contentCiphertext: string | null
  contentIVs: { content?: string } | null
  recipientEmail: string | null
  recipientName: string | null
  letterLocation: string | null
  draftSong: string | null
  draftSongIV: string | null
  draftPhotos: unknown
  draftDoodles: unknown
  draftStyle: unknown
  createdAt: string
  updatedAt: string
}

export interface LetterDraftDecrypted {
  id: string
  letterType: 'self' | 'friend'
  text: string
  song: string | null
  recipientEmail: string | null
  recipientName: string | null
  letterLocation: string | null
  // Photo refs are kept in wire shape — usePhotoSrc decrypts the blob bytes
  // when the photo is mounted, so we don't unwrap encryptedRef here.
  photos: Array<{
    url: string | null
    encryptedRef: string | null
    encryptedRefIV: string | null
    position: number
    rotation: number
    spread: number
  }>
  // Doodle strokes come back as parsed plaintext arrays. spread/positionInEntry
  // ride along plaintext.
  doodles: Array<{
    strokes: unknown
    spread: number
    positionInEntry: number
  }>
  style: Record<string, unknown> | null
}

interface EncryptedDoodleStrokes {
  encryptedStrokes: string
  e2eeIV: string
}

interface RawDoodle {
  strokes: EncryptedDoodleStrokes | unknown
  spread?: number
  positionInEntry?: number
}

interface RawPhoto {
  url?: string | null
  encryptedRef?: string | null
  encryptedRefIV?: string | null
  position: number
  rotation: number
  spread: number
}

export async function decryptLetterDraft(
  wire: LetterDraftWire,
  masterKey: CryptoKey,
): Promise<LetterDraftDecrypted> {
  // Body. contentCiphertext is null for very-first autosave races (empty
  // draft, no text yet). Return empty string so the compose UI can hydrate
  // its editors cleanly.
  let text = ''
  if (wire.contentCiphertext && wire.contentIVs?.content) {
    try {
      text = await decryptString(wire.contentCiphertext, wire.contentIVs.content, masterKey)
    } catch (err) {
      console.warn('letter-draft decrypt: text failed', err)
    }
  }

  // Song.
  let song: string | null = null
  if (wire.draftSong && wire.draftSongIV) {
    try {
      song = await decryptString(wire.draftSong, wire.draftSongIV, masterKey)
    } catch (err) {
      console.warn('letter-draft decrypt: song failed', err)
    }
  }

  // Doodles. The wire shape for each item is
  // `{ strokes: { encryptedStrokes, e2eeIV }, spread, positionInEntry }`
  // (matches the journal-entry Doodle column shape after encryptDraft).
  const doodlesRaw = Array.isArray(wire.draftDoodles) ? (wire.draftDoodles as RawDoodle[]) : []
  const doodles: LetterDraftDecrypted['doodles'] = []
  for (const d of doodlesRaw) {
    const cipher = d.strokes as EncryptedDoodleStrokes | null
    if (cipher && cipher.encryptedStrokes && cipher.e2eeIV) {
      try {
        const json = await decryptString(cipher.encryptedStrokes, cipher.e2eeIV, masterKey)
        doodles.push({
          strokes: JSON.parse(json),
          spread: d.spread ?? 1,
          positionInEntry: d.positionInEntry ?? 0,
        })
      } catch (err) {
        console.warn('letter-draft decrypt: doodle failed', err)
      }
    }
  }

  const photosRaw = Array.isArray(wire.draftPhotos) ? (wire.draftPhotos as RawPhoto[]) : []
  const photos = photosRaw.map((p) => ({
    url: p.url ?? null,
    encryptedRef: p.encryptedRef ?? null,
    encryptedRefIV: p.encryptedRefIV ?? null,
    position: p.position,
    rotation: p.rotation,
    spread: p.spread,
  }))

  const style =
    wire.draftStyle && typeof wire.draftStyle === 'object' && !Array.isArray(wire.draftStyle)
      ? (wire.draftStyle as Record<string, unknown>)
      : null

  return {
    id: wire.id,
    letterType: wire.letterType,
    text,
    song,
    recipientEmail: wire.recipientEmail,
    recipientName: wire.recipientName,
    letterLocation: wire.letterLocation,
    photos,
    doodles,
    style,
  }
}
