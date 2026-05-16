// src/app/api/cron/letter-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  // Fail-closed in production: a missing CRON_SECRET would otherwise leave
  // this endpoint publicly callable. Less harmful than the reminder cron
  // (this one only deletes already-expired rows), but still fail-closed for
  // consistency. Dev keeps fail-open so local cron testing works.
  if (!secret && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'cron not configured' }, { status: 500 })
  }
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const twentyFourHrAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

  const result = await prisma.letterDelivery.deleteMany({
    where: {
      OR: [
        { firstReadAt: { lt: twentyFourHrAgo } },
        { AND: [{ firstReadAt: null }, { createdAt: { lt: sixtyDaysAgo } }] },
      ],
    },
  })

  return NextResponse.json({ deleted: result.count })
}
