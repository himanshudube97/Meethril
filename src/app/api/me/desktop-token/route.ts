import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { mintDesktopToken } from '@/lib/desktop-token'

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = await mintDesktopToken(user.id)
  return NextResponse.json({ token })
}
