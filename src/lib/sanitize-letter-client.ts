'use client'

import DOMPurify from 'dompurify'

// Client-side sanitizer for letter/entry HTML rendered via
// dangerouslySetInnerHTML. The scope is self-only (the user is rendering
// their own decrypted content) but we sanitize anyway as defence-in-depth
// against a compromised ciphertext or MITM-tampered API response.
const CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'i', 'b', 'span', 'div', 'h1', 'h2', 'h3', 'blockquote', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['style'],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeLetterClient(html: string | null | undefined): string {
  if (!html) return ''
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(html, CONFIG) as unknown as string
}
