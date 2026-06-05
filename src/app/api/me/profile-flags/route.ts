import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptJson, encryptJson } from '@/lib/encryption'

const ALLOWED_KEYS = new Set([
  'reminderTime',
  'reminderOptInPromptShownAt',
  'lastComebackShownAt',
  'remindersEnabled',
])

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { profile: true } })
  const profile = dbUser?.profile
    ? (decryptJson<Record<string, unknown>>(dbUser.profile as string) ?? {})
    : {}
  return NextResponse.json({ profile })
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_KEYS.has(k)) updates[k] = v
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  // User.profile stores an encrypted JSON blob (see src/app/api/profile/route.ts)
  // — decrypt, merge, re-encrypt to coexist with profile-question keys.
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { profile: true } })
  const existingProfile = dbUser?.profile
    ? (decryptJson<Record<string, unknown>>(dbUser.profile as string) ?? {})
    : {}
  const nextProfile = { ...existingProfile, ...updates }

  await prisma.user.update({
    where: { id: user.id },
    data: { profile: encryptJson(nextProfile) },
  })

  return NextResponse.json({ ok: true, profile: nextProfile })
}
