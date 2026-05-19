// Thin wrapper around OpenAI's omni-moderation endpoint. Free, ~200ms.
// Direct fetch (no SDK) to keep deps lean.
// If OPENAI_API_KEY is not set (typical for local dev), moderation no-ops so devs
// can still hit the flow without an API key.

export interface ModerationResult {
  rejected: boolean
  reason?: ModerationCategory
  selfHarm: boolean
}

export type ModerationCategory =
  | 'hate'
  | 'hate/threatening'
  | 'harassment/threatening'
  | 'sexual/minors'
  | 'violence/graphic'
  | 'illicit'

const HARD_REJECT: ModerationCategory[] = [
  'hate',
  'hate/threatening',
  'harassment/threatening',
  'sexual/minors',
  'violence/graphic',
  'illicit',
]

export async function moderateText(text: string): Promise<ModerationResult> {
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
