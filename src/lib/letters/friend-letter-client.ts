// src/lib/letters/friend-letter-client.ts
//
// Browser-side helper for friend-letter writes:
//   1. Generate a random 32-byte ephemeral key K.
//   2. AES-encrypt the serialized letter content with K.
//   3. tlock-encrypt K against the drand round for unlockDate.
// Returns the upload payload for POST /api/letters/friend. The server
// never sees plaintext or K — only transientCiphertext, transientIV,
// and tlockedKey.

import { encryptTransient } from './transient-crypto'
import { tlockEncryptKey } from './tlock'

export interface FriendLetterDraft {
  text: string
  song?: string | null
  photos?: Array<{ url: string; position: number; spread: number; rotation: number }>
  doodles?: Array<{ strokes: unknown; spread: number; positionInEntry: number }>
}

export interface FriendLetterUploadPayload {
  transientCiphertext: string
  transientIV: string
  tlockedKey: string
  recipientEmail: string
  recipientName: string
  senderName: string
  scheduledFor: string
  letterLocation?: string | null
}

export async function buildFriendLetterPayload(args: {
  draft: FriendLetterDraft
  unlockDate: Date
  recipientEmail: string
  recipientName: string
  senderName: string
  letterLocation?: string | null
}): Promise<FriendLetterUploadPayload> {
  // Friend letters don't carry encrypted photo refs — photos are inlined
  // as URLs in the email render, and the in-browser read uses the same
  // URLs (already public via /api/photos). For E2EE photos, we'd need a
  // recipient-side photo-handle exchange — out of scope for v1 of friend
  // letters. Strip photos that aren't directly fetchable.
  const renderablePhotos = (args.draft.photos ?? []).filter((p) => !!p.url)

  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    photos: renderablePhotos,
    doodles: args.draft.doodles ?? [],
  })

  const plaintext = new TextEncoder().encode(json)
  const K = crypto.getRandomValues(new Uint8Array(32))
  const { ciphertext, iv } = await encryptTransient(plaintext, K)
  const tlockedKey = await tlockEncryptKey(K, args.unlockDate)
  // Best-effort: zero K from memory (JS can't guarantee this, but we try).
  K.fill(0)

  return {
    transientCiphertext: ciphertext,
    transientIV: iv,
    tlockedKey,
    recipientEmail: args.recipientEmail,
    recipientName: args.recipientName,
    senderName: args.senderName,
    scheduledFor: args.unlockDate.toISOString(),
    letterLocation: args.letterLocation ?? null,
  }
}
