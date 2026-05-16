// src/app/api/cron/letter-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
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
