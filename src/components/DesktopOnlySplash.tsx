'use client'

import Link from 'next/link'

/**
 * Shown in place of the app on phones/tablets while the mobile experience is
 * paused. Self-contained, brand-static (not theme-dependent) so it renders
 * consistently whether the visitor is logged in or not. Only the home (`/`)
 * and pricing (`/pricing`) pages remain reachable on handhelds — links below
 * point back to them.
 */
export default function DesktopOnlySplash() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        background:
          'radial-gradient(120% 120% at 50% 0%, #fbf3e8 0%, #f3e6d6 55%, #ecdac6 100%)',
        color: '#3d342a',
        fontFamily: 'Georgia, "Times New Roman", serif',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            fontSize: 13,
            letterSpacing: '0.42em',
            textTransform: 'uppercase',
            color: '#9c7a55',
            paddingLeft: '0.42em',
          }}
        >
          Meethril
        </div>

        {/* Small mark */}
        <div aria-hidden style={{ fontSize: 30, lineHeight: 1, opacity: 0.8 }}>
          ✶
        </div>

        <h1 style={{ fontSize: 26, lineHeight: 1.3, fontWeight: 400, margin: 0 }}>
          Meethril is made for quiet evenings at your desk.
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#6b5d4d', margin: 0 }}>
          For now it lives on laptops and computers, where there&apos;s room to
          slow down and write. Please open it there.
        </p>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#8a7a63', margin: 0 }}>
          A mobile app is on its way — coming soon.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 8,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Link
            href="/"
            style={{
              padding: '11px 22px',
              borderRadius: 999,
              background: '#3d342a',
              color: '#f7efe4',
              textDecoration: 'none',
              fontSize: 14,
              letterSpacing: '0.02em',
            }}
          >
            Home
          </Link>
          <Link
            href="/pricing"
            style={{
              padding: '11px 22px',
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid #c9b49a',
              color: '#5a4d3d',
              textDecoration: 'none',
              fontSize: 14,
              letterSpacing: '0.02em',
            }}
          >
            Pricing
          </Link>
        </div>
      </div>
    </div>
  )
}
