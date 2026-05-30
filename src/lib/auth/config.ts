export const isDevAuth = process.env.USE_DEV_AUTH === 'true'

// Never fall back to a public string when dev auth is enabled — that would let
// anyone with the repo forge JWTs as any user the moment a staging/prod env
// accidentally flips USE_DEV_AUTH on without setting the secret.
function resolveDevJwtSecret(): string {
  const fromEnv = process.env.DEV_JWT_SECRET
  if (fromEnv && fromEnv.length >= 32) return fromEnv

  if (isDevAuth) {
    throw new Error(
      'DEV_JWT_SECRET must be set (min 32 chars) when USE_DEV_AUTH=true. ' +
        'Generate one with `openssl rand -hex 32`.',
    )
  }
  // When dev auth is off we never read this value at runtime, so any sentinel
  // is fine — return a clearly-bogus placeholder so misuse fails loudly.
  return 'dev-auth-disabled'
}

export const DEV_JWT_SECRET = resolveDevJwtSecret()
export const AUTH_COOKIE_NAME = 'meethril-auth-token'
