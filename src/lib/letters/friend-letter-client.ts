// src/lib/letters/friend-letter-client.ts
//
// Browser-side helper for friend-letter writes:
//   1. Generate per-letter salt.
//   2. Derive letterKey = Argon2id(normalize(answer), salt).
//   3. Decrypt every photo/doodle on the draft (master key); re-encrypt
//      photos under letterKey; decrypt doodles inline.
//   4. AES-256-GCM-encrypt the serialized letter body (text + song +
//      inline doodles) under letterKey.
// Returns the upload payload for POST /api/letters/friend. The server
// only sees ciphertext + salt + question + scheduledFor + recipient
// email — never the answer or the derived key.

import {
  generateSalt,
  deriveLetterKey,
  encryptWithLetterKey,
} from './answer-crypto'
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
  salt: string
  question: string
  recipientEmail: string
  recipientName: string
  scheduledFor: string
  letterLocation?: string | null
  photoAssets: BundledPhotoAsset[]
}

export async function buildFriendLetterPayload(args: {
  draft: FriendLetterDraft
  unlockDate: Date
  recipientEmail: string
  recipientName: string
  letterLocation?: string | null
  masterKey: CryptoKey
  question: string
  answer: string
}): Promise<FriendLetterUploadPayload> {
  const salt = generateSalt()
  const letterKey = await deriveLetterKey(args.answer, salt)

  try {
    const { photoAssets, inlineDoodles } = await bundleFriendLetterAssets({
      photos: args.draft.photos ?? [],
      doodles: args.draft.doodles ?? [],
      masterKey: args.masterKey,
      letterKey,
    })

    const json = JSON.stringify({
      text: args.draft.text,
      song: args.draft.song ?? null,
      doodles: inlineDoodles,
    })

    const plaintext = new TextEncoder().encode(json)
    const { ciphertext: transientCiphertext, iv: transientIV } =
      await encryptWithLetterKey(plaintext, letterKey)

    return {
      transientCiphertext,
      transientIV,
      salt,
      question: args.question,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      scheduledFor: args.unlockDate.toISOString(),
      letterLocation: args.letterLocation ?? null,
      photoAssets,
    }
  } finally {
    letterKey.fill(0)
  }
}
