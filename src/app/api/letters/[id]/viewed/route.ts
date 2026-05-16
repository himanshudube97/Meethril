import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { findLetterForRead } from '@/lib/letters/dual-read'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const letter = await findLetterForRead({ id, userId: user.id })
    // Only self-letters (no recipientEmail) can be marked as viewed by the sender/recipient.
    if (!letter || letter.recipientEmail !== null) {
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 })
    }

    // Mark as viewed on the Letter table (letters no longer live on JournalEntry).
    await prisma.letter.update({
      where: { id },
      data: { isViewed: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to mark letter as viewed:', error)
    return NextResponse.json({ error: 'Failed to update letter' }, { status: 500 })
  }
}
