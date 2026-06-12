// src/lib/measure-split.ts
//
// Read-side counterpart to the editor's live text-fit. The desktop shelf
// reader renders a saved entry across a left + right page, but the stored
// left/right boundary is unreliable: entries written on the MOBILE editor (and
// legacy pre-marker entries) carry no PAGE_BREAK_MARKER, so the reader used to
// fall back to a font-blind character heuristic (CHARS_PER_LINE=38). When the
// real font wraps to more visual lines than the heuristic predicted, the left
// slice overflowed the fixed `overflow:hidden` page and the bottom lines were
// clipped (issue #59).
//
// This util splits the FULL plain text by actually MEASURING rendered height in
// the DOM with the entry's real font — so the left page is guaranteed to fit
// whatever font/size the entry uses, and the true remainder flows to the right
// page. Pure-logic prefix search lives in text-fit.ts; this file owns the DOM
// measurement piece (so it only runs in the browser).

import { findLargestFittingPrefix } from './text-fit'
import { splitTextForSpread } from './text-utils'

export interface MeasureSplitOpts {
  widthPx: number
  heightPx: number
  fontFamily: string
  fontSize: string // e.g. "21px" (matches resolveFontSize output)
  lineHeight: number // px
}

/**
 * Split `plainText` (newline-separated) into [left, right] so that `left`
 * renders within `heightPx` at the given font/width, snapping at a word or
 * newline boundary. `right` is the remainder (leading whitespace trimmed).
 *
 * Falls back to the character-count heuristic when there is no DOM (SSR/tests);
 * the client re-runs this during hydration where measurement is available.
 */
export function measureSplit(plainText: string, opts: MeasureSplitOpts): [string, string] {
  if (!plainText) return ['', '']

  if (typeof document === 'undefined') {
    // SSR / non-DOM: best-effort heuristic. Replaced by the measured result on
    // the client render.
    return splitTextForSpread(plainText)
  }

  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.left = '-99999px'
  probe.style.top = '0'
  probe.style.width = `${opts.widthPx}px`
  probe.style.fontFamily = opts.fontFamily
  probe.style.fontSize = opts.fontSize
  probe.style.lineHeight = `${opts.lineHeight}px`
  // Match the reader's writing div: preserve newlines + soft-wrap, no special
  // word breaking, so measured wrapping equals rendered wrapping.
  probe.style.whiteSpace = 'pre-wrap'
  probe.style.wordBreak = 'normal'
  probe.style.overflowWrap = 'normal'
  document.body.appendChild(probe)

  try {
    const fits = (prefix: string): boolean => {
      // A trailing space/newline doesn't add height on its own but keep the
      // measurement faithful to what will render.
      probe.textContent = prefix.length === 0 ? '' : prefix
      return probe.scrollHeight <= opts.heightPx
    }

    // Whole thing fits → no overflow.
    if (fits(plainText)) return [plainText, '']

    const fitLen = findLargestFittingPrefix(plainText, fits)

    // Snap back to the last word/newline boundary so we never cut mid-word.
    let splitAt = fitLen
    while (splitAt > 0 && plainText[splitAt] !== ' ' && plainText[splitAt] !== '\n') {
      splitAt--
    }
    if (splitAt === 0) splitAt = fitLen

    const left = plainText.slice(0, splitAt)
    const right = plainText.slice(splitAt).replace(/^\s+/, '')
    return [left, right]
  } finally {
    document.body.removeChild(probe)
  }
}
