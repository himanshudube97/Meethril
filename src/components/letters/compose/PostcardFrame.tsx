import type { CSSProperties } from 'react'

// Decorative illuminated frame shared by both postcard faces: a double accent
// rule around the edge plus small L-bracket corner pieces with a sparkle that
// echoes the drop-cap corner sparkles. Purely ornamental — it sits behind the
// content (zIndex 1–2) and never intercepts pointer events.
//
// Both faces render this in place of a bare single border so the paper reads
// as a finished piece of stationery rather than an empty rectangle.
const CORNER = 22

function cornerBracket(pos: CSSProperties, borders: CSSProperties): CSSProperties {
  return {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    pointerEvents: 'none',
    zIndex: 2,
    ...pos,
    ...borders,
  }
}

export function PostcardFrame({ accent }: { accent: string }) {
  const sparkle: CSSProperties = {
    position: 'absolute',
    color: accent,
    fontSize: 10,
    opacity: 0.7,
    lineHeight: 1,
    pointerEvents: 'none',
    zIndex: 2,
  }

  return (
    <>
      {/* Double rule — outer stronger, inner hairline. */}
      <div
        style={{
          position: 'absolute',
          inset: 12,
          border: `1px solid ${accent}45`,
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 17,
          border: `1px solid ${accent}22`,
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Corner brackets — accent L's that hug each corner of the rule. */}
      <div style={cornerBracket({ top: 9, left: 9 }, { borderTop: `1.5px solid ${accent}99`, borderLeft: `1.5px solid ${accent}99`, borderTopLeftRadius: 4 })} />
      <div style={cornerBracket({ top: 9, right: 9 }, { borderTop: `1.5px solid ${accent}99`, borderRight: `1.5px solid ${accent}99`, borderTopRightRadius: 4 })} />
      <div style={cornerBracket({ bottom: 9, left: 9 }, { borderBottom: `1.5px solid ${accent}99`, borderLeft: `1.5px solid ${accent}99`, borderBottomLeftRadius: 4 })} />
      <div style={cornerBracket({ bottom: 9, right: 9 }, { borderBottom: `1.5px solid ${accent}99`, borderRight: `1.5px solid ${accent}99`, borderBottomRightRadius: 4 })} />

      {/* Corner sparkles — tucked just inside each bracket elbow. */}
      <span style={{ ...sparkle, top: 14, left: 15 }}>✦</span>
      <span style={{ ...sparkle, top: 14, right: 15 }}>✦</span>
      <span style={{ ...sparkle, bottom: 14, left: 15 }}>✦</span>
      <span style={{ ...sparkle, bottom: 14, right: 15 }}>✦</span>

      {/* Mid-edge flourishes — a small diamond centered on each side so the long
          edges don't read as bare. */}
      <span style={{ ...sparkle, top: '50%', left: 12, transform: 'translateY(-50%)', fontSize: 11, opacity: 0.5 }}>❖</span>
      <span style={{ ...sparkle, top: '50%', right: 12, transform: 'translateY(-50%)', fontSize: 11, opacity: 0.5 }}>❖</span>
    </>
  )
}
