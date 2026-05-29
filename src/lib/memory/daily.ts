/**
 * Deterministic "memory of the day" selection (issue #37).
 *
 * The memory page shows a fixed handful of items that stay constant for the
 * whole calendar day and rotate to a fresh set the next day. We can't use
 * Math.random() (it would reshuffle on every render / revisit), so we seed a
 * tiny PRNG with the local date string. Same day → same seed → same picks;
 * next day → new seed → new picks.
 */

// FNV-1a string hash → 32-bit unsigned int. Cheap, deterministic.
function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32 PRNG — deterministic given a seed, good enough for shuffling.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Local calendar day as `YYYY-MM-DD` (the per-day seed). */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Pick up to `count` items from `pool`, deterministically for the given day
 * `key`. The pool is first sorted by id so the input order is stable, then
 * seeded-shuffled — so the result depends only on the membership of the pool
 * and the day, not on fetch order or render timing.
 */
export function pickDailyItems<T extends { id: string }>(
  pool: T[],
  count: number,
  key: string = localDayKey(),
): T[] {
  if (pool.length <= count) return [...pool]

  const ordered = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rand = mulberry32(hashString(key))

  // Seeded Fisher–Yates.
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
  }

  return ordered.slice(0, count)
}

/**
 * Deterministic pseudo-random in [0,1) for a given id + salt — used to place
 * memory items (star/butterfly positions) so they don't jump on re-render.
 */
export function seededUnit(id: string, salt: string): number {
  return mulberry32(hashString(`${id}:${salt}`))()
}
