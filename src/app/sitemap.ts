import type { MetadataRoute } from 'next'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://meethril.com').replace(/\/+$/, '')

// Only the public, indexable surface. App routes are auth-gated and excluded
// (see robots.ts). lastModified is a fixed build-time date rather than new
// Date() so the sitemap is deterministic across renders.
const LAST_MODIFIED = new Date('2026-06-13')

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number }> = [
    { path: '/', priority: 1 },
    { path: '/pricing', priority: 0.8 },
    { path: '/download', priority: 0.6 },
    { path: '/privacy', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
  ]

  return routes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: LAST_MODIFIED,
    changeFrequency: 'weekly',
    priority,
  }))
}
