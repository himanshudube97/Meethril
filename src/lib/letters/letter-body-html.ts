// src/lib/letters/letter-body-html.ts
//
// A letter body is stored as PLAIN TEXT captured via TipTap's editor.getText().
// In that text, paragraph breaks survive only as "\n\n" (getText joins block
// nodes with its default blockSeparator of "\n\n"), and a blank line the writer
// left shows up as an extra "\n\n".
//
// When that plain text is fed straight back into TipTap with setContent(string),
// TipTap treats it as one text blob and HTML-collapses the newlines into spaces
// — so every paragraph runs together. To render the breaks we must rebuild the
// paragraph structure as HTML first.
//
// We split on EXACTLY "\n\n" — the precise inverse of getText's block separator.
// That recovers each paragraph (and each empty paragraph) exactly as authored,
// which means:
//   • idempotent — setContent(letterBodyToHtml(getText(doc))) round-trips with
//     no blank-line accumulation (the bug you'd get from splitting on "\n"), and
//   • height-stable — it reproduces the authored block structure, so it can't
//     grow past what the writer was capped to and clip/truncate on the card.
// A stray single "\n" (e.g. from the mobile plain-textarea composer) becomes a
// <br> so the break still shows; the desktop TipTap composer never emits a lone
// "\n", so its letters round-trip perfectly.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function letterBodyToHtml(text: string): string {
  if (!text) return ''
  return text
    .split('\n\n')
    .map((segment) => `<p>${escapeHtml(segment).replace(/\n/g, '<br>')}</p>`)
    .join('')
}
