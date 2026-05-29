import { Theme } from './themes'

/**
 * Color set for the glass diary, derived from the active page theme.
 * Every visual on the diary's pages, spine, ribbon, and accents reads from here.
 */
export interface GlassDiaryColors {
  pageBg: string
  /** Same hue as pageBg but with alpha forced to 1. Used as the base for
   *  the "page opacity" mix in CSS so 100% really means fully opaque. */
  pageBgSolid: string
  pageBlur: string
  pageBorder: string
  ruledLine: string
  sectionLabel: string
  prompt: string
  date: string
  bodyText: string
  photoBorder: string
  doodleBorder: string
  doodleBg: string
  ribbon: string
  saveButton: string
  buttonBg: string
  buttonBorder: string
  /** Darker theme-derived fill for the hardcover frame around the spread. */
  cover: string
  /** Even darker tone for the cover's inset border line. */
  coverBorder: string
}

const stripAlpha = (rgba: string): string => {
  // rgba(r, g, b, a) → rgb(r, g, b). Pass-through for hex / named colors.
  const m = rgba.match(/rgba?\(([^)]+)\)/i)
  if (!m) return rgba
  const [r, g, b] = m[1].split(',').map((s) => s.trim())
  return `rgb(${r}, ${g}, ${b})`
}

const withAlpha = (hex: string, alpha: number): string => {
  // Convert a #RGB or #RRGGBB hex to rgba(...). Falls back to passing through.
  const trimmed = hex.trim()
  if (!trimmed.startsWith('#')) return trimmed
  const cleaned = trimmed.length === 4
    ? '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]
    : trimmed
  const r = parseInt(cleaned.slice(1, 3), 16)
  const g = parseInt(cleaned.slice(3, 5), 16)
  const b = parseInt(cleaned.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const warm = (theme: Theme, alpha: number): string =>
  withAlpha(theme.accent.warm, alpha)

// Relative luminance (0 = black, 1 = white) of a hex or rgb(a) colour, used to
// decide whether the writing surface is light enough for the warm-accent ruled
// lines / day numbers to read against it.
const relLuminance = (color: string): number => {
  const c = color.trim()
  let r: number, g: number, b: number
  const m = c.match(/rgba?\(([^)]+)\)/i)
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()))
    ;[r, g, b] = parts
  } else if (c.startsWith('#')) {
    const cleaned = c.length === 4
      ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
      : c
    r = parseInt(cleaned.slice(1, 3), 16)
    g = parseInt(cleaned.slice(3, 5), 16)
    b = parseInt(cleaned.slice(5, 7), 16)
  } else {
    return 1 // unknown format → assume light so we keep the warm default
  }
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const darken = (hex: string, factor: number): string => {
  // Multiply each channel by (1 - factor). factor=0 → unchanged, factor=1 → black.
  const trimmed = hex.trim()
  if (!trimmed.startsWith('#')) return trimmed
  const cleaned = trimmed.length === 4
    ? '#' + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3]
    : trimmed
  const r = Math.round(parseInt(cleaned.slice(1, 3), 16) * (1 - factor))
  const g = Math.round(parseInt(cleaned.slice(3, 5), 16) * (1 - factor))
  const b = Math.round(parseInt(cleaned.slice(5, 7), 16) * (1 - factor))
  return `rgb(${r}, ${g}, ${b})`
}

export function getGlassDiaryColors(theme: Theme): GlassDiaryColors {
  // The diary's writing surface can be decoupled from the outer chrome via
  // `theme.paper` — used by themes that want a dark scene with light paper
  // (Rain) without darkening every other text surface in the app.
  const paperBg = theme.paper?.bg ?? theme.glass.bg
  const paperText = theme.paper?.text ?? theme.text.primary

  // On clearly-light paper the warm-accent ruled lines and day numbers read
  // fine (rose, sunset, sage…). On mid-tone or dark paper (rain's grey-blue,
  // rivendell's dark green) the warm tan/gold blends into the surface and goes
  // invisible — so derive those marks from the paper's own ink colour, which
  // is chosen to contrast with the paper by definition.
  const lightPaper = relLuminance(stripAlpha(paperBg)) > 0.6
  const ruledLine = lightPaper ? warm(theme, 0.28) : withAlpha(paperText, 0.3)
  const dateMark = lightPaper ? warm(theme, 0.85) : withAlpha(paperText, 0.85)

  return {
    pageBg: paperBg,
    pageBgSolid: stripAlpha(paperBg),
    pageBlur: theme.glass.blur,
    pageBorder: warm(theme, 0.18),
    ruledLine,
    sectionLabel: withAlpha(paperText, 0.95),
    prompt: withAlpha(paperText, 0.7),
    date: dateMark,
    bodyText: paperText,
    photoBorder: warm(theme, 0.3),
    doodleBorder: warm(theme, 0.2),
    doodleBg: 'rgba(255, 255, 255, 0.03)',
    ribbon: theme.accent.primary,
    saveButton: theme.accent.warm,
    buttonBg: 'rgba(255, 255, 255, 0.06)',
    buttonBorder: warm(theme, 0.2),
    cover: theme.cover ?? darken(theme.accent.primary, 0.35),
    coverBorder: darken(theme.cover ?? darken(theme.accent.primary, 0.35), 0.4),
  }
}
