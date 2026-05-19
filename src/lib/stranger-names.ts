// Per-thread display name generator. Adjective + noun, ~50 of each.
// Stable for a given (threadId, userId) input — uses a small FNV-1a hash so we don't
// need any randomness at call sites. Different threadIds map to different names so
// the same physical user gets a different name in each thread (cross-thread identity
// is intentionally broken).

const ADJECTIVES = [
  'Gentle', 'Quiet', 'Velvet', 'Morning', 'Slow', 'Warm', 'Hushed', 'Sleepy',
  'Drifting', 'Soft', 'Patient', 'Glimmering', 'Cozy', 'Wandering', 'Mellow',
  'Dappled', 'Misty', 'Tender', 'Steady', 'Curious', 'Gracious', 'Honeyed',
  'Glowing', 'Brave', 'Earnest', 'Hopeful', 'Kindly', 'Lucid', 'Modest',
  'Nimble', 'Open', 'Plucky', 'Radiant', 'Serene', 'Tranquil', 'Upright',
  'Vivid', 'Whispering', 'Pale', 'Rosy', 'Amber', 'Cobalt', 'Bramble',
  'Lantern', 'Linden', 'Maple', 'Walnut', 'Willow', 'Cedar', 'Birch',
]

const NOUNS = [
  'Heron', 'Pine', 'Moth', 'Lake', 'River', 'Lantern', 'Sparrow', 'Owl',
  'Wren', 'Thrush', 'Fox', 'Hare', 'Deer', 'Otter', 'Bear', 'Wolf',
  'Brook', 'Meadow', 'Pebble', 'Acorn', 'Feather', 'Petal', 'Fern',
  'Ivy', 'Cloud', 'Star', 'Comet', 'Moon', 'Dawn', 'Dusk', 'Tide',
  'Harbor', 'Cove', 'Pasture', 'Hearth', 'Candle', 'Ember', 'Stone',
  'Pearl', 'Coral', 'Reed', 'Sage', 'Thistle', 'Clover', 'Lichen',
  'Glade', 'Hollow', 'Knoll', 'Vale', 'Cairn',
]

function fnv1a(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function generateDisplayName(seed: string): string {
  const a = fnv1a(seed + ':adj')
  const n = fnv1a(seed + ':noun')
  return `${ADJECTIVES[a % ADJECTIVES.length]} ${NOUNS[n % NOUNS.length]}`
}
