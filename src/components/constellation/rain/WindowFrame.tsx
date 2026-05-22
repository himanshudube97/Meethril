'use client'

interface WindowFrameProps {
  children: React.ReactNode
}

// A single tall window pane wrapped in a slim dusty-bone wooden frame.
// The frame is purely chrome — `children` occupy the glass area.
export function WindowFrame({ children }: WindowFrameProps) {
  const frameColor = '#c8c4ba'
  const frameShadow = '#7a766b'
  const frameHighlight = '#e3dfd2'

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="relative"
        style={{
          width: 'min(82vw, 640px)',
          height: 'min(88vh, 860px)',
          maxHeight: '92vh',
          pointerEvents: 'auto',
        }}
      >
        {/* Outer wood frame */}
        <div
          className="absolute inset-0 rounded-[6px]"
          style={{
            background: `linear-gradient(180deg, ${frameHighlight} 0%, ${frameColor} 45%, ${frameShadow} 100%)`,
            boxShadow: `
              0 24px 80px rgba(0,0,0,0.55),
              0 0 0 1px rgba(0,0,0,0.4),
              inset 0 1px 0 rgba(255,255,255,0.35)
            `,
          }}
        />

        {/* Inner glass area — inset by frame thickness */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: '60px',
            bottom: '60px',
            left: '40px',
            right: '40px',
            background: 'rgba(20, 28, 40, 0.45)',
            boxShadow: `
              inset 0 0 0 1px rgba(0,0,0,0.45),
              inset 0 0 24px rgba(0,0,0,0.45),
              inset 0 0 80px rgba(80, 110, 150, 0.08)
            `,
          }}
        >
          {children}

          {/* Glass tint — subtle vertical gradient (top darker, like sky) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, rgba(90,100,112,0.10) 0%, rgba(90,100,112,0.03) 50%, rgba(90,100,112,0.08) 100%)',
            }}
          />

          {/* Condensation fog along the edges */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(220,228,240,0.06) 85%, rgba(220,228,240,0.14) 100%)',
            }}
          />

          {/* Warm reflection from an unseen lamp inside the room */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '-10%',
              right: '-20%',
              width: '55%',
              height: '60%',
              background:
                'radial-gradient(ellipse at 75% 30%, rgba(252, 220, 170, 0.13) 0%, rgba(252, 220, 170, 0.05) 40%, transparent 70%)',
              filter: 'blur(6px)',
            }}
          />
        </div>

        {/* Frame highlight along the inner edge — sells the wood as raised */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '58px',
            bottom: '58px',
            left: '38px',
            right: '38px',
            boxShadow: `
              inset 0 2px 4px rgba(255,255,255,0.4),
              inset 0 -2px 4px rgba(0,0,0,0.35)
            `,
            borderRadius: '2px',
          }}
        />
      </div>
    </div>
  )
}
