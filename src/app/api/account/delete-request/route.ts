// src/app/api/account/delete-request/route.ts
//
// Manual account-deletion request. Records the user's intent in the
// AccountDeletionRequest queue; an operator processes it by hand on/after
// purgeOn (delete the user + cancel any Dodo subscription). No automated purge.
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendAccountDeletionScheduledEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const GRACE_DAYS = 14

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const typedEmail = typeof body.email === 'string' ? body.email.trim() : ''
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 1000)
        : null

    // Require the typed email to match the account email exactly (case-insensitive).
    if (typedEmail.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Email confirmation does not match your account email.' },
        { status: 400 },
      )
    }

    // Idempotent: if a pending request already exists, return it unchanged.
    const existing = await prisma.accountDeletionRequest.findFirst({
      where: { userId: user.id, status: 'pending' },
    })
    if (existing) {
      return NextResponse.json({ success: true, purgeOn: existing.purgeOn })
    }

    const purgeOn = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    await prisma.accountDeletionRequest.create({
      data: { userId: user.id, email: user.email, reason, purgeOn },
    })

    // Best-effort confirmation email — never fail the request on a mail error.
    await sendAccountDeletionScheduledEmail({
      to: user.email,
      userName: user.name,
      purgeDate: purgeOn,
    }).catch((e) => console.error('deletion-scheduled email failed:', e))

    return NextResponse.json({ success: true, purgeOn })
  } catch (error) {
    console.error('Account deletion request failed:', error)
    return NextResponse.json({ error: 'Failed to process deletion request' }, { status: 500 })
  }
}
