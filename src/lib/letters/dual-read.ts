import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Phase 5 simplified read helpers.
 *
 * All letters now live natively in the `Letter` table. The JournalEntry
 * fallback paths introduced in Phase 2 (dual-read of JE + Letter) have been
 * removed. Every query goes directly to `Letter`.
 *
 * The `DualReadLetter` interface and function signatures are unchanged so that
 * the 8 consumer routes require no edits.
 *
 * IV aliasing: native self-letters store the content IV in
 * `contentIVs.content`. Legacy consumers call `e2eeIVs.text` to find the IV
 * for the `text` field (see draft-encryptor.ts). We expose the IV under BOTH
 * keys: `{...contentIVs, text: contentIVs.content}` so `e2eeIVs.text` and
 * `e2eeIVs.content` both resolve without touching the decrypt path.
 */

/**
 * Shape of the underlying data needed by every letter route. Routes pick
 * the subset they need.
 */
export interface DualReadLetter {
  // The id surfaced to the frontend.
  id: string

  // Distinguishes self-letters ('letter') from friend letters ('unsent_letter').
  entryType: 'normal' | 'letter' | 'unsent_letter' | 'ephemeral'

  // Content (E2EE ciphertext or server-encrypted)
  text: string
  encryptionType: string // "server" | "e2ee"
  e2eeIV: string | null
  e2eeIVs: Prisma.JsonValue | null

  // Plaintext metadata
  recipientEmail: string | null
  recipientName: string | null
  senderName: string | null
  letterLocation: string | null
  unlockDate: Date | null

  // State fields
  isSealed: boolean
  isDelivered: boolean
  deliveredAt: Date | null
  isViewed: boolean
  letterPeekedAt: Date | null
  isReceivedLetter: boolean
  isArchived: boolean
  originalSenderId: string | null
  originalEntryId: string | null

  // Delivery lifecycle fields
  firstReadAt: Date | null
  savedByRecipientAt: Date | null
  bouncedAt: Date | null
  bouncedReason: string | null

  // Timestamps
  createdAt: Date
  updatedAt: Date

  // Source tag — useful for telemetry / debugging.
  // CALLERS MUST NOT include this in serialised JSON responses.
  _source: 'letter+je' | 'je-only' | 'native-letter'
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const NATIVE_LETTER_SELECT = {
  id: true,
  userId: true,
  letterType: true,
  contentCiphertext: true,
  contentIVs: true,
  encryptionType: true,
  e2eeIV: true,
  e2eeIVs: true,
  recipientEmail: true,
  recipientName: true,
  senderName: true,
  letterLocation: true,
  scheduledFor: true,
  isSealed: true,
  isDelivered: true,
  deliveredAt: true,
  isViewed: true,
  letterPeekedAt: true,
  isReceivedLetter: true,
  isArchived: true,
  originalSenderId: true,
  originalLetterId: true,
  firstReadAt: true,
  savedByRecipientAt: true,
  bouncedAt: true,
  bouncedReason: true,
  createdAt: true,
  updatedAt: true,
} as const

type NativeLetterRow = Prisma.LetterGetPayload<{ select: typeof NATIVE_LETTER_SELECT }>

/**
 * Map a native Letter row into the DualReadLetter shape consumed by all read
 * routes.
 *
 * IV aliasing: native self-letters store the content IV in
 * `contentIVs.content`. The legacy decrypt path reads `e2eeIVs.text` to find
 * the IV for the `text` field. We expose the IV under BOTH keys so both
 * `e2eeIVs.text` and `e2eeIVs.content` resolve — no changes needed in the
 * decrypt path.
 */
function mapNativeLetter(letter: NativeLetterRow): DualReadLetter {
  const contentIVs = letter.contentIVs as Record<string, string> | null

  // Alias: expose the content IV under 'text' so legacy decryptEntry consumers
  // that call e2eeIVs.text keep working. Also keep e2eeIVs.content as-is.
  const e2eeIVsAliased: Record<string, string> | null = contentIVs
    ? { ...contentIVs, text: contentIVs.content }
    : null

  // Map letterType to the entryType shape consumers expect.
  // 'self' → 'letter', 'friend' → 'unsent_letter', 'received-friend' → 'letter'
  const entryType: DualReadLetter['entryType'] =
    letter.letterType === 'friend' ? 'unsent_letter' : 'letter'

  return {
    id: letter.id,
    entryType,
    text: letter.contentCiphertext ?? '',
    encryptionType: letter.encryptionType,
    e2eeIV: letter.e2eeIV,
    // Use letter.e2eeIVs if present, otherwise fall back to the aliased
    // contentIVs so both paths work.
    e2eeIVs: (letter.e2eeIVs ?? e2eeIVsAliased) as Prisma.JsonValue | null,
    recipientEmail: letter.recipientEmail,
    recipientName: letter.recipientName,
    senderName: letter.senderName,
    letterLocation: letter.letterLocation,
    unlockDate: letter.scheduledFor,
    isSealed: letter.isSealed,
    isDelivered: letter.isDelivered,
    deliveredAt: letter.deliveredAt,
    isViewed: letter.isViewed,
    letterPeekedAt: letter.letterPeekedAt,
    isReceivedLetter: letter.isReceivedLetter,
    isArchived: letter.isArchived,
    originalSenderId: letter.originalSenderId,
    originalEntryId: letter.originalLetterId,
    firstReadAt: letter.firstReadAt,
    savedByRecipientAt: letter.savedByRecipientAt,
    bouncedAt: letter.bouncedAt,
    bouncedReason: letter.bouncedReason,
    createdAt: letter.createdAt,
    updatedAt: letter.updatedAt,
    _source: 'native-letter',
  }
}

/**
 * Translate a JournalEntry-shaped where clause (as used by all consumer
 * routes) into a Letter where clause.
 *
 * Mapping rules:
 *   entryType = 'letter'                → letterType = 'self' OR 'received-friend'
 *   entryType = 'unsent_letter'         → letterType = 'friend'
 *   entryType = { in: [...] }           → letterType = { in: [...mapped...] }
 *   unlockDate                          → scheduledFor
 *   All other fields (isSealed, isDelivered, isViewed, isArchived,
 *     isReceivedLetter, recipientEmail, …) map 1:1.
 */
function translateWhereForNative(
  where: Prisma.JournalEntryWhereInput,
  userId: string,
): Prisma.LetterWhereInput {
  const w = where as Record<string, unknown>
  const out: Prisma.LetterWhereInput = { userId }

  for (const [key, val] of Object.entries(w)) {
    if (key === 'entryType') {
      // Translate entryType to letterType
      if (typeof val === 'string') {
        out.letterType = entryTypeToLetterType(val)
      } else if (val && typeof val === 'object' && 'in' in val) {
        const types = (val as { in: string[] }).in
        out.letterType = { in: types.flatMap(entryTypeToLetterTypes) }
      }
    } else if (key === 'unlockDate') {
      // Translate unlockDate to scheduledFor
      out.scheduledFor = val as Prisma.DateTimeNullableFilter
    } else if (key === 'OR') {
      // Recursively translate OR branches
      const branches = val as Record<string, unknown>[]
      out.OR = branches.map((branch) => translateWhereForNative(branch, userId))
      // Remove the userId from sub-clauses (already set at root)
      out.OR = out.OR.map(({ userId: _uid, ...rest }) => rest)
    } else {
      // All other fields map 1:1 (isSealed, isDelivered, isViewed,
      // isArchived, isReceivedLetter, recipientEmail, etc.)
      ;(out as Record<string, unknown>)[key] = val
    }
  }

  return out
}

/** Map a single JournalEntry entryType string to a Letter letterType string. */
function entryTypeToLetterType(entryType: string): string {
  if (entryType === 'unsent_letter') return 'friend'
  // 'letter' covers both self-letters and received-friend letters
  return 'self'
}

/**
 * Map a single entryType to the set of letterType values it covers.
 * Used when the caller passes `entryType: { in: ['letter', 'unsent_letter'] }`.
 */
function entryTypeToLetterTypes(entryType: string): string[] {
  if (entryType === 'unsent_letter') return ['friend']
  // 'letter' → 'self' and 'received-friend'
  return ['self', 'received-friend']
}

/**
 * Translate a JournalEntry-shaped orderBy into a Letter orderBy.
 * Mapping: unlockDate → scheduledFor; all other fields map 1:1.
 */
function translateOrderByForNative(
  orderBy: Prisma.JournalEntryOrderByWithRelationInput | undefined,
): Prisma.LetterOrderByWithRelationInput | undefined {
  if (!orderBy || typeof orderBy !== 'object' || Array.isArray(orderBy)) {
    return { createdAt: 'desc' }
  }
  const ob = orderBy as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(ob)) {
    if (key === 'unlockDate') {
      result.scheduledFor = val
    } else {
      result[key] = val
    }
  }
  return result as Prisma.LetterOrderByWithRelationInput
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a single letter for an owner. Used by mutation routes
 * (`/letters/[id]/peek`, `/viewed`, `/read`) and any single-letter read.
 *
 * Returns null if no such letter exists for this user.
 */
export async function findLetterForRead(args: {
  id: string
  userId: string
  requireSealed?: boolean
}): Promise<DualReadLetter | null> {
  const { id, userId, requireSealed } = args

  const letter = await prisma.letter.findFirst({
    where: {
      id,
      userId,
      ...(requireSealed ? { isSealed: true } : {}),
    },
    select: NATIVE_LETTER_SELECT,
  })

  return letter ? mapNativeLetter(letter) : null
}

/**
 * List letters for an owner. The `where` and `orderBy` arguments use
 * JournalEntry-shaped types for caller compatibility; they are translated to
 * Letter terms internally before querying.
 */
export async function listLettersForRead(args: {
  userId: string
  where: Prisma.JournalEntryWhereInput
  orderBy?: Prisma.JournalEntryOrderByWithRelationInput
}): Promise<DualReadLetter[]> {
  const letters = await prisma.letter.findMany({
    where: translateWhereForNative(args.where, args.userId),
    orderBy: translateOrderByForNative(args.orderBy),
    select: NATIVE_LETTER_SELECT,
  })
  return letters.map(mapNativeLetter)
}
