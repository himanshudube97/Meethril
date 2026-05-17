'use client'

// Offline preview of the sent-letters jar view, populated with mock data.
// Useful for design review without seeding a test account. The live view
// at /letters (sent tab) renders the same component with real data.

import LettersTokens from '@/components/letters/LettersTokens'
import JarSentView from '@/components/letters/sent/JarSentView'
import type { SentStamp } from '@/components/letters/letterTypes'

const MOCK: SentStamp[] = [
  { id: '1', recipientName: 'future me', sealedAt: '2026-05-01T10:00:00Z', unlockDate: '2026-05-08T10:00:00Z', isDelivered: false, letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '2', recipientName: 'rito',      sealedAt: '2026-04-20T10:00:00Z', unlockDate: '2026-04-27T10:00:00Z', isDelivered: false, letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '3', recipientName: 'future me', sealedAt: '2026-04-12T10:00:00Z', unlockDate: '2026-04-19T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '4', recipientName: 'ANJU',      sealedAt: '2026-03-19T10:00:00Z', unlockDate: '2026-03-26T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '5', recipientName: 'future me', sealedAt: '2026-03-08T10:00:00Z', unlockDate: '2026-03-15T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '6', recipientName: 'future me', sealedAt: '2026-02-22T10:00:00Z', unlockDate: '2026-02-27T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '7', recipientName: 'mom',       sealedAt: '2026-02-14T10:00:00Z', unlockDate: '2026-02-21T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '8', recipientName: 'future me', sealedAt: '2026-02-05T10:00:00Z', unlockDate: '2026-02-12T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '9', recipientName: 'sam',       sealedAt: '2026-01-25T10:00:00Z', unlockDate: '2026-02-01T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
  { id: '10', recipientName: 'future me',sealedAt: '2026-01-10T10:00:00Z', unlockDate: '2026-01-17T10:00:00Z', isDelivered: true,  letterPeekedAt: null, firstReadAt: null, savedByRecipientAt: null, bouncedAt: null, bouncedReason: null },
]

export default function SentDemoPage() {
  return (
    <>
      <LettersTokens />
      <JarSentView stamps={MOCK} />
    </>
  )
}
