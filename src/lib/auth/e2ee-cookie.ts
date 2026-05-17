// Cookie name must stay in sync with the local const in src/middleware.ts
// (middleware keeps its own copy to stay safe on the edge runtime).
export const E2EE_ONBOARDED_COOKIE = 'hearth-e2ee-onboarded'

export const E2EE_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
}
