/**
 * Task 0 smoke test for Phase 4: confirm tlock-js + drand-client round-trip
 * on the current Node version. Run via: docker compose exec app npx tsx scripts/test-tlock-roundtrip.ts
 */
import { timelockEncrypt, timelockDecrypt } from 'tlock-js'
import { fetchBeacon, HttpChainClient, HttpCachingChain } from 'drand-client'

const CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
const ENDPOINT = `https://api.drand.sh/${CHAIN_HASH}`

async function main() {
  const chain = new HttpCachingChain(ENDPOINT)
  const client = new HttpChainClient(chain)
  const info = await chain.info()
  console.log('chain info:', { hash: info.hash, period: info.period, genesis: info.genesis_time })

  // 1) Encrypt for a round 10 seconds in the future.
  const nowSec = Math.floor(Date.now() / 1000)
  const targetRound = Math.floor((nowSec + 10 - info.genesis_time) / info.period)
  console.log('targeting round', targetRound)

  const plaintext = new TextEncoder().encode('hearth phase 4 task 0 sentinel')
  const ciphertext = await timelockEncrypt(targetRound, Buffer.from(plaintext), client)
  console.log('ciphertext (truncated):', ciphertext.slice(0, 60), '...')

  // 2) Try to decrypt immediately — should throw because the round isn't ready.
  try {
    await timelockDecrypt(ciphertext, client)
    throw new Error('SMOKE FAIL: decryption succeeded before unlock time')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('SMOKE FAIL')) throw e
    console.log('pre-unlock decryption correctly rejected:', e instanceof Error ? e.message : e)
  }

  // 3) Wait for the round and try again.
  const waitMs = (targetRound * info.period + info.genesis_time - nowSec + 5) * 1000
  console.log(`waiting ${Math.ceil(waitMs / 1000)}s for round ${targetRound}...`)
  await new Promise((r) => setTimeout(r, waitMs))

  await fetchBeacon(client, targetRound) // sanity: round is available
  const decrypted = await timelockDecrypt(ciphertext, client)
  const text = new TextDecoder().decode(decrypted)
  if (text !== 'hearth phase 4 task 0 sentinel') {
    throw new Error(`SMOKE FAIL: round-trip mismatch — got ${JSON.stringify(text)}`)
  }
  console.log('SMOKE OK: round-trip succeeded')
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e)
  process.exit(1)
})
