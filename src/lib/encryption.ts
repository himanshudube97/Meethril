import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32')
  }
  return Buffer.from(key, 'hex')
}

/**
 * Check if encryption is enabled (key is set)
 */
export function isEncryptionEnabled(): boolean {
  const key = process.env.ENCRYPTION_KEY
  return Boolean(key && key.length === 64)
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns format: iv:authTag:encryptedData (all hex encoded)
 */
export function encrypt(text: string): string {
  if (!text) return text
  if (!isEncryptionEnabled()) return text // Skip if no key configured

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * Decrypt a string that was encrypted with encrypt()
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText
  if (!isEncryptionEnabled()) return encryptedText

  // Check if it's actually encrypted (has our format)
  if (!isEncrypted(encryptedText)) {
    return encryptedText // Return as-is if not encrypted (for migration/old data)
  }

  const [ivHex, authTagHex, encrypted] = encryptedText.split(':')

  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Check if a string is in our encrypted format
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false
  const parts = text.split(':')
  // IV (32 hex) : AuthTag (32 hex) : EncryptedData
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32
}

/**
 * Safely decrypt - returns original if decryption fails
 */
export function safeDecrypt(text: string | null | undefined): string {
  if (!text) return text as string
  try {
    return decrypt(text)
  } catch {
    return text // Return original if decryption fails
  }
}

/**
 * Encrypt JSON data (for doodle strokes, profile data)
 */
export function encryptJson(data: unknown): string {
  if (!data) return ''
  const jsonStr = JSON.stringify(data)
  return encrypt(jsonStr)
}

/**
 * Decrypt JSON data
 */
export function decryptJson<T>(encryptedData: string | null | undefined): T | null {
  if (!encryptedData) return null
  try {
    const decrypted = decrypt(encryptedData)
    return JSON.parse(decrypted) as T
  } catch {
    // If decryption fails, try parsing as plain JSON (old unencrypted data)
    try {
      if (typeof encryptedData === 'string') {
        return JSON.parse(encryptedData) as T
      }
      return encryptedData as T
    } catch {
      return encryptedData as T
    }
  }
}

// ============================================
// Entry-specific helpers
// ============================================

interface EntryEncryptedFields {
  text: string
  textPreview?: string | null
}

/**
 * Encrypt sensitive fields of a journal entry before saving
 */
export function encryptEntryFields<T extends EntryEncryptedFields>(entry: T): T {
  return {
    ...entry,
    text: encrypt(entry.text),
    textPreview: entry.textPreview ? encrypt(entry.textPreview) : null,
  }
}

/**
 * Decrypt sensitive fields of a journal entry after reading
 */
export function decryptEntryFields<T extends EntryEncryptedFields>(entry: T): T {
  return {
    ...entry,
    text: safeDecrypt(entry.text),
    textPreview: safeDecrypt(entry.textPreview),
  }
}
