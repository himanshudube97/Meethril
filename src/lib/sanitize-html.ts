// Server-side HTML sanitizer used by email templates.
//
// Why this exists: letter content originates as TipTap HTML output. Even though
// the in-app editor produces safe markup, the server cannot trust the client —
// a tampered request could embed <script>, <img onerror=...>, or javascript:
// hrefs. Rendering that unsanitized into an email is stored XSS aimed at the
// recipient's mail client, which (Outlook, Apple Mail) may execute onerror
// handlers on remote images.
//
// We use the pure-JS `sanitize-html` package rather than DOMPurify-on-a-server-
// DOM. The old jsdom backing crashed in Vercel's CommonJS serverless bundle:
// jsdom@29 → html-encoding-sniffer@6 does a CJS `require()` of the ESM-only
// @exodus/bytes/encoding-lite.js, throwing ERR_REQUIRE_ESM at import time and
// taking down every route that imports lib/email (friend letters, the Dodo
// webhook, etc.). linkedom-backed DOMPurify silently returned input UNCHANGED
// (no real DOM → DOMPurify's unsupported-env passthrough), which is worse.
// `sanitize-html` parses with htmlparser2 — no DOM, no native deps, no broken
// CJS/ESM interop — and actually strips. (DOMPurify is still used client-side,
// where a real browser `window` exists; see sanitize-letter-client.ts.)

import sanitizeHtml from 'sanitize-html'

const LETTER_OPTIONS: sanitizeHtml.IOptions = {
  // Only inline formatting tags. Everything else (script, img, a, style, etc.)
  // is dropped along with its contents where appropriate.
  allowedTags: ['p', 'br', 'strong', 'em', 'i', 'b', 'u', 'span'],
  // No attributes on any tag — strips style/class/onerror/href entirely.
  allowedAttributes: {},
  // Drop disallowed tags and their text content for script/style so raw JS
  // never leaks through as text; other disallowed tags keep their text.
  disallowedTagsMode: 'discard',
}

export function sanitizeLetterHtml(html: string): string {
  return sanitizeHtml(html, LETTER_OPTIONS)
}

// Plain-text escape for fields that are NOT meant to contain markup
// (sender name, recipient name, location). Centralised here so both
// email.ts and any future server-side template can use the same helper.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]!),
  )
}
