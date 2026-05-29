/**
 * Central config for the legal pages (/privacy and /terms).
 *
 * ⚠️  These templates are a solid starting point for a consumer journaling
 *     app, but they are NOT legal advice. Before launch, have a lawyer (or a
 *     reputable generator like Termly / iubenda / GetTerms) review and adapt
 *     them to your jurisdiction.
 *
 * Fill in the placeholders below once — every legal page reads from here.
 */

const CONTACT_EMAIL = 'himanshu@meethril.com'

export const legal = {
  // Consumer-facing brand name (Meethril is the public brand; "Hearth" is the
  // internal dev codename — do NOT show "Hearth" to users here).
  brand: 'Meethril',

  // The legal entity that operates the service. If you're an individual sole
  // proprietor, use your name; if you've incorporated, use the company name.
  // TODO: replace with your real legal entity.
  entity: 'Meethril',

  // Country / state whose law governs the Terms and where disputes are heard.
  // TODO: replace with your real jurisdiction, e.g. "India" or "Delaware, USA".
  governingLaw: 'India',

  // Public contact address for privacy requests, support and legal notices.
  contactEmail: CONTACT_EMAIL,
  // Gmail web-compose link prefilled to the contact address. We link to this
  // (opens in a new tab) instead of a mailto:, which silently does nothing for
  // visitors with no default mail client. The address stays visible as text.
  contactComposeUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${CONTACT_EMAIL}`,

  // Canonical site URL (no trailing slash).
  // TODO: replace with your real production domain.
  siteUrl: 'https://meethril.com',

  // Shown as "Last updated" on each policy. Update when you change the text.
  lastUpdated: 'May 30, 2026',

  // Third-party processors your app actually uses. Keep this list honest and
  // current — it's the backbone of an accurate privacy policy.
  processors: [
    { name: 'Supabase', purpose: 'Authentication & database hosting', link: 'https://supabase.com/privacy' },
    { name: 'Vercel', purpose: 'Application hosting & delivery', link: 'https://vercel.com/legal/privacy-policy' },
    { name: 'Lemon Squeezy', purpose: 'Payments & subscription billing (Merchant of Record)', link: 'https://www.lemonsqueezy.com/privacy' },
    { name: 'Resend', purpose: 'Transactional & notification email', link: 'https://resend.com/legal/privacy-policy' },
  ],
} as const
