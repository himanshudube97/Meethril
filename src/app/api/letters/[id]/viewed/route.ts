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
    if (!letter || letter.recipientEmail !== null) {
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 })
    }
    // The dual-read helper doesn't carry entryType; preserve the original 'letter' filter with a narrow check.
    const isLetter = await prisma.journalEntry.findFirst({
      where: { id, userId: user.id, entryType: 'letter' },
      select: { id: true },
    })
    if (!isLetter) return NextResponse.json({ error: 'Letter not found' }, { status: 404 })

    // Mark as viewed
    await prisma.journalEntry.update({
      where: { id },
      data: { isViewed: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to mark letter as viewed:', error)
    return NextResponse.json({ error: 'Failed to update letter' }, { status: 500 })
  }
}
