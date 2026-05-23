// Server-side HTML sanitizer used by email templates.
//
// Why this exists: letter content originates as TipTap HTML output. Even though
// the in-app editor produces safe markup, the server cannot trust the client —
// a tampered request could embed <script>, <img onerror=...>, or javascript:
// hrefs. Rendering that unsanitized into an email is stored XSS aimed at the
// recipient's mail client, which (Outlook, Apple Mail) may execute onerror
// handlers on remote images.
//
// We pin DOMPurify to a JSDOM window so this runs in Node.

import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'

const { window } = new JSDOM('')
const purify = DOMPurify(window as unknown as Window & typeof globalThis)

const LETTER_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'i', 'b', 'u', 'span'],
  ALLOWED_ATTR: [] as string[],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeLetterHtml(html: string): string {
  return purify.sanitize(html, LETTER_CONFIG)
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
