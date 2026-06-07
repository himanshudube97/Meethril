/**
 * E2EE Cryptography Module
 *
 * Uses Web Crypto API for:
 * - AES-256-GCM encryption/decryption
 * - PBKDF2 key derivation from passphrases
 * - Secure random key generation
 */

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const SALT_LENGTH = 16
const PBKDF2_ITERATIONS = 100000

// ============================================
// Utility Functions
// ============================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

// ============================================
// Key Generation
// ============================================

/**
 * Generate a new random master key for encrypting entries
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  )
}

/**
 * Generate a human-readable recovery key (24 words/chars format)
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (24 chars, easy to write down)
 */
export function generateRecoveryKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No O/0/I/1 for clarity
  const bytes = generateRandomBytes(24)
  let key = ''
  for (let i = 0; i < 24; i++) {
    if (i > 0 && i % 4 === 0) key += '-'
    key += chars[bytes[i] % chars.length]
  }
  return key
}

// ============================================
// Key Derivation
// ============================================

/**
 * Derive an AES key from a passphrase using PBKDF2
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // not extractable
    ['wrapKey', 'unwrapKey']
  )
}

/**
 * Derive an AES key from recovery key for unwrapping
 */
export async function deriveKeyFromRecoveryKey(
  recoveryKey: string
): Promise<CryptoKey> {
  // Use the recovery key itself as both passphrase and salt basis
  const encoder = new TextEncoder()
  const normalizedKey = recoveryKey.replace(/-/g, '').toUpperCase()

  // Create a deterministic salt from the recovery key
  const saltData = await crypto.subtle.digest('SHA-256', encoder.encode(normalizedKey + '-salt'))
  const salt = new Uint8Array(saltData).slice(0, SALT_LENGTH)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(normalizedKey),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

// ============================================
// Key Wrapping (Encrypt/Decrypt Master Key)
// ============================================

/**
 * Wrap (encrypt) the master key with a derived key
 */
export async function wrapMasterKey(
  masterKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ wrappedKey: string; iv: string }> {
  const iv = generateRandomBytes(IV_LENGTH)

  const wrappedKey = await crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrappingKey,
    { name: ALGORITHM, iv: iv as BufferSource }
  )

  return {
    wrappedKey: arrayBufferToBase64(wrappedKey),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/**
 * Unwrap (decrypt) the master key with a derived key
 */
export async function unwrapMasterKey(
  wrappedKeyBase64: string,
  wrappingKey: CryptoKey,
  ivBase64: string
): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64)
  const iv = base64ToArrayBuffer(ivBase64)

  return crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    wrappingKey,
    { name: ALGORITHM, iv: new Uint8Array(iv) },
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  )
}

// ============================================
// Entry Encryption/Decryption
// ============================================

/**
 * Encrypt entry text with the master key
 */
export async function encryptEntry(
  plaintext: string,
  masterKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder()
  const iv = generateRandomBytes(IV_LENGTH)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    masterKey,
    encoder.encode(plaintext)
  )

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/**
 * Decrypt entry text with the master key
 */
export async function decryptEntry(
  ciphertextBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder()
  const ciphertext = base64ToArrayBuffer(ciphertextBase64)
  const iv = base64ToArrayBuffer(ivBase64)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(iv) },
    masterKey,
    ciphertext
  )

  return decoder.decode(decrypted)
}

// ============================================
// String/Bytes Helpers
// ============================================

/** Encrypt a UTF-8 string with the master key. Returns base64 ciphertext + iv. */
export async function encryptString(
  plaintext: string,
  masterKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder()
  const iv = generateRandomBytes(IV_LENGTH)
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    masterKey,
    encoder.encode(plaintext)
  )
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/** Decrypt a base64 ciphertext + iv back to a UTF-8 string. */
export async function decryptString(
  ciphertextBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<string> {
  const decoder = new TextDecoder()
  const ciphertext = base64ToArrayBuffer(ciphertextBase64)
  const iv = base64ToArrayBuffer(ivBase64)
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(iv) },
    masterKey,
    ciphertext
  )
  return decoder.decode(decrypted)
}

/** Encrypt raw bytes (e.g., a photo's ArrayBuffer). Returns base64 ciphertext + iv. */
export async function encryptBytes(
  plaintext: ArrayBuffer,
  masterKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = generateRandomBytes(IV_LENGTH)
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource },
    masterKey,
    plaintext
  )
  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  }
}

/** Decrypt base64 ciphertext + iv back to raw bytes. */
export async function decryptBytes(
  ciphertextBase64: string,
  ivBase64: string,
  masterKey: CryptoKey
): Promise<ArrayBuffer> {
  const ciphertext = base64ToArrayBuffer(ciphertextBase64)
  const iv = base64ToArrayBuffer(ivBase64)
  return crypto.subtle.decrypt(
    { name: ALGORITHM, iv: new Uint8Array(iv) },
    masterKey,
    ciphertext
  )
}

// ============================================
// Verification
// ============================================

/**
 * Hash recovery key for verification (stored in DB)
 */
export async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const normalizedKey = recoveryKey.replace(/-/g, '').toUpperCase()
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(normalizedKey))
  return arrayBufferToBase64(hash)
}

/**
 * Verify a recovery key against its hash
 */
export async function verifyRecoveryKey(
  recoveryKey: string,
  storedHash: string
): Promise<boolean> {
  const hash = await hashRecoveryKey(recoveryKey)
  return hash === storedHash
}

// ============================================
// Salt Generation
// ============================================

/**
 * Generate a new random salt for PBKDF2
 */
export function generateSalt(): string {
  const salt = generateRandomBytes(SALT_LENGTH)
  return arrayBufferToBase64(salt.buffer as ArrayBuffer)
}

/**
 * Parse a base64 salt to Uint8Array
 */
export function parseSalt(saltBase64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(saltBase64))
}

// ============================================
// Key Storage Helpers
// ============================================

const MASTER_KEY_STORAGE_KEY = 'meethril-e2ee-master-key'

/** Export master key to base64. */
export async function exportMasterKey(masterKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', masterKey)
  return arrayBufferToBase64(exported)
}

/** Import master key from base64. */
export async function importMasterKey(keyBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(keyBase64)
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

interface StoredKey {
  key: string // base64-encoded raw AES-256 master key
}

/**
 * Persist the unlocked master key in sessionStorage. It lives only for the
 * current tab session: the browser wipes it when the tab closes, and on mobile
 * when the OS discards the backgrounded tab. So the user re-enters their daily
 * key once per session rather than once per day, in exchange for a tighter
 * exposure window — the raw AES key never persists to disk across sessions.
 *
 * Earlier builds used localStorage with a TTL (7-day, then 1-day) so the key
 * survived mobile tab eviction. We moved back to sessionStorage for the tighter
 * security once the placeholder-overwrite corruption — the real cause of the
 * stuck "[Encrypted — unlock to view]" entries — was fixed independently of
 * where the key is stored. The key is also cleared on logout and via "Lock
 * diary".
 */
export async function storeMasterKeyLocally(masterKey: CryptoKey): Promise<void> {
  const exported = await exportMasterKey(masterKey)
  try {
    sessionStorage.setItem(MASTER_KEY_STORAGE_KEY, JSON.stringify({ key: exported }))
  } catch {
    /* sessionStorage may be disabled — key stays in memory only this session */
  }
  // Sweep any key left in localStorage by the previous (TTL) build so the
  // long-lived plaintext copy doesn't linger now that we're session-only.
  try {
    localStorage.removeItem(MASTER_KEY_STORAGE_KEY)
  } catch {
    /* localStorage may be disabled */
  }
}

/**
 * Load the master key from sessionStorage. Returns null if absent (fresh
 * session, tab was closed, or logged out) or unreadable — in which case the
 * caller shows the unlock modal.
 */
export async function loadMasterKeyLocally(): Promise<CryptoKey | null> {
  // Sweep any stale localStorage key from the previous (TTL) build on every
  // load so an upgrading user doesn't carry the long-lived copy around.
  try {
    localStorage.removeItem(MASTER_KEY_STORAGE_KEY)
  } catch {
    /* localStorage may be disabled */
  }

  let raw: string | null
  try {
    raw = sessionStorage.getItem(MASTER_KEY_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: StoredKey
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearMasterKeyLocally()
    return null
  }

  try {
    return await importMasterKey(parsed.key)
  } catch {
    clearMasterKeyLocally()
    return null
  }
}

/** Remove the master key from both storages. */
export function clearMasterKeyLocally(): void {
  try { sessionStorage.removeItem(MASTER_KEY_STORAGE_KEY) } catch { /* disabled */ }
  try { localStorage.removeItem(MASTER_KEY_STORAGE_KEY) } catch { /* disabled */ }
}

/** True if a master key is stored for the current session. */
export function hasMasterKeyLocally(): boolean {
  try {
    const raw = sessionStorage.getItem(MASTER_KEY_STORAGE_KEY)
    if (!raw) return false
    JSON.parse(raw) as StoredKey
    return true
  } catch {
    return false
  }
}
