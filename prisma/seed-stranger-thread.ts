/**
 * Dev-only: seed a 10-message stranger-notes thread for e2ee@gmail.com so the
 * leaf thread layout can be checked at length. Idempotent — re-running wipes
 * the prior dummy thread between the same two users first.
 *
 * Run: docker compose exec app npx tsx prisma/seed-stranger-thread.ts
 */
import { PrismaClient } from '@prisma/client'
import { encrypt } from '../src/lib/encryption'

const prisma = new PrismaClient()

async function main() {
  const e2ee = await prisma.user.findUnique({ where: { email: 'e2ee@gmail.com' } })
  if (!e2ee) throw new Error('e2ee@gmail.com not found — log in once to create it, then re-run.')

  const partner = await prisma.user.upsert({
    where: { email: 'reverie.stranger@hearth.local' },
    update: {},
    create: { email: 'reverie.stranger@hearth.local', name: 'Reverie', provider: 'dev' },
  })

  // Idempotent: clear any prior dummy thread between these two.
  await prisma.strangerThread.deleteMany({
    where: { senderId: e2ee.id, recipientId: partner.id },
  })

  const now = Date.now()
  // mine === true → from e2ee (the viewer); false → from the stranger.
  const conv: { mine: boolean; text: string; cc?: string }[] = [
    { mine: true,  text: 'hello, whoever you are. i hope the day is being gentle with you.', cc: 'IN' },
    { mine: false, text: 'hey there. paths crossing like this feels quietly special. how is the weather over where you are?', cc: 'CA' },
    { mine: true,  text: 'rainy here, actually — the good kind. the kind that makes you want to stay in and write.', cc: 'IN' },
    { mine: false, text: 'that sounds perfect. it has been dry where i am for weeks now. i miss the smell of wet earth.', cc: 'CA' },
    { mine: true,  text: 'petrichor. one of my favourite words. what are you writing toward these days?', cc: 'IN' },
    { mine: false, text: 'mostly just trying to notice small things — a good cup of tea, a song that catches me off guard, the particular quiet of a house just before everyone else is awake. small anchors.', cc: 'CA' },
    { mine: true,  text: 'i love that. today it was the way the late light fell across the kitchen floor.', cc: 'IN' },
    { mine: false, text: 'you write like someone who pays attention. that is rarer than it should be. thank you for it.', cc: 'CA' },
    { mine: true,  text: 'that might be the kindest thing a stranger has said to me. i will carry it for a while.', cc: 'IN' },
    { mine: false, text: 'then my letter did its small job. take care of yourself, friend — i hope the rain stays exactly as long as you want it to.', cc: 'CA' },
  ]

  const thread = await prisma.strangerThread.create({
    data: {
      senderId: e2ee.id,
      recipientId: partner.id,
      status: 'active',
      senderDisplayName: 'a quiet light',
      recipientDisplayName: 'Reverie',
      matchedAt: new Date(now - 11 * 3600 * 1000),
      lastActivityAt: new Date(now - 60 * 1000),
    },
  })

  for (let i = 0; i < conv.length; i++) {
    const m = conv[i]
    await prisma.strangerMessage.create({
      data: {
        threadId: thread.id,
        senderId: m.mine ? e2ee.id : partner.id,
        content: encrypt(m.text),
        encryptionTier: 'server',
        countryCode: m.cc ?? null,
        // oldest first, ~9 min apart, newest a minute ago
        createdAt: new Date(now - (conv.length - i) * 9 * 60 * 1000),
      },
    })
  }

  console.log(`Seeded thread ${thread.id} with ${conv.length} messages for e2ee@gmail.com (partner "Reverie").`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
