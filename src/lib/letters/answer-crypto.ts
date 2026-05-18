// src/lib/letters/answer-crypto.ts
//
// Friend-letter crypto module. The sender writes a question + an answer
// at seal time. The answer is normalized and stretched through Argon2id
// with a per-letter salt to produce a 256-bit AES-GCM key. That key
// encrypts the letter body and every photo asset. The server never sees
// the answer or the derived key.
//
// API mirrors the old transient-crypto.ts (encrypt / decrypt taking raw
// 32-byte keys) so the rest of the code path looks unchanged.

import { argon2id } from 'hash-wasm'

const ALGO = 'AES-GCM'
const IV_BYTES = 12
const SALT_BYTES = 16
const KEY_BYTES = 32

// OWASP-recommended minimum for Argon2id, mobile-safe.
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456, // KiB (~19MB)
  hashLength: KEY_BYTES,
}

// ---------- base64 helpers (kept local; tight surface) ----------

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i])
  return btoa(bin)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return u8
}

// ---------- normalization ----------

/**
 * Normalize a typed answer so case, spacing, punctuation, and diacritic
 * variations all collapse to the same string before key derivation.
 * Must produce byte-identical output on sender and recipient.
 *
 * Pipeline:
 *   1. Unicode NFKD normalize
 *   2. Strip combining marks (so "é" → "e")
 *   3. Lowercase
 *   4. Strip all whitespace
 *   5. Strip all punctuation/symbol characters
 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, '')
}

// ---------- salt ----------

/** 16 random bytes, base64-encoded. */
export function generateSalt(): string {
  const s = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return toBase64(s)
}

// ---------- key derivation ----------

/**
 * Argon2id(normalize(answer), salt) → 32-byte raw key.
 * Returns the raw bytes; encrypt/decrypt below take this shape.
 *
 * Latency: ~300ms desktop, ~1s mid-range mobile, ~1.5–2s low-end mobile.
 */
export async function deriveLetterKey(answer: string, saltBase64: string): Promise<Uint8Array> {
  const normalized = normalizeAnswer(answer)
  if (normalized.length === 0) {
    throw new Error('answer is empty after normalization')
  }
  const salt = fromBase64(saltBase64)
  const hex = await argon2id({
    password: normalized,
    salt,
    parallelism: ARGON2.parallelism,
    iterations: ARGON2.iterations,
    memorySize: ARGON2.memorySize,
    hashLength: ARGON2.hashLength,
    outputType: 'hex',
  })
  const out = new Uint8Array(KEY_BYTES)
  for (let i = 0; i < KEY_BYTES; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// ---------- AES-GCM helpers ----------

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== KEY_BYTES) {
    throw new Error(`letter key must be ${KEY_BYTES} bytes, got ${rawKey.byteLength}`)
  }
  return crypto.subtle.importKey('raw', rawKey as BufferSource, ALGO, false, ['encrypt', 'decrypt'])
}

export async function encryptWithLetterKey(
  plaintext: ArrayBuffer | Uint8Array,
  rawKey: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const pt = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv: iv as BufferSource }, key, pt as BufferSource)
  return { ciphertext: toBase64(ct), iv: toBase64(iv) }
}

export async function decryptWithLetterKey(
  ciphertextBase64: string,
  ivBase64: string,
  rawKey: Uint8Array
): Promise<Uint8Array> {
  const key = await importAesKey(rawKey)
  const ct = fromBase64(ciphertextBase64)
  const iv = fromBase64(ivBase64)
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, ct as BufferSource)
  return new Uint8Array(pt)
}

// ---------- raw key (de)serialization (for sessionStorage on Keep-forever) ----------

export function rawKeyToBase64(rawKey: Uint8Array): string {
  return toBase64(rawKey)
}

export function rawKeyFromBase64(b64: string): Uint8Array {
  const k = fromBase64(b64)
  if (k.byteLength !== KEY_BYTES) {
    throw new Error(`letter key must decode to ${KEY_BYTES} bytes, got ${k.byteLength}`)
  }
  return k
}
