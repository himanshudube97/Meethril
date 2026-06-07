/**
 * STRICT entitlement + quota verification (throwaway).
 * Exercises the REAL code (isPaidUser, checkQuota) against the REAL DB with fake
 * users in every billing state, seeds fake usage, asserts expectations, then
 * deletes everything it created. Run inside docker:
 *   docker compose exec app npx tsx scripts/verify-entitlements.ts
 */
import { prisma } from '../src/lib/db'
import { isPaidUser } from '../src/lib/billing/is-paid-user'
import { isAdminEmail } from '../src/lib/auth/admin'
import { checkQuota } from '../src/lib/billing/quota'
import { FREE_LIMITS, PAID_LIMITS, MONTHLY_LIMIT_KEY } from '../src/lib/billing/limits'

const DAY = 24 * 60 * 60 * 1000
const TAG = 'verify-ent+' // unique marker in emails so cleanup is safe
let pass = 0, fail = 0
const fails: string[] = []
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; fails.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name} ${detail}`) }
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim() || 'e2ee@gmail.com'

async function mkUser(label: string, data: Record<string, unknown>): Promise<string> {
  const email = `${TAG}${label}@test.local`
  const u = await prisma.user.upsert({
    where: { email },
    update: data,
    create: { email, name: label, ...data },
  })
  return u.id
}

async function main() {
  console.log('\n=== PART 1: isPaidUser across billing states (pure logic on real shapes) ===')
  const now = Date.now()
  const cases: Array<[string, Parameters<typeof isPaidUser>[0], boolean]> = [
    ['free (no sub)',            { subscriptionStatus: null, currentPeriodEnd: null }, false],
    ['active, end in future',    { subscriptionStatus: 'active', currentPeriodEnd: new Date(now + 20*DAY) }, true],
    ['active, end null',         { subscriptionStatus: 'active', currentPeriodEnd: null }, true],
    ['active, 1d past (leeway)', { subscriptionStatus: 'active', currentPeriodEnd: new Date(now - 1*DAY) }, true],
    ['active, 5d past (expired)',{ subscriptionStatus: 'active', currentPeriodEnd: new Date(now - 5*DAY) }, false],
    ['on_trial future',          { subscriptionStatus: 'on_trial', currentPeriodEnd: new Date(now + 5*DAY) }, true],
    ['on_hold within grace',     { subscriptionStatus: 'on_hold', currentPeriodEnd: new Date(now - 2*DAY) }, true],
    ['on_hold past grace',       { subscriptionStatus: 'on_hold', currentPeriodEnd: new Date(now - 6*DAY) }, false],
    ['cancelled',                { subscriptionStatus: 'cancelled', currentPeriodEnd: new Date(now + 5*DAY) }, false],
    ['expired',                  { subscriptionStatus: 'expired', currentPeriodEnd: new Date(now + 5*DAY) }, false],
    ['pending',                  { subscriptionStatus: 'pending', currentPeriodEnd: null }, false],
    ['complimentary, no sub',    { subscriptionStatus: null, currentPeriodEnd: null, complimentaryAccess: true }, true],
    ['admin flag, cancelled',    { subscriptionStatus: 'cancelled', currentPeriodEnd: null, isAdmin: true }, true],
  ]
  for (const [name, input, expected] of cases) {
    check(`${name} → ${expected ? 'PAID' : 'free'}`, isPaidUser(input) === expected, `got ${isPaidUser(input)}`)
  }

  console.log('\n=== PART 2: isAdminEmail ===')
  check(`ADMIN_EMAILS contains ${ADMIN_EMAIL}`, isAdminEmail(ADMIN_EMAIL))
  check('random email is not admin', !isAdminEmail('nobody@nowhere.test'))
  check('null email is not admin', !isAdminEmail(null))

  console.log('\n=== PART 3: checkQuota end-to-end (real DB users + seeded usage) ===')
  // Free user, fresh: all features allowed; limits == FREE_LIMITS
  const freeId = await mkUser('free', { subscriptionStatus: null, currentPeriodEnd: null })
  const paidId = await mkUser('paid', { subscriptionStatus: 'active', currentPeriodEnd: new Date(now + 20*DAY) })
  const compId = await mkUser('comp', { subscriptionStatus: null, currentPeriodEnd: null, complimentaryAccess: true })

  for (const f of ['journal','scrapbook','letterSelf','letterFriend'] as const) {
    const key = MONTHLY_LIMIT_KEY[f]
    const q = await checkQuota(freeId, f, 'UTC')
    check(`free ${f}: limit == FREE_LIMITS`, q.limit === FREE_LIMITS[key], `limit=${q.limit}`)
    check(`free ${f}: isPaid=false, allowed (fresh)`, q.isPaid === false && q.allowed === true)
    const qp = await checkQuota(paidId, f, 'UTC')
    check(`paid ${f}: limit == PAID_LIMITS`, qp.limit === PAID_LIMITS[key], `limit=${qp.limit}`)
    check(`paid ${f}: isPaid=true`, qp.isPaid === true)
    const qc = await checkQuota(compId, f, 'UTC')
    check(`complimentary ${f}: isPaid=true (limits == paid)`, qc.isPaid === true && qc.limit === qp.limit)
  }

  console.log('\n=== PART 4: quota actually BLOCKS at the free ceiling (seed real rows) ===')
  // Seed letterSelf rows up to the free cap for the free user, expect allowed flips false.
  const cap = FREE_LIMITS.letterSelfPerMonth
  for (let i = 0; i < cap; i++) {
    await prisma.letter.create({
      data: { userId: freeId, letterType: 'self', isSealed: true, isArchived: false },
    })
  }
  const qBlocked = await checkQuota(freeId, 'letterSelf', 'UTC')
  check(`free letterSelf at cap (${cap}): used==cap`, qBlocked.used === cap, `used=${qBlocked.used}`)
  check('free letterSelf at cap: allowed=false (BLOCKED → 429)', qBlocked.allowed === false)

  // Same seeded user, but as PAID: higher cap means still allowed.
  await prisma.user.update({ where: { id: freeId }, data: { subscriptionStatus: 'active', currentPeriodEnd: new Date(now + 20*DAY) } })
  const qAfterPay = await checkQuota(freeId, 'letterSelf', 'UTC')
  check(`AFTER 'payment' (status=active): same rows now allowed (${qAfterPay.used}/${qAfterPay.limit})`, qAfterPay.allowed === true && qAfterPay.isPaid === true)

  console.log('\n=== PART 5: paid journal is unlimited (Infinity), skips COUNT ===')
  const qj = await checkQuota(paidId, 'journal', 'UTC')
  check('paid journal limit is Infinity & allowed', qj.limit === Infinity && qj.allowed === true)

  // ---- cleanup ----
  console.log('\n=== CLEANUP ===')
  const ids = [freeId, paidId, compId]
  await prisma.letter.deleteMany({ where: { userId: { in: ids } } })
  const del = await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } })
  console.log(`  removed ${del.count} fake users + their seeded letters`)

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`)
  if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  - ' + f)); process.exitCode = 1 }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
