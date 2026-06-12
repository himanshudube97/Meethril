import { describe, it, expect, beforeAll } from 'vitest'
import {
  encrypt,
  decrypt,
  isEncrypted,
  isEncryptionEnabled,
  safeDecrypt,
  encryptJson,
  decryptJson,
} from '@/lib/encryption'

// A valid 64-hex-char (32-byte) key so the module treats encryption as enabled.
const TEST_KEY = 'a'.repeat(64)

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY
})

describe('isEncryptionEnabled', () => {
  it('true for a 64-hex key', () => {
    expect(isEncryptionEnabled()).toBe(true)
  })
})

describe('encrypt / decrypt roundtrip', () => {
  it('round-trips plain text', () => {
    const plain = 'Dear diary, today I learned vitest.'
    const ct = encrypt(plain)
    expect(ct).not.toBe(plain)
    expect(decrypt(ct)).toBe(plain)
  })

  it('round-trips unicode and emoji', () => {
    const plain = 'café ☕ 日本語 🌙'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('produces a fresh IV each call (ciphertext differs for same input)', () => {
    const plain = 'same input'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('emits the iv:authTag:data shape', () => {
    const parts = encrypt('x').split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toHaveLength(32) // IV  (16 bytes hex)
    expect(parts[1]).toHaveLength(32) // tag (16 bytes hex)
  })

  it('passes empty string through untouched', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })
})

describe('tamper detection (GCM auth tag)', () => {
  it('throws when the ciphertext body is altered', () => {
    const ct = encrypt('authentic content')
    const [iv, tag, data] = ct.split(':')
    // Flip the last hex nibble of the encrypted body.
    const lastNibble = data.slice(-1)
    const flipped = data.slice(0, -1) + (lastNibble === '0' ? '1' : '0')
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('throws when the auth tag is altered', () => {
    const ct = encrypt('authentic content')
    const [iv, tag, data] = ct.split(':')
    const flippedTag = (tag[0] === '0' ? '1' : '0') + tag.slice(1)
    expect(() => decrypt(`${iv}:${flippedTag}:${data}`)).toThrow()
  })
})

describe('isEncrypted', () => {
  it('recognises our format', () => {
    expect(isEncrypted(encrypt('hi'))).toBe(true)
  })
  it('rejects plain text and wrong shapes', () => {
    expect(isEncrypted('just a sentence')).toBe(false)
    expect(isEncrypted('a:b')).toBe(false)
    expect(isEncrypted('')).toBe(false)
    expect(isEncrypted('short:short:data')).toBe(false)
  })
})

describe('decrypt of non-encrypted input (migration passthrough)', () => {
  it('returns plaintext as-is when it is not our format', () => {
    expect(decrypt('legacy plaintext row')).toBe('legacy plaintext row')
  })
})

describe('safeDecrypt', () => {
  it('returns the original string when decryption throws', () => {
    // Well-formed shape but garbage body → decrypt throws → safeDecrypt swallows.
    const bogus = `${'0'.repeat(32)}:${'0'.repeat(32)}:deadbeef`
    expect(safeDecrypt(bogus)).toBe(bogus)
  })
  it('passes null/undefined through', () => {
    expect(safeDecrypt(null)).toBe(null as unknown as string)
    expect(safeDecrypt(undefined)).toBe(undefined as unknown as string)
  })
})

describe('encryptJson / decryptJson', () => {
  it('round-trips a structured object', () => {
    const data = { nickname: 'Moony', birthday: '1990-07-31', nested: [1, 2, 3] }
    const ct = encryptJson(data)
    expect(decryptJson<typeof data>(ct)).toEqual(data)
  })

  it('returns null for empty/nullish input', () => {
    expect(decryptJson(null)).toBeNull()
    expect(decryptJson(undefined)).toBeNull()
    expect(decryptJson('')).toBeNull()
  })

  it('parses legacy un-encrypted plain JSON', () => {
    const legacy = JSON.stringify({ nickname: 'Old' })
    expect(decryptJson<{ nickname: string }>(legacy)).toEqual({ nickname: 'Old' })
  })

  it('returns null (not a type-lie) for undecryptable, non-JSON garbage', () => {
    const garbage = `${'0'.repeat(32)}:${'0'.repeat(32)}:deadbeef`
    expect(decryptJson(garbage)).toBeNull()
  })
})
