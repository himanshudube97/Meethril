// src/app/api/cron/letter-cleanup/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { checkCronAuth } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

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
