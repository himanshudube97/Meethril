import { redirect } from 'next/navigation'
import { getCurrentUser, hasCompletedE2EEOnboarding } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { E2EEOnboardingModal } from '@/components/onboarding/E2EEOnboardingModal'

export default async function OnboardingPage() {
  const authUser = await getCurrentUser()
  if (!authUser) redirect('/login')

  // Fetch full user record from Prisma to get E2EE fields
  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      name: true,
      e2eeEnabled: true,
      encryptedMasterKey: true,
      recoveryKeyHash: true,
    },
  })

  if (!user) redirect('/login')
  if (hasCompletedE2EEOnboarding(user)) redirect('/me')

  return <E2EEOnboardingModal userName={user.name ?? ''} />
}
