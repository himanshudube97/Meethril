// Thin wrapper around OpenAI's omni-moderation endpoint. Free, ~200ms.
// Direct fetch (no SDK) to keep deps lean.
// Two layers:
//   1. A local profanity matcher (obscenity) — OpenAI has no "profanity"
//      category, so swearing alone never trips it. This runs FIRST and works
//      even with no API key / during an OpenAI outage. obscenity brings a
//      maintained English blacklist + leetspeak/obfuscation handling and a
//      whitelist (so "Scunthorpe" etc. don't false-positive).
//   2. OpenAI omni-moderation for the ML-judged harm categories.
// If OPENAI_API_KEY is not set (typical for local dev), only the profanity layer
// runs; the OpenAI layer no-ops so devs can still hit the flow without a key.

import {
  RegExpMatcher,
  DataSet,
  parseRawPattern,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

// Sexual-solicitation terms OpenAI's `sexual` boolean often misses (e.g. "share
// nudes") and which obscenity's English dataset doesn't include. Extend here.
const EXTRA_PROFANITY = [
  'nudes', 'sext', 'sexting', 'horny', 'boobs', 'tits', 'blowjob', 'handjob',
] as const

// Build the matcher once: obscenity's maintained English blacklist + our extra
// terms, with the recommended transformers (leetspeak, confusables, etc.).
const profanityMatcher = (() => {
  let dataset = new DataSet<{ originalWord: string }>().addAll(englishDataset)
  for (const word of EXTRA_PROFANITY) {
    dataset = dataset.addPhrase((phrase) =>
      phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(word)),
    )
  }
  return new RegExpMatcher({ ...dataset.build(), ...englishRecommendedTransformers })
})()

export interface ModerationResult {
  rejected: boolean
  reason?: ModerationCategory | 'profanity'
  selfHarm: boolean
}

export type ModerationCategory =
  | 'hate'
  | 'hate/threatening'
  | 'harassment'
  | 'harassment/threatening'
  | 'sexual'
  | 'sexual/minors'
  | 'violence'
  | 'violence/graphic'
  | 'illicit'
  | 'illicit/violent'

// Anything in this list → the note is rejected. Now covers adult sexual content
// (`sexual`), plain harassment (`harassment`), and violence (`violence`) in
// addition to the original threatening/graphic/minor/illicit categories.
const HARD_REJECT: ModerationCategory[] = [
  'hate',
  'hate/threatening',
  'harassment',
  'harassment/threatening',
  'sexual',
  'sexual/minors',
  'violence',
  'violence/graphic',
  'illicit',
  'illicit/violent',
]

export async function moderateText(text: string): Promise<ModerationResult> {
  // Layer 1: local profanity check (obscenity). Deterministic, free, and runs
  // regardless of API key or OpenAI availability — so bad words are blocked
  // even when the OpenAI layer below fails open.
  if (profanityMatcher.hasMatch(text)) {
    return { rejected: true, reason: 'profanity', selfHarm: false }
  }

  // Layer 2: OpenAI omni-moderation for ML-judged harm categories.
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Dev fallback: skip moderation. Log a one-time warning so this is visible.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[moderation] OPENAI_API_KEY not set — skipping moderation (dev only)')
    }
    return { rejected: false, selfHarm: false }
  }

  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    })
    if (!res.ok) {
      // On API failure, fail open with a log. We do not want to block all sends
      // because OpenAI had a hiccup. Self-harm/violence content slipping through is
      // a known risk of fail-open; revisit if outages become frequent.
      console.error('[moderation] OpenAI returned non-OK:', res.status)
      return { rejected: false, selfHarm: false }
    }
    const data = (await res.json()) as {
      results: Array<{ categories: Record<string, boolean>; flagged: boolean }>
    }
    const result = data.results?.[0]
    if (!result) return { rejected: false, selfHarm: false }

    for (const cat of HARD_REJECT) {
      if (result.categories[cat]) {
        return { rejected: true, reason: cat, selfHarm: false }
      }
    }
    const selfHarm =
      Boolean(result.categories['self-harm']) ||
      Boolean(result.categories['self-harm/intent']) ||
      Boolean(result.categories['self-harm/instructions'])
    return { rejected: false, selfHarm }
  } catch (err) {
    console.error('[moderation] fetch failed:', err)
    return { rejected: false, selfHarm: false }
  }
}
