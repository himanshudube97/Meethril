// src/lib/letters/tlock.ts
//
// Phase 4 friend letters: wrap tlock-js + drand-client against the
// env-configured quicknet chain. All helpers run in both Node and browser —
// the SDKs use globalThis.fetch.

import { timelockEncrypt, timelockDecrypt } from 'tlock-js'
import { HttpCachingChain, HttpChainClient, type ChainInfo } from 'drand-client'

const CHAIN_HASH = process.env.NEXT_PUBLIC_DRAND_CHAIN_HASH ?? process.env.DRAND_CHAIN_HASH
const API_URLS = (process.env.NEXT_PUBLIC_DRAND_API_URLS ?? process.env.DRAND_API_URLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!CHAIN_HASH) {
  throw new Error('Missing DRAND_CHAIN_HASH (or NEXT_PUBLIC_DRAND_CHAIN_HASH)')
}
if (API_URLS.length === 0) {
  throw new Error('Missing DRAND_API_URLS (or NEXT_PUBLIC_DRAND_API_URLS)')
}

let _info: ChainInfo | null = null
let _client: HttpChainClient | null = null

async function getClient(): Promise<{ client: HttpChainClient; info: ChainInfo }> {
  if (_client && _info) return { client: _client, info: _info }
  // Pick the first endpoint; HttpCachingChain handles retries internally.
  const chain = new HttpCachingChain(`${API_URLS[0]}/${CHAIN_HASH}`)
  const info = await chain.info()
  _info = info
  _client = new HttpChainClient(chain)
  return { client: _client, info }
}

/**
 * Compute the drand round number whose beacon will exist on/after the given
 * date. Rounds are deterministic: round n is produced at genesis + n*period.
 */
export async function roundFromDate(unlockDate: Date): Promise<number> {
  const { info } = await getClient()
  const targetSec = Math.floor(unlockDate.getTime() / 1000)
  const round = Math.ceil((targetSec - info.genesis_time) / info.period)
  return Math.max(1, round)
}

/**
 * Encrypt a 32-byte ephemeral key against the drand round that will exist
 * at unlockDate. Returns an Age-format armored string suitable for storage
 * in `LetterDelivery.tlockedKey`.
 */
export async function tlockEncryptKey(key: Uint8Array, unlockDate: Date): Promise<string> {
  if (key.byteLength !== 32) {
    throw new Error(`tlockEncryptKey: expected 32-byte key, got ${key.byteLength}`)
  }
  const { client } = await getClient()
  const round = await roundFromDate(unlockDate)
  // tlock-js wants a Buffer
  const buf = Buffer.from(key)
  return timelockEncrypt(round, buf, client)
}

/**
 * Decrypt a previously-tlock-encrypted key. Will throw until the drand round
 * for unlockDate has been produced (typically <3s after unlockDate).
 */
export async function tlockDecryptKey(tlocked: string, _unlockDate: Date): Promise<Uint8Array> {
  const { client } = await getClient()
  const decrypted = await timelockDecrypt(tlocked, client)
  return new Uint8Array(decrypted)
}
