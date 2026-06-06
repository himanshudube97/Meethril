'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

// Catches render errors that escape the root layout. Must include its own
// <html> and <body> tags per Next.js App Router conventions. Without this,
// an unhandled render throw (e.g. a TipTap exception, a malformed decryption
// payload, a Framer Motion crash) produces a white-screen with no recovery.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Report the crash to Sentry (no-op when no DSN is configured).
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f6efe2',
          color: '#3d342a',
          fontFamily: 'Georgia, serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 440 }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went quiet.</h1>
          <p style={{ opacity: 0.7, marginBottom: 24, lineHeight: 1.6 }}>
            Hearth ran into an unexpected error. Your writing is safe — it lives on the server.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '12px 24px',
              background: '#3d342a',
              color: '#f6efe2',
              border: 'none',
              borderRadius: 999,
              fontFamily: 'inherit',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ opacity: 0.4, fontSize: 11, marginTop: 24 }}>
              error id: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
