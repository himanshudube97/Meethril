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

  // Timestamps
  createdAt: Date
  updatedAt: Date

  // Source tag — useful for telemetry / debugging the dual-read split.
  // CALLERS MUST NOT include this in serialised JSON responses (route fixtures expect it absent).
  _source: 'letter+je' | 'je-only'
}

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

  if (!je) return null

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
 */
export async function listLettersForRead(args: {
  userId: string
  where: Prisma.JournalEntryWhereInput
  orderBy: Prisma.JournalEntryOrderByWithRelationInput
}): Promise<DualReadLetter[]> {
  const { userId, where, orderBy } = args

  const journals = await prisma.journalEntry.findMany({
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
  })

  if (journals.length === 0) return []

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
      createdAt: true,
      updatedAt: true,
    },
  })

  const letterBySource = new Map(letterRows.map((l) => [l.sourceJournalEntryId!, l]))

  return journals.map((je) => {
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
      createdAt: letter.createdAt,
      updatedAt: letter.updatedAt,
      _source: 'letter+je',
    }
  })
}
