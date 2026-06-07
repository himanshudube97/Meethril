'use client'

import { useThemeStore } from '@/store/theme'

// Shared body for App Router `error.tsx` files. Renders a calm recovery
// screen with a reset button. The route segment stays mounted while this
// shows, so reset re-renders the children without a full page reload.
export default function RouteErrorBoundary({
  error,
  reset,
  context,
}: {
  error: Error & { digest?: string }
  reset: () => void
  context?: string
}) {
  const theme = useThemeStore((s) => s.theme)
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        color: theme?.text?.primary ?? '#3d342a',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h2 style={{ fontSize: 22, marginBottom: 12 }}>
          This corner of Meethril wobbled.
        </h2>
        <p style={{ opacity: 0.7, marginBottom: 24, lineHeight: 1.6, fontSize: 15 }}>
          {context
            ? `Something went wrong loading ${context}. Your data is safe.`
            : 'Something went wrong loading this view. Your data is safe.'}
        </p>
        <button
          onClick={reset}
          style={{
            padding: '10px 22px',
            background: theme?.text?.primary ?? '#3d342a',
            color: theme?.bg?.primary ?? '#f6efe2',
            border: 'none',
            borderRadius: 999,
            fontFamily: 'inherit',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        {error.digest && (
          <p style={{ opacity: 0.35, fontSize: 11, marginTop: 20 }}>
            error id: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
