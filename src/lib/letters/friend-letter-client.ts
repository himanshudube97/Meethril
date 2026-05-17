// src/lib/letters/friend-letter-client.ts
//
// Browser-side helper for friend-letter writes:
//   1. Generate a random 32-byte ephemeral key K.
//   2. Decrypt every photo/doodle on the draft (master key), re-encrypt
//      photos under K, decrypt doodles inline.
//   3. AES-encrypt the serialized letter body (text + song + inline
//      doodles) with K.
//   4. tlock-encrypt K against the drand round for unlockDate.
// Returns the upload payload for POST /api/letters/friend. The server
// never sees plaintext or K — only transientCiphertext, transientIV,
// tlockedKey, and the K-encrypted photoAssets.

import { encryptTransient } from './transient-crypto'
import { tlockEncryptKey } from './tlock'
import {
  bundleFriendLetterAssets,
  type DraftPhoto,
  type DraftDoodle,
  type BundledPhotoAsset,
} from './asset-bundler'

export interface FriendLetterDraft {
  text: string
  song?: string | null
  photos?: DraftPhoto[]
  doodles?: DraftDoodle[]
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
  photoAssets: BundledPhotoAsset[]
}

export async function buildFriendLetterPayload(args: {
  draft: FriendLetterDraft
  unlockDate: Date
  recipientEmail: string
  recipientName: string
  senderName: string
  letterLocation?: string | null
  masterKey: CryptoKey
}): Promise<FriendLetterUploadPayload> {
  // Generate K first so we can use it for asset re-encryption too.
  const K = crypto.getRandomValues(new Uint8Array(32))

  // Decrypt photos under master key, re-encrypt under K; decrypt doodles.
  const { photoAssets, inlineDoodles } = await bundleFriendLetterAssets({
    photos: args.draft.photos ?? [],
    doodles: args.draft.doodles ?? [],
    masterKey: args.masterKey,
    K,
  })

  // The transient body carries text, song, and doodles (inline). Photos
  // ride out-of-band as LetterDeliveryAsset rows, referenced by position
  // metadata that the recipient page joins via the meta endpoint.
  const json = JSON.stringify({
    text: args.draft.text,
    song: args.draft.song ?? null,
    doodles: inlineDoodles,
  })

  const plaintext = new TextEncoder().encode(json)
  const { ciphertext: transientCiphertext, iv: transientIV } = await encryptTransient(plaintext, K)
  const tlockedKey = await tlockEncryptKey(K, args.unlockDate)
  K.fill(0)

  return {
    transientCiphertext,
    transientIV,
    tlockedKey,
    recipientEmail: args.recipientEmail,
    recipientName: args.recipientName,
    senderName: args.senderName,
    scheduledFor: args.unlockDate.toISOString(),
    letterLocation: args.letterLocation ?? null,
    photoAssets,
  }
}
