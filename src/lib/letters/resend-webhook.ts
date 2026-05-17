// src/lib/letters/resend-webhook.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ResendEventEnvelope {
  type: string
  data: Record<string, unknown>
}

export function verifyResendSignature(args: {
  rawBody: string
  svixId: string
  svixTimestamp: string
  svixSignature: string
  secret: string
}): boolean {
  // secret comes in like "whsec_xxx"; the Svix verification uses the part
  // after the underscore base64-decoded.
  const secretBase64 = args.secret.startsWith('whsec_') ? args.secret.slice('whsec_'.length) : args.secret
  const secretBytes = Buffer.from(secretBase64, 'base64')
  const signed = `${args.svixId}.${args.svixTimestamp}.${args.rawBody}`
  const expected = createHmac('sha256', secretBytes).update(signed).digest('base64')
  // svix-signature can carry multiple space-separated "v1,<sig>" entries
  const sigs = args.svixSignature.split(' ')
  for (const sig of sigs) {
    const m = sig.match(/^v1,(.+)$/)
    if (!m) continue
    const got = Buffer.from(m[1], 'base64')
    const want = Buffer.from(expected, 'base64')
    if (got.length === want.length && timingSafeEqual(got, want)) return true
  }
  return false
}
