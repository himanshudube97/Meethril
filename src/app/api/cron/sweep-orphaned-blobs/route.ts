import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getPhotoAdapter } from '@/lib/storage/photo-adapter'
import { checkCronAuth } from '@/lib/cron-auth'

const BATCH_SIZE = 50

// Cron sweep: delete blobs that the backfill flow flagged as orphaned
// (entry PUT failed after the upload succeeded). Idempotent — adapters'
// delete() already swallows missing-handle errors. Marks each row sweptAt
// after a successful delete so subsequent runs skip it.
export async function POST(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  const orphans = await prisma.orphanedBlob.findMany({
    where: { sweptAt: null },
    take: BATCH_SIZE,
  })

  if (orphans.length === 0) {
    return NextResponse.json({ message: 'No orphans to sweep', swept: 0 })
  }

  const adapter = await getPhotoAdapter()
  const sweptIds: string[] = []
  const errors: string[] = []

  for (const orphan of orphans) {
    try {
      await adapter.delete(orphan.handle, orphan.userId)
      sweptIds.push(orphan.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      errors.push(`${orphan.handle}: ${msg}`)
    }
  }

  if (sweptIds.length > 0) {
    await prisma.orphanedBlob.updateMany({
      where: { id: { in: sweptIds } },
      data: { sweptAt: new Date() },
    })
  }

  return NextResponse.json({
    swept: sweptIds.length,
    remaining: orphans.length - sweptIds.length,
    errors,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
