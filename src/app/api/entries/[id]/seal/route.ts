import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

/**
 * Seal a letter draft. After sealing, isSealed=true makes the entry
 * immutable (the lock check in PUT /api/entries/[id] returns 403 for any
 * write). The cron job that delivers letters reads isSealed + unlockDate to
 * find letters whose time has come.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.journalEntry.findUnique({
      where: { id },
      select: {
        userId: true,
        entryType: true,
        isSealed: true,
        unlockDate: true,
        recipientEmail: true,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (existing.entryType === 'normal') {
      return NextResponse.json({ error: 'Only letters can be sealed' }, { status: 400 })
    }
    if (existing.isSealed) {
      return NextResponse.json({ error: 'Already sealed' }, { status: 400 })
    }
    // Parse the request body to get the unlock date and optional recipient email
    // that the client is confirming at seal time.
    let body: { unlockDate?: string; recipientEmail?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Body is optional — fall through and use the DB value
    }

    const unlockDate = body.unlockDate ? new Date(body.unlockDate) : existing.unlockDate
    const recipientEmail = body.recipientEmail ?? existing.recipientEmail ?? null

    if (unlockDate && isNaN(unlockDate.getTime())) {
      return NextResponse.json({ error: 'Invalid unlock date.' }, { status: 400 })
    }

    if (!unlockDate) {
      return NextResponse.json(
        { error: 'Choose when this letter should arrive before sealing' },
        { status: 400 },
      )
    }

    // Friend letters: must have a well-formed email AND be within 30 days.
    if (existing.entryType === 'unsent_letter') {
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return NextResponse.json(
          { error: 'A valid recipient email is required for friend letters.' },
          { status: 400 },
        )
      }
      const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      if (unlockDate > maxDate) {
        return NextResponse.json(
          { error: 'Friend letters must arrive within 30 days.' },
          { status: 400 },
        )
      }
    }

    // Self letters: no recipient email permitted.
    if (existing.entryType === 'letter' && recipientEmail) {
      return NextResponse.json(
        { error: 'Self letters cannot have a recipient email.' },
        { status: 400 },
      )
    }

    await prisma.journalEntry.update({
      where: { id },
      data: {
        isSealed: true,
        unlockDate,
        ...(existing.entryType === 'unsent_letter' ? { recipientEmail } : {}),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sealing entry:', error)
    return NextResponse.json({ error: 'Failed to seal entry' }, { status: 500 })
  }
}
