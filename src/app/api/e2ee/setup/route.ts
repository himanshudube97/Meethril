import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { E2EE_ONBOARDED_COOKIE, E2EE_COOKIE_OPTS } from '@/lib/auth/e2ee-cookie'

// POST - Enable E2EE, store encrypted master key blobs
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      encryptedMasterKey,
      masterKeyIV,
      masterKeySalt,
      recoveryKeyHash,
      encryptedMasterKeyRecovery,
      recoveryKeyIV,
    } = body

    // Validate required fields
    if (
      !encryptedMasterKey ||
      !masterKeyIV ||
      !masterKeySalt ||
      !recoveryKeyHash ||
      !encryptedMasterKeyRecovery ||
      !recoveryKeyIV
    ) {
      return NextResponse.json(
        { error: 'Missing required E2EE setup fields' },
        { status: 400 }
      )
    }

    // Check if E2EE is already enabled
    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { e2eeEnabled: true },
    })

    if (existingUser?.e2eeEnabled) {
      return NextResponse.json(
        { error: 'E2EE is already enabled' },
        { status: 400 }
      )
    }

    // Enable E2EE and store encrypted keys
    await prisma.user.update({
      where: { id: user.id },
      data: {
        e2eeEnabled: true,
        encryptedMasterKey,
        masterKeyIV,
        masterKeySalt,
        recoveryKeyHash,
        encryptedMasterKeyRecovery,
        recoveryKeyIV,
        e2eeSetupAt: new Date(),
      },
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set(E2EE_ONBOARDED_COOKIE, '1', E2EE_COOKIE_OPTS)
    return response
  } catch (error) {
    console.error('Error setting up E2EE:', error)
    return NextResponse.json(
      { error: 'Failed to setup E2EE' },
      { status: 500 }
    )
  }
}
