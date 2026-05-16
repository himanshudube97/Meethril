import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Phase 2 dual-read helpers.
 *
 * In Phase 2, content/identity comes from the `letters` table (populated by
 * the one-shot backfill) and state that mutates after backfill — isViewed,
 * isDelivered, deliveredAt, letterPeekedAt — comes from the source
 * `journal_entries` row. If the Letter row is missing (race between create
 * and backfill, or a brand-new letter created after backfill), we fall back
 * to reading entirely from `journal_entries`.
 *
 * Phase 4 native self-letters live entirely in the `letters` table with
 * `sourceJournalEntryId = NULL` and no corresponding `JournalEntry`. Both
 * `listLettersForRead` and `findLetterForRead` now UNION these rows in, mapped
 * into the same `DualReadLetter` shape. The `_source` tag is set to
 * `'native-letter'` for these rows.
 *
 * IV aliasing: native self-letters store the content IV in
 * `contentIVs.content`. Legacy consumers call `e2eeIVs.text` to find the IV
 * for the `text` field (see draft-encryptor.ts). We expose the IV under BOTH
 * keys: `{...contentIVs, text: contentIVs.content}` so `e2eeIVs.text` and
 * `e2eeIVs.content` both resolve without touching the decrypt path.
 *
 * Phase 3 will switch state-of-record to Letter; this helper can then be
 * simplified or removed.
 */

/**
 * Shape of the underlying data needed by every letter route. Routes pick
 * the subset they need.
 */
export interface DualReadLetter {
  // The id surfaced to the frontend. In Phase 2 this is always the
  // JournalEntry.id so existing mutation routes (peek/viewed/read) keep
  // working unchanged.
  id: string

  // Distinguishes self-letters ('letter') from friend letters ('unsent_letter').
  // Always sourced from JournalEntry.
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

  // Fresh state (sourced from JournalEntry)
  isSealed: boolean
  isDelivered: boolean
  deliveredAt: Date | null
  isViewed: boolean
  letterPeekedAt: Date | null
  isReceivedLetter: boolean
  isArchived: boolean
  originalSenderId: string | null
  originalEntryId: string | null

  // Phase 4+ delivery lifecycle fields (sourced from Letter row; null when no Letter row exists)
  firstReadAt: Date | null
  savedByRecipientAt: Date | null
  bouncedAt: Date | null
  bouncedReason: string | null

  // Timestamps
  createdAt: Date
  updatedAt: Date

  // Source tag — useful for telemetry / debugging the dual-read split.
  // CALLERS MUST NOT include this in serialised JSON responses (route fixtures expect it absent).
  _source: 'letter+je' | 'je-only' | 'native-letter'
}

/**
 * Selects used by findLetterForRead and listLettersForRead for native Letter rows.
 */
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
 * Map a Phase 4 native Letter row (sourceJournalEntryId = NULL) into the
 * DualReadLetter shape consumed by all read routes.
 *
 * IV aliasing: native self-letters store the content IV in
 * `contentIVs.content`. The legacy decrypt path (draft-encryptor.decryptEntry)
 * reads `e2eeIVs.text` to find the IV for the `text` field. We expose the IV
 * under BOTH keys so both `e2eeIVs.text` and `e2eeIVs.content` resolve —
 * no changes needed in the decrypt path.
 */
function mapNativeLetter(letter: NativeLetterRow): DualReadLetter {
  const contentIVs = letter.contentIVs as Record<string, string> | null

  // Alias: expose the content IV under 'text' so legacy decryptEntry consumers
  // that call e2eeIVs.text keep working. Also keep e2eeIVs.content as-is.
  const e2eeIVsAliased: Record<string, string> | null = contentIVs
    ? { ...contentIVs, text: contentIVs.content }
    : null

  return {
    id: letter.id,
    entryType: 'letter', // native self-letters always behave as 'letter'
    text: letter.contentCiphertext ?? '',
    encryptionType: letter.encryptionType,
    e2eeIV: letter.e2eeIV,
    // Use letter.e2eeIVs if present (populated by backfill), otherwise fall
    // back to the aliased contentIVs so both paths work.
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
 * Look up a single letter for an owner. Used by mutation routes
 * (`/letters/[id]/peek`, `/viewed`, `/read`) and any single-letter read.
 *
 * Returns null if no such letter exists for this user.
 *
 * Phase 4: also checks for native Letter rows (sourceJournalEntryId = NULL)
 * when the JournalEntry lookup misses — these are self-letters sealed via
 * the new POST /api/letters/self write path.
 */
export async function findLetterForRead(args: {
  id: string
  userId: string
  requireSealed?: boolean
}): Promise<DualReadLetter | null> {
  const { id, userId, requireSealed } = args

  // Step 1: Try Letter table and JournalEntry in parallel — they have no inter-dependency.
  const [letter, je] = await Promise.all([
    prisma.letter.findUnique({
      where: { sourceJournalEntryId: id },
      select: {
        id: true,
        userId: true,
        contentCiphertext: true,
        encryptionType: true,
        e2eeIV: true,
        e2eeIVs: true,
        recipientEmail: true,
        recipientName: true,
        senderName: true,
        letterLocation: true,
        scheduledFor: true,
        originalSenderId: true,
        originalLetterId: true,
        firstReadAt: true,
        savedByRecipientAt: true,
        bouncedAt: true,
        bouncedReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // Always join JournalEntry for fresh state (Phase 2: JournalEntry is source of truth for mutating state).
    prisma.journalEntry.findFirst({
      where: {
        id,
        userId,
        ...(requireSealed ? { isSealed: true } : {}),
      },
      select: {
        id: true,
        userId: true,
        entryType: true,
        text: true,
        encryptionType: true,
        e2eeIV: true,
        e2eeIVs: true,
        recipientEmail: true,
        recipientName: true,
        senderName: true,
        letterLocation: true,
        unlockDate: true,
        isSealed: true,
        isDelivered: true,
        deliveredAt: true,
        isViewed: true,
        letterPeekedAt: true,
        isReceivedLetter: true,
        isArchived: true,
        originalSenderId: true,
        originalEntryId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  if (!je) {
    // Phase 4 fallback: the id might be a native Letter.id (no JournalEntry counterpart).
    const nativeLetter = await prisma.letter.findFirst({
      where: {
        id,
        userId,
        sourceJournalEntryId: null,
        ...(requireSealed ? { isSealed: true } : {}),
      },
      select: NATIVE_LETTER_SELECT,
    })
    if (!nativeLetter) return null
    return mapNativeLetter(nativeLetter)
  }

  // Authorisation check: Letter row must belong to the same user.
  if (letter && letter.userId !== userId) return null

  if (!letter) {
    // Fallback: serve from JournalEntry only. This is the legitimate path
    // for any letter created after the backfill ran.
    return {
      id: je.id,
      // Prisma returns entryType as string; cast is safe — the DB column is an enum
      // constrained to these four values by schema.prisma.
      entryType: je.entryType as 'normal' | 'letter' | 'unsent_letter' | 'ephemeral',
      text: je.text,
      encryptionType: je.encryptionType,
      e2eeIV: je.e2eeIV,
      e2eeIVs: je.e2eeIVs,
      recipientEmail: je.recipientEmail,
      recipientName: je.recipientName,
      senderName: je.senderName,
      letterLocation: je.letterLocation,
      unlockDate: je.unlockDate,
      isSealed: je.isSealed,
      isDelivered: je.isDelivered,
      deliveredAt: je.deliveredAt,
      isViewed: je.isViewed,
      letterPeekedAt: je.letterPeekedAt,
      isReceivedLetter: je.isReceivedLetter,
      isArchived: je.isArchived,
      originalSenderId: je.originalSenderId,
      originalEntryId: je.originalEntryId,
      firstReadAt: null,
      savedByRecipientAt: null,
      bouncedAt: null,
      bouncedReason: null,
      createdAt: je.createdAt,
      updatedAt: je.updatedAt,
      _source: 'je-only',
    }
  }

  // Content & most metadata from Letter; mutation-prone state from JournalEntry.
  return {
    id: je.id, // expose JournalEntry.id to keep frontend stable
    // Prisma returns entryType as string; cast is safe — the DB column is an enum
    // constrained to these four values by schema.prisma.
    entryType: je.entryType as 'normal' | 'letter' | 'unsent_letter' | 'ephemeral',
    // Defence-in-depth: backfill always sets contentCiphertext, but if a future write path leaves it null
    // we fall back to je.text. Note this can mis-pair with letter.encryptionType — monitor in fixture diffs.
    text: letter.contentCiphertext ?? je.text,
    encryptionType: letter.encryptionType,
    e2eeIV: letter.e2eeIV,
    e2eeIVs: letter.e2eeIVs,
    recipientEmail: letter.recipientEmail,
    recipientName: letter.recipientName,
    senderName: letter.senderName,
    letterLocation: letter.letterLocation,
    unlockDate: letter.scheduledFor,
    isSealed: je.isSealed,
    isDelivered: je.isDelivered,
    deliveredAt: je.deliveredAt,
    isViewed: je.isViewed,
    letterPeekedAt: je.letterPeekedAt,
    isReceivedLetter: je.isReceivedLetter,
    isArchived: je.isArchived,
    originalSenderId: je.originalSenderId,
    originalEntryId: je.originalEntryId,
    firstReadAt: letter.firstReadAt,
    savedByRecipientAt: letter.savedByRecipientAt,
    bouncedAt: letter.bouncedAt,
    bouncedReason: letter.bouncedReason,
    createdAt: letter.createdAt,
    updatedAt: letter.updatedAt,
    _source: 'letter+je',
  }
}

/**
 * List letters for an owner. The `where` argument is applied against
 * JournalEntry (since JournalEntry is still the source of truth for state
 * filters like isDelivered, isViewed). Letter rows are looked up afterward
 * keyed on sourceJournalEntryId. Order is preserved from the JournalEntry
 * query.
 *
 * This pattern means filters that test mutable state ("only delivered",
 * "only sealed", etc.) stay correct in Phase 2 because they read from
 * JournalEntry, not the stale Letter mirror.
 *
 * Phase 4: additionally queries the Letter table for native self-letters
 * (sourceJournalEntryId = NULL, letterType = 'self'). These rows have no
 * JournalEntry counterpart and carry their own authoritative state. They are
 * appended to the JournalEntry-anchored list and sorted together by createdAt
 * descending after merge. Native self-letters always satisfy:
 *   entryType = 'letter', isReceivedLetter = false, isSealed = true
 * so they safely match any caller filter that includes those predicates, and
 * the filter translation below hardcodes them rather than translating arbitrary
 * JournalEntry where clauses.
 */
export async function listLettersForRead(args: {
  userId: string
  where: Prisma.JournalEntryWhereInput
  orderBy: Prisma.JournalEntryOrderByWithRelationInput
}): Promise<DualReadLetter[]> {
  const { userId, where, orderBy } = args

  // Determine the sort field/direction for post-merge sort of native rows.
  // We only honour createdAt / unlockDate (the two used by callers).
  // Everything else falls back to createdAt desc.
  let mergeField: 'createdAt' | 'unlockDate' = 'createdAt'
  let mergeDir: 'asc' | 'desc' = 'desc'
  if (orderBy && typeof orderBy === 'object' && !Array.isArray(orderBy)) {
    const ob = orderBy as Record<string, unknown>
    if (ob.unlockDate) {
      mergeField = 'unlockDate'
      mergeDir = (ob.unlockDate as string) === 'asc' ? 'asc' : 'desc'
    } else if (ob.createdAt) {
      mergeField = 'createdAt'
      mergeDir = (ob.createdAt as string) === 'asc' ? 'asc' : 'desc'
    }
  }

  // Run JournalEntry query and native Letter query in parallel.
  const [journals, nativeLetterRows] = await Promise.all([
    prisma.journalEntry.findMany({
      where: { ...where, userId },
      orderBy,
      select: {
        id: true,
        entryType: true,
        text: true,
        encryptionType: true,
        e2eeIV: true,
        e2eeIVs: true,
        recipientEmail: true,
        recipientName: true,
        senderName: true,
        letterLocation: true,
        unlockDate: true,
        isSealed: true,
        isDelivered: true,
        deliveredAt: true,
        isViewed: true,
        letterPeekedAt: true,
        isReceivedLetter: true,
        isArchived: true,
        originalSenderId: true,
        originalEntryId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // Phase 4 native self-letters. Filter translation:
    // - entryType='letter': native self-letters always qualify — hardcoded.
    // - isReceivedLetter: always false for self — hardcoded.
    // - isSealed: always true for sealed letters — hardcoded.
    // - unlockDate lte / gte: translate from the JE where clause if present.
    // - isArchived: preserve caller intent if present in where clause.
    (async () => {
      // Extract unlockDate and isArchived filters from where clause for native rows.
      const jeWhere = where as Record<string, unknown>

      // Determine if caller wants delivered letters (unlockDate <= now) or all.
      // We check OR clauses too (inbox uses OR).
      let unlockDateFilter: Prisma.DateTimeNullableFilter | undefined
      let isArchivedFilter: boolean | undefined

      const extractFromWhere = (w: Record<string, unknown>) => {
        if (w.unlockDate && typeof w.unlockDate === 'object') {
          unlockDateFilter = w.unlockDate as Prisma.DateTimeNullableFilter
        }
        if (w.isArchived !== undefined) {
          isArchivedFilter = w.isArchived as boolean
        }
      }

      extractFromWhere(jeWhere)

      // Also scan top-level OR branches for unlockDate / isArchived.
      if (Array.isArray(jeWhere.OR)) {
        for (const clause of jeWhere.OR as Record<string, unknown>[]) {
          extractFromWhere(clause)
        }
      }

      // Skip native rows if caller is explicitly filtering for received letters only.
      // isReceivedLetter: true means the caller only wants received letters —
      // native self-letters are never received, so skip entirely.
      if (jeWhere.isReceivedLetter === true) return []

      return prisma.letter.findMany({
        where: {
          userId,
          letterType: 'self',
          sourceJournalEntryId: null,
          isSealed: true,
          isReceivedLetter: false,
          ...(unlockDateFilter !== undefined ? { scheduledFor: unlockDateFilter } : {}),
          ...(isArchivedFilter !== undefined ? { isArchived: isArchivedFilter } : {}),
        },
        select: NATIVE_LETTER_SELECT,
        orderBy:
          mergeField === 'unlockDate'
            ? { scheduledFor: mergeDir }
            : { createdAt: mergeDir },
      })
    })(),
  ])

  // Map JournalEntry rows (with optional Letter mirror) — same as Phase 2.
  let jeResults: DualReadLetter[] = []

  if (journals.length > 0) {
    const letterRows = await prisma.letter.findMany({
      where: { sourceJournalEntryId: { in: journals.map((j) => j.id) }, userId },
      select: {
        sourceJournalEntryId: true,
        contentCiphertext: true,
        encryptionType: true,
        e2eeIV: true,
        e2eeIVs: true,
        recipientEmail: true,
        recipientName: true,
        senderName: true,
        letterLocation: true,
        scheduledFor: true,
        firstReadAt: true,
        savedByRecipientAt: true,
        bouncedAt: true,
        bouncedReason: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const letterBySource = new Map(letterRows.map((l) => [l.sourceJournalEntryId!, l]))

    jeResults = journals.map((je) => {
      const letter = letterBySource.get(je.id)
      // Prisma returns entryType as string; cast is safe — the DB column is an enum
      // constrained to these four values by schema.prisma.
      const entryType = je.entryType as 'normal' | 'letter' | 'unsent_letter' | 'ephemeral'
      if (!letter) {
        return {
          id: je.id,
          entryType,
          text: je.text,
          encryptionType: je.encryptionType,
          e2eeIV: je.e2eeIV,
          e2eeIVs: je.e2eeIVs,
          recipientEmail: je.recipientEmail,
          recipientName: je.recipientName,
          senderName: je.senderName,
          letterLocation: je.letterLocation,
          unlockDate: je.unlockDate,
          isSealed: je.isSealed,
          isDelivered: je.isDelivered,
          deliveredAt: je.deliveredAt,
          isViewed: je.isViewed,
          letterPeekedAt: je.letterPeekedAt,
          isReceivedLetter: je.isReceivedLetter,
          isArchived: je.isArchived,
          originalSenderId: je.originalSenderId,
          originalEntryId: je.originalEntryId,
          firstReadAt: null,
          savedByRecipientAt: null,
          bouncedAt: null,
          bouncedReason: null,
          createdAt: je.createdAt,
          updatedAt: je.updatedAt,
          _source: 'je-only',
        }
      }
      return {
        id: je.id,
        entryType,
        // Defence-in-depth: backfill always sets contentCiphertext, but if a future write path leaves it null
        // we fall back to je.text. Note this can mis-pair with letter.encryptionType — monitor in fixture diffs.
        text: letter.contentCiphertext ?? je.text,
        encryptionType: letter.encryptionType,
        e2eeIV: letter.e2eeIV,
        e2eeIVs: letter.e2eeIVs,
        recipientEmail: letter.recipientEmail,
        recipientName: letter.recipientName,
        senderName: letter.senderName,
        letterLocation: letter.letterLocation,
        unlockDate: letter.scheduledFor,
        isSealed: je.isSealed,
        isDelivered: je.isDelivered,
        deliveredAt: je.deliveredAt,
        isViewed: je.isViewed,
        letterPeekedAt: je.letterPeekedAt,
        isReceivedLetter: je.isReceivedLetter,
        isArchived: je.isArchived,
        originalSenderId: je.originalSenderId,
        originalEntryId: je.originalEntryId,
        firstReadAt: letter.firstReadAt,
        savedByRecipientAt: letter.savedByRecipientAt,
        bouncedAt: letter.bouncedAt,
        bouncedReason: letter.bouncedReason,
        createdAt: letter.createdAt,
        updatedAt: letter.updatedAt,
        _source: 'letter+je',
      }
    })
  }

  // Map native letter rows.
  const nativeResults = nativeLetterRows.map(mapNativeLetter)

  if (nativeResults.length === 0) return jeResults

  // Merge and sort. The JE results are already sorted by the DB; we need to
  // interleave the native rows in the correct position.
  const merged = [...jeResults, ...nativeResults]
  merged.sort((a, b) => {
    const aVal = mergeField === 'unlockDate' ? a.unlockDate : a.createdAt
    const bVal = mergeField === 'unlockDate' ? b.unlockDate : b.createdAt
    const aMs = aVal ? aVal.getTime() : 0
    const bMs = bVal ? bVal.getTime() : 0
    return mergeDir === 'asc' ? aMs - bMs : bMs - aMs
  })
  return merged
}
