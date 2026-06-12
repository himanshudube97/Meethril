import type { MetadataRoute } from 'next'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://meethril.com').replace(/\/+$/, '')

// Allow crawling of the public marketing/legal surface; keep the API and the
// auth-gated app internals out of the index. Auth-gated routes already redirect
// to /login, but disallowing them avoids wasted crawl budget on redirects.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/onboarding',
        '/calendar',
        '/letters',
        '/me',
        '/memory',
        '/scrapbook',
        '/shelf',
        '/timeline',
        '/write',
        '/security',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
