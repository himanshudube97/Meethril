// src/lib/letters/self-letter-client.ts
//
// Browser-side helper that turns a composed self-letter into the upload
// payload for POST /api/letters/self. Pure function — no fetch, no DOM.

import { encryptString, decryptString } from '@/lib/e2ee/crypto'

export interface SelfLetterDraft {
  text: string
  song?: string | null
  photos?: Array<{ encryptedRef: string; encryptedRefIV: string; position: number; spread: number; rotation: number }>
  doodles?: Array<{ encryptedStrokes: string; e2eeIV: string; spread: number; positionInEntry: number }>
  letterLocation?: string | null
}

export interface SelfLetterUploadPayload {
  contentCiphertext: string
  contentIVs: { content: string }
  scheduledFor: string // ISO
  letterLocation?: string | null
}

export async function buildSelfLetterPayload(args: {
  draft: SelfLetterDraft
  unlockDate: Date
  masterKey: CryptoKey
}): Promise<SelfLetterUploadPayload> {
  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    photos: args.draft.photos ?? [],
    doodles: args.draft.doodles ?? [],
  })
  const { ciphertext, iv } = await encryptString(json, args.masterKey)
  return {
    contentCiphertext: ciphertext,
    contentIVs: { content: iv },
    scheduledFor: args.unlockDate.toISOString(),
    letterLocation: args.draft.letterLocation ?? null,
  }
}

export async function decryptSelfLetterContent(args: {
  contentCiphertext: string
  contentIVs: { content: string }
  masterKey: CryptoKey
}): Promise<SelfLetterDraft> {
  const json = await decryptString(args.contentCiphertext, args.contentIVs.content, args.masterKey)
  try {
    return JSON.parse(json) as SelfLetterDraft
  } catch {
    // Decryption succeeded but the plaintext is not the expected JSON wrapper
    // — most likely a letter sealed under an earlier payload format. Surface
    // a domain error so the reveal modal can show "couldn't read this letter"
    // instead of crashing the surrounding view.
    throw new Error('self letter payload looks malformed')
  }
}
