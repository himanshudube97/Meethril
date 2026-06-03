/**
 * Grant or revoke complimentary (friends & family) access by email.
 *
 * Complimentary users get the full PAID feature tier with no Dodo subscription
 * and no expiry — isPaidUser() returns true for them. See User.complimentaryAccess.
 *
 * Usage (connects to whatever DATABASE_URL points at):
 *   docker compose exec app npx tsx scripts/grant-comp.ts <email>
 *   docker compose exec app npx tsx scripts/grant-comp.ts <email> --revoke
 *   docker compose exec app npx tsx scripts/grant-comp.ts --list
 *
 * To target staging/prod from your laptop, prefix an inline DATABASE_URL:
 *   docker compose exec -e DATABASE_URL='postgresql://...' app \
 *     npx tsx scripts/grant-comp.ts friend@example.com
 *
 * (Or just toggle the `complimentaryAccess` checkbox in Prisma Studio.)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const revoke = args.includes('--revoke')
  const list = args.includes('--list')
  const email = args.find((a) => !a.startsWith('--'))?.toLowerCase().trim()

  if (list) {
    const comps = await prisma.user.findMany({
      where: { complimentaryAccess: true },
      select: { email: true, name: true },
      orderBy: { email: 'asc' },
    })
    if (comps.length === 0) {
      console.log('No complimentary users.')
    } else {
      console.log(`${comps.length} complimentary user(s):`)
      for (const u of comps) console.log(`  • ${u.email}${u.name ? ` (${u.name})` : ''}`)
    }
    return
  }

  if (!email) {
    console.error('Usage: grant-comp.ts <email> [--revoke] | --list')
    process.exitCode = 1
    return
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, complimentaryAccess: true },
  })
  if (!user) {
    console.error(`No user found with email: ${email}`)
    process.exitCode = 1
    return
  }

  const next = !revoke
  if (user.complimentaryAccess === next) {
    console.log(`No change — ${email} already has complimentaryAccess=${next}.`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { complimentaryAccess: next },
  })
  console.log(`${next ? '✅ Granted' : '🔒 Revoked'} complimentary access for ${email}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
