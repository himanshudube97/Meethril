'use client'

// Client-only crypto for stranger-note E2EE.
// Uses NaCl box (X25519 + XSalsa20-Poly1305) for keypair-based key wrapping,
// then AES-256-GCM (via Web Crypto) under the unwrapped thread key for messages.
//
// Why both? NaCl box gives us a sealed-envelope primitive perfect for wrapping a
// symmetric key to a recipient's public key. Once unwrapped, we use AES-GCM via
// the existing src/lib/e2ee/crypto.ts primitives so all our message crypto goes
// through one well-tested path.

import nacl from 'tweetnacl'
import { encryptString, decryptString } from '@/lib/e2ee/crypto'

// ── base64 helpers ──────────────────────────────────────────────────────────
function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── Keypair lifecycle ───────────────────────────────────────────────────────

export interface StrangerKeypairWrapped {
  publicKey: string // base64
  wrappedPrivateKey: string // base64 ciphertext under master key (Web Crypto AES-GCM JSON form)
}

/**
 * Generate a fresh Curve25519 keypair and wrap the private key under the user's master key.
 * Called lazily the first time the user attempts a wave.
 */
export async function generateStrangerKeypair(masterKey: CryptoKey): Promise<StrangerKeypairWrapped> {
  const pair = nacl.box.keyPair()
  // encryptString returns { ciphertext, iv } — serialize to JSON for storage
  const envelope = await encryptString(bytesToBase64(pair.secretKey), masterKey)
  const wrappedPrivateKey = JSON.stringify(envelope)
  return {
    publicKey: bytesToBase64(pair.publicKey),
    wrappedPrivateKey,
  }
}

/**
 * Unwrap the user's stranger private key for use in this session.
 */
export async function unwrapStrangerPrivateKey(
  wrappedPrivateKey: string,
  masterKey: CryptoKey
): Promise<Uint8Array> {
  let ciphertext: string
  let iv: string
  try {
    const parsed = JSON.parse(wrappedPrivateKey) as { ciphertext: string; iv: string }
    ciphertext = parsed.ciphertext
    iv = parsed.iv
  } catch {
    // A corrupt or truncated wrappedPrivateKey would throw a raw SyntaxError
    // here and bubble out as an unhandled promise rejection, leaving the
    // thread permanently unopenable. Surface a domain error the UI can show.
    throw new Error('corrupt thread key — key exchange may need to be retried')
  }
  const privB64 = await decryptString(ciphertext, iv, masterKey)
  return base64ToBytes(privB64)
}

// ── Thread key generation and wrapping ──────────────────────────────────────

/**
 * Generate a fresh thread key, wrap it for both participants' public keys.
 * Called by the FIRST client to poll a thread after mutual wave (server flag
 * pendingKeyExchange=true).
 */
export async function generateAndWrapThreadKey(
  myPrivateKey: Uint8Array,
  myPublicKey: string, // base64
  partnerPublicKey: string // base64
): Promise<{
  wrappedForMe: string
  wrappedForPartner: string
  threadKey: CryptoKey
}> {
  // Random 32-byte AES key — copy into a plain ArrayBuffer so importKey is happy
  const threadKeyBytes = new Uint8Array(nacl.randomBytes(32))

  const wrappedForMe = wrapKeyForRecipient(
    threadKeyBytes,
    myPrivateKey,
    base64ToBytes(myPublicKey)
  )
  const wrappedForPartner = wrapKeyForRecipient(
    threadKeyBytes,
    myPrivateKey,
    base64ToBytes(partnerPublicKey)
  )

  const threadKey = await crypto.subtle.importKey(
    'raw',
    threadKeyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )

  return { wrappedForMe, wrappedForPartner, threadKey }
}

function wrapKeyForRecipient(
  threadKey: Uint8Array,
  senderPrivate: Uint8Array,
  recipientPublic: Uint8Array
): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const boxed = nacl.box(threadKey, nonce, recipientPublic, senderPrivate)
  // Encode as nonce || ciphertext (base64)
  const out = new Uint8Array(nonce.length + boxed.length)
  out.set(nonce, 0)
  out.set(boxed, nonce.length)
  return bytesToBase64(out)
}

/**
 * Unwrap a thread key previously wrapped for the current user.
 * Called when a user opens a pen-pal thread and we have wrappedKeyForSender/Recipient.
 */
export async function unwrapThreadKey(
  wrappedKey: string,
  myPrivateKey: Uint8Array,
  partnerPublicKey: string // base64
): Promise<CryptoKey> {
  const combined = base64ToBytes(wrappedKey)
  const nonce = combined.slice(0, nacl.box.nonceLength)
  const boxed = combined.slice(nacl.box.nonceLength)
  const opened = nacl.box.open(boxed, nonce, base64ToBytes(partnerPublicKey), myPrivateKey)
  if (!opened) throw new Error('Failed to unwrap thread key')
  const openedBuffer = new Uint8Array(opened)
  return crypto.subtle.importKey('raw', openedBuffer.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

// ── Thread-tier message encryption (uses AES-GCM via Web Crypto) ─────────────

export async function encryptThreadMessage(plaintext: string, threadKey: CryptoKey): Promise<string> {
  // encryptString returns { ciphertext, iv } — serialize as JSON for storage.
  const envelope = await encryptString(plaintext, threadKey)
  return JSON.stringify(envelope)
}

export async function decryptThreadMessage(cipherEnvelope: string, threadKey: CryptoKey): Promise<string> {
  let ciphertext: string
  let iv: string
  try {
    const parsed = JSON.parse(cipherEnvelope) as { ciphertext: string; iv: string }
    ciphertext = parsed.ciphertext
    iv = parsed.iv
  } catch {
    throw new Error('thread message looks corrupted')
  }
  return decryptString(ciphertext, iv, threadKey)
}
