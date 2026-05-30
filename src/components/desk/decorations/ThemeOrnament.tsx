import { ThemeName } from '@/lib/themes'

const ornaments: Record<ThemeName, React.ReactNode> = {
  rivendell: (
    <>
      <path
        d="M16 4 C 10 8, 8 16, 14 24 C 20 28, 26 22, 26 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M14 24 L 12 28 M 14 24 L 16 28"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </>
  ),
  firelight: (
    <>
      <path
        d="M16 4 Q 12 10 14 16 Q 10 14 12 22 Q 14 28 18 26 Q 22 22 20 16 Q 18 12 16 4 Z"
        fill="currentColor"
      />
    </>
  ),
  rose: (
    <>
      <circle cx="16" cy="9" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="22" cy="14" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="20" cy="22" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="12" cy="22" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="10" cy="14" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </>
  ),
  sage: (
    <>
      <path d="M16 6 Q 10 12 16 18 Q 22 12 16 6 Z" fill="currentColor" />
      <path d="M16 18 Q 22 16 26 22 Q 22 24 18 22 Z" fill="currentColor" />
      <path d="M16 18 Q 10 16 6 22 Q 10 24 14 22 Z" fill="currentColor" />
      <line
        x1="16"
        y1="18"
        x2="16"
        y2="28"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </>
  ),
  ocean: (
    <>
      <path
        d="M4 16 Q 8 10 12 16 T 20 16 T 28 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M4 22 Q 8 16 12 22 T 20 22 T 28 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  ),
  postal: (
    <>
      <rect x="6" y="10" width="20" height="14" fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M6 10 L 16 18 L 26 10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  linen: (
    <>
      <line x1="16" y1="5" x2="16" y2="27" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line
        x1="6.5"
        y1="10.5"
        x2="25.5"
        y2="21.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line
        x1="6.5"
        y1="21.5"
        x2="25.5"
        y2="10.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <line x1="13" y1="8" x2="16" y2="11" stroke="currentColor" strokeWidth="0.7" />
      <line x1="19" y1="8" x2="16" y2="11" stroke="currentColor" strokeWidth="0.7" />
      <line x1="13" y1="24" x2="16" y2="21" stroke="currentColor" strokeWidth="0.7" />
      <line x1="19" y1="24" x2="16" y2="21" stroke="currentColor" strokeWidth="0.7" />
    </>
  ),
  sunset: (
    <>
      {/* Half-sun on the horizon */}
      <path
        d="M6 20 A 10 10 0 0 1 26 20"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Horizon line */}
      <line
        x1="3"
        y1="20"
        x2="29"
        y2="20"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Three rays above the sun */}
      <line x1="16" y1="6" x2="16" y2="9" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <line x1="9" y1="9" x2="11" y2="11" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="23" y1="9" x2="21" y2="11" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
      {/* Reflection ripples below */}
      <line x1="9" y1="24" x2="23" y2="24" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
      <line x1="11" y1="27" x2="21" y2="27" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
    </>
  ),
  rain: (
    <>
      {/* Soft cloud */}
      <path
        d="M9 14 Q 7 14 7 11.5 Q 7 9 10 9 Q 11 6.5 14 6.5 Q 17.5 6.5 18.5 9 Q 22 9 23 11 Q 25 11.5 25 13.5 Q 25 15 23 15 L 10 15 Q 9 15 9 14 Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Three falling raindrops */}
      <path d="M12 19 L 11 22 Q 11 23 12 23 Q 13 23 13 22 Z" fill="currentColor" opacity="0.85" />
      <path d="M16 21 L 15 24 Q 15 25 16 25 Q 17 25 17 24 Z" fill="currentColor" opacity="0.85" />
      <path d="M20 19 L 19 22 Q 19 23 20 23 Q 21 23 21 22 Z" fill="currentColor" opacity="0.85" />
    </>
  ),
}

interface ThemeOrnamentProps {
  themeName: ThemeName
  color: string
  size?: number
  flip?: boolean
}

export default function ThemeOrnament({
  themeName,
  color,
  size = 36,
  flip = false,
}: ThemeOrnamentProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{ color, transform: flip ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
    >
      {ornaments[themeName]}
    </svg>
  )
}
