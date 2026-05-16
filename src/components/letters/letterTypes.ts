// src/components/letters/letterTypes.ts
import { addDays, addMonths } from 'date-fns'

export type LetterRecipient = 'future_me' | 'someone_close'

export type UnlockChoice =
  | { kind: '1_week' }
  | { kind: '14_days' }
  | { kind: '1_month' }
  | { kind: '6_months' }   // kept in union (used in RecipientSidebar legacy view) but not shown as a new pill
  | { kind: '1_year' }     // kept in union (used in LetterWriteView legacy view) but not shown as a new pill
  | { kind: 'someday'; date: Date | null } // null = picker not yet chosen

export const DEFAULT_UNLOCK: UnlockChoice = { kind: '1_week' }

/**
 * Resolve an UnlockChoice into a concrete unlock Date relative to `from`.
 * Returns null only when kind=someday and date is not yet picked
 * (UI must block seal in that case).
 */
export function resolveUnlockDate(choice: UnlockChoice, from: Date = new Date()): Date | null {
  switch (choice.kind) {
    case '1_week':    return addDays(from, 7)
    case '14_days':   return addDays(from, 14)
    case '1_month':   return addMonths(from, 1)
    case '6_months':  return addMonths(from, 6)
    case '1_year':    return addMonths(from, 12)
    case 'someday':   return choice.date
  }
}

/**
 * Map the new UI recipient onto the existing schema fields.
 * - future_me  -> entryType=letter, recipient=self, no email, recipientName="future me"
 * - someone_close (no email) -> entryType=unsent_letter, no recipient/email, recipientName=user-typed
 * - someone_close (with email) -> entryType=letter, recipient=friend, recipientEmail set
 */
export interface RecipientSchemaMapping {
  entryType: 'letter' | 'unsent_letter'
  recipient: 'self' | 'friend' | null   // null for unsent
  recipientName: string                  // "future me" or user-typed name
  recipientEmail: string | null
}

export function mapRecipientToSchema(
  recipient: LetterRecipient,
  closeName: string,
  closeEmail: string | null,
): RecipientSchemaMapping {
  if (recipient === 'future_me') {
    return {
      entryType: 'letter',
      recipient: 'self',
      recipientName: 'future me',
      recipientEmail: null,
    }
  }
  // someone_close
  if (closeEmail && closeEmail.trim().length > 0) {
    return {
      entryType: 'letter',
      recipient: 'friend',
      recipientName: closeName.trim() || 'someone close',
      recipientEmail: closeEmail.trim(),
    }
  }
  return {
    entryType: 'unsent_letter',
    recipient: null,
    recipientName: closeName.trim() || 'someone close',
    recipientEmail: null,
  }
}

// === New v2 types ===

export interface InboxLetter {
  id: string
  recipientName: string | null
  sealedAt: string       // ISO
  unlockDate: string | null
  isViewed: boolean
  encryptionType?: string
  e2eeIVs?: unknown
  // Ciphertext (E2EE) or decrypted text (server). Included inline so RevealModal
  // can decrypt without a second /api/entries/[id] roundtrip — required for
  // Phase 4 native self-letters whose id is a Letter.id with no JournalEntry.
  text?: string
}

export interface SentStamp {
  id: string
  recipientName: string | null
  sealedAt: string
  unlockDate: string | null
  isDelivered: boolean
  letterPeekedAt: string | null
  firstReadAt: string | null
  savedByRecipientAt: string | null
  bouncedAt: string | null
  bouncedReason: string | null
  encryptionType?: string
  e2eeIVs?: unknown
}

export type LettersTab = 'inbox' | 'sent' | 'lights'

export type RecipientChoice =
  | { recipient: 'self' }
  | { recipient: 'friend'; name: string }
