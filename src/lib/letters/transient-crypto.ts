// src/lib/letters/transient-crypto.ts
//
// AES-256-GCM under a random ephemeral key K. K is generated in
// friend-letter-client.ts, used here for transient encryption, then
// tlock-encrypted via tlock.ts. Server never sees K; only the holder of
// the URL fragment (after tlock unlocks) can decrypt.
//
// IV is base64-encoded; ciphertext is base64-encoded. The ephemeral key
// is passed as a raw 32-byte Uint8Array (imported on-the-fly here).

const ALGO = 'AES-GCM'
const IV_BYTES = 12

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

async function importTransientKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.byteLength !== 32) {
    throw new Error(`transient key must be 32 bytes, got ${rawKey.byteLength}`)
  }
  return crypto.subtle.importKey('raw', rawKey as BufferSource, ALGO, false, ['encrypt', 'decrypt'])
}

export async function encryptTransient(
  plaintext: ArrayBuffer | Uint8Array,
  rawKey: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importTransientKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const pt = plaintext instanceof Uint8Array ? plaintext : new Uint8Array(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv: iv as BufferSource }, key, pt as BufferSource)
  return { ciphertext: toBase64(ct), iv: toBase64(iv) }
}

export async function decryptTransient(
  ciphertextBase64: string,
  ivBase64: string,
  rawKey: Uint8Array
): Promise<Uint8Array> {
  const key = await importTransientKey(rawKey)
  const ct = fromBase64(ciphertextBase64)
  const iv = fromBase64(ivBase64)
  const pt = await crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, ct as BufferSource)
  return new Uint8Array(pt)
}
