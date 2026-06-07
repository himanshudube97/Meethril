/**
 * Client-side mirror of the public-path lists in `src/middleware.ts`.
 *
 * The middleware is the authoritative server-side auth boundary, but it can't
 * stop the client from *rendering* a protected page before `fetchUser()`
 * resolves, and it doesn't know which routes should suppress the global E2EE
 * modals. These helpers give client components (AuthGate, E2EEProvider) the
 * same notion of "public" so the two layers agree.
 *
 * Keep this in sync with PUBLIC_PATHS / PUBLIC_EXACT_PATHS in middleware.ts.
 */

// Routes that render without an authenticated user. `/api/*` is omitted —
// these helpers only ever see page pathnames.
const PUBLIC_EXACT = ['/', '/pricing', '/forgot', '/reset', '/verify', '/download', '/privacy', '/terms']
const PUBLIC_PREFIXES = ['/login', '/onboarding', '/letter']

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Whether the global E2EE setup/unlock/recovery modals may surface on this
 * route. They must never appear over the pre-auth pages (login, landing,
 * pricing, password reset, onboarding) — that's the "daily-key modal pops up
 * before login" bug. The one public exception is the friend-letter save flow
 * (`/letter/[token]/save`), which authenticates in-page and legitimately
 * drives SetupModal to mint the recipient's master key.
 *
 * The bare letter VIEW (`/letter/[token]`) must NOT surface them: a recipient
 * who happens to be logged in (with a locked journal) would otherwise get the
 * daily-key unlock modal dropped on top of someone else's letter. The letter
 * decrypts with its own answer-derived letterKey — the viewer's journal master
 * key is never needed to read it.
 */
export function allowsE2EEModals(pathname: string): boolean {
  if (pathname.startsWith('/letter/')) return pathname.endsWith('/save')
  return !isPublicRoute(pathname)
}
