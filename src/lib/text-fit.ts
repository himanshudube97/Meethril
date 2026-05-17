// src/lib/text-fit.ts
//
// Shared algorithm behind the "paste truncates to what fits" behavior used by
// the journal pages and the letter postcards. The DOM-measurement piece
// (scrollHeight, offsetHeight, etc.) stays at the call site; this file is
// pure logic so the algorithm itself can be unit-tested in jsdom (where
// layout numbers are all zero).
//
// Tested in src/__tests__/text-fit.test.ts — keep that file green when
// touching anything here.

/**
 * Given a candidate `text`, return the length L of the largest prefix
 * `text.slice(0, L)` for which `fits(prefix)` returns true.
 *
 * `fits` is expected to be **monotonic**: if a longer prefix fits, every
 * shorter prefix also fits. The visual "does this overflow the page?"
 * predicate is monotonic (shorter text is never taller).
 *
 * `floor` is a lower bound on the result — useful when the caller already
 * knows a particular prefix length is safe (e.g. "the user's text before
 * this keystroke fit, so the result must be at least that long"). The caller
 * is responsible for ensuring `fits(text.slice(0, floor))` is true; this
 * function does NOT verify it.
 *
 * Invariants enforced:
 *   • Returns `text.length` when `fits(text)` is true (no truncation when
 *     the whole text fits).
 *   • Returned L is always in `[floor, text.length]`.
 *   • For monotonic `fits`, the returned L is the maximal value with
 *     `fits(text.slice(0, L))` true.
 *
 * Invariants the caller must handle:
 *   • Mid-document insertions: this helper truncates from the END of `text`.
 *     If a paste landed in the middle of an existing document and the
 *     combined length overflows, content AFTER the inserted region may be
 *     lost. Callers should accept this for end-of-document edits and decide
 *     separately for other cases.
 */
export function findLargestFittingPrefix(
  text: string,
  fits: (prefix: string) => boolean,
  floor: number = 0,
): number {
  if (floor >= text.length) return text.length
  if (fits(text)) return text.length

  let lo = floor
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    if (fits(text.slice(0, mid))) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}
