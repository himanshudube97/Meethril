/**
 * Pure encryption/decryption of journal entry drafts.
 *
 * Every field listed in EncryptableDraft is encrypted under the master key.
 * Fields not present (undefined/null) are skipped — their IV slot is omitted
 * from the e2eeIVs map.
 *
 * To add a new encrypted field:
 *   1. Add the field to EncryptableDraft
 *   2. Add an encrypt branch in encryptDraft
 *   3. Add a decrypt branch in decryptEntry
 *   4. (No server-side change needed — server stores ciphertext as-is)
 */
import { encryptString, decryptString } from './crypto'

export interface EncryptableDraft {
  text?: string
  textPreview?: string | null
  tags?: string[] | null
  song?: string | null
  doodles?: Array<{ strokes: unknown; spread?: number; positionInEntry?: number }>
  // photos and scrapbook items handled via separate flows (see PhotoSlot, scrapbook hooks)
}

export interface EncryptedDraft {
  encryptionType: 'e2ee'
  text?: string
  textPreview?: string
  tags?: string
  song?: string
  doodles?: Array<{
    // Stored under `strokes` so the server's `Doodle.strokes Json` column
    // accepts the payload as-is. The decryptor reads back from this nested
    // shape; the server never inspects its contents.
    strokes: { encryptedStrokes: string; e2eeIV: string }
    spread?: number
    positionInEntry?: number
  }>
  e2eeIVs: Record<string, string>
}

const STRING_FIELDS = [
  'text',
  'textPreview',
  'song',
] as const

const JSON_FIELDS = ['tags'] as const

export async function encryptDraft(
  draft: EncryptableDraft,
  masterKey: CryptoKey
): Promise<EncryptedDraft> {
  const out: EncryptedDraft = {
    encryptionType: 'e2ee',
    e2eeIVs: {},
  }

  for (const field of STRING_FIELDS) {
    const value = draft[field]
    if (value === undefined || value === null) continue
    const { ciphertext, iv } = await encryptString(value, masterKey)
    out[field] = ciphertext
    out.e2eeIVs[field] = iv
  }

  for (const field of JSON_FIELDS) {
    const value = draft[field]
    if (value === undefined || value === null) continue
    const { ciphertext, iv } = await encryptString(JSON.stringify(value), masterKey)
    out[field] = ciphertext
    out.e2eeIVs[field] = iv
  }

  if (draft.doodles && draft.doodles.length > 0) {
    out.doodles = []
    for (const d of draft.doodles) {
      const { ciphertext, iv } = await encryptString(JSON.stringify(d.strokes), masterKey)
      // Nest under `strokes` so the server can store the payload directly in
      // the existing `Doodle.strokes Json` column without needing to know
      // about E2EE. Decryptor mirrors this shape.
      out.doodles.push({
        strokes: { encryptedStrokes: ciphertext, e2eeIV: iv },
        spread: d.spread,
        positionInEntry: d.positionInEntry,
      })
    }
  }

  return out
}

export async function decryptEntry(
  encrypted: EncryptedDraft,
  masterKey: CryptoKey
): Promise<EncryptableDraft> {
  const out: EncryptableDraft = {}

  // Per-field tolerance: if one field's IV/ciphertext is corrupt or its IV
  // map entry was orphaned by an older save bug, we don't want to fail the
  // whole entry — the user would see a `[Decryption failed]` placeholder
  // for fields that actually decrypt fine. Throw only if `text` itself
  // fails, since without it the entry's main content is unrecoverable and
  // the caller should render the placeholder.
  let textFailure: unknown = null

  // e2eeIVs is null for rows with no encrypted content (friend-letter sender
  // receipts: contentCiphertext is null by design, so the dual-read mapper
  // synthesizes e2eeIVs as null). Guard before iterating so we don't crash
  // on `null[field]`. Loops below short-circuit cleanly when ivs is empty.
  const ivs = encrypted.e2eeIVs ?? {}

  for (const field of STRING_FIELDS) {
    const ct = encrypted[field]
    const iv = ivs[field]
    if (!ct || !iv) continue
    try {
      out[field] = await decryptString(ct, iv, masterKey)
    } catch (err) {
      console.warn(`E2EE: ${field} decryption failed`, err)
      if (field === 'text') textFailure = err
      // Other fields: silently drop from the decrypted output. Caller will
      // fall back to the original (still-ciphertext) value if it reads them.
    }
  }

  for (const field of JSON_FIELDS) {
    const ct = encrypted[field]
    const iv = ivs[field]
    if (!ct || !iv) continue
    try {
      const json = await decryptString(ct, iv, masterKey)
      ;(out as Record<string, unknown>)[field] = JSON.parse(json)
    } catch (err) {
      console.warn(`E2EE: ${field} decryption failed`, err)
    }
  }

  if (encrypted.doodles && encrypted.doodles.length > 0) {
    out.doodles = []
    for (const d of encrypted.doodles) {
      // Doodle ciphertext is nested under `strokes` (matches the server
      // schema's existing `Doodle.strokes Json` column).
      const cipher = (d as { strokes: { encryptedStrokes?: string; e2eeIV?: string } }).strokes
      if (!cipher?.encryptedStrokes || !cipher?.e2eeIV) continue
      try {
        const json = await decryptString(cipher.encryptedStrokes, cipher.e2eeIV, masterKey)
        out.doodles.push({
          strokes: JSON.parse(json),
          spread: d.spread,
          positionInEntry: d.positionInEntry,
        })
      } catch (err) {
        console.warn('E2EE: doodle decryption failed', err)
      }
    }
  }

  if (textFailure) {
    // Surface the original error so the catch in useE2EE.decryptEntryFromServer
    // produces the `[Decryption failed]` placeholder for the entry.
    throw textFailure
  }

  return out
}
