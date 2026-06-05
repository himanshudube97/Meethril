import { SignJWT, jwtVerify } from 'jose'

const SCOPE = 'desktop-pending'
const TTL = '180d'

function secret(): Uint8Array {
  const s = process.env.DESKTOP_TOKEN_SECRET || process.env.DEV_JWT_SECRET
  if (!s || s.length < 32) throw new Error('DESKTOP_TOKEN_SECRET (or DEV_JWT_SECRET) missing/too short')
  return new TextEncoder().encode(s)
}

export async function mintDesktopToken(userId: string): Promise<string> {
  return new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret())
}

export async function verifyDesktopToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.scope !== SCOPE || typeof payload.sub !== 'string') return null
    return { userId: payload.sub }
  } catch {
    return null
  }
}
