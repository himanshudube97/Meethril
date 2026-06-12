import { ImageResponse } from 'next/og'

// Dynamic 1200x630 social share card. Next.js auto-injects this as og:image
// (and, via twitter-image.tsx re-export, twitter:image) on every page that
// doesn't override it. Warm sunset palette matches Meethril's brand.
export const alt = 'Meethril — a hush at the end of the day, kept just for you'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background:
            'linear-gradient(180deg, #FFE2BC 0%, #FFB888 35%, #F08A6B 65%, #B85E5C 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3A1F26',
          padding: 80,
          position: 'relative',
        }}
      >
        {/* soft warm ambient glow */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: 9999,
            background: 'radial-gradient(circle, rgba(255,200,144,0.55) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -120,
            left: -100,
            width: 420,
            height: 420,
            borderRadius: 9999,
            background: 'radial-gradient(circle, rgba(232,148,90,0.4) 0%, transparent 70%)',
          }}
        />

        <div
          style={{
            fontSize: 112,
            letterSpacing: 18,
            fontWeight: 500,
            marginBottom: 28,
            display: 'flex',
            textShadow: '0 2px 24px rgba(200,71,45,0.18)',
          }}
        >
          MEETHRIL
        </div>

        <div
          style={{
            fontSize: 38,
            fontStyle: 'italic',
            color: '#6E4248',
            marginBottom: 70,
            display: 'flex',
          }}
        >
          a hush at the end of the day
        </div>

        <div
          style={{
            fontSize: 20,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: '#9A7078',
            display: 'flex',
          }}
        >
          journaling · sealed letters · end-to-end encrypted
        </div>
      </div>
    ),
    { ...size }
  )
}
