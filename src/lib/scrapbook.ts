// Scrapbook canvas — types & helpers

import type { ThemeName } from '@/lib/themes'

export type ScrapbookItemType =
  | 'text' | 'sticker' | 'photo' | 'song' | 'doodle'
  | 'clip' | 'stamp' | 'date'

export interface BaseItem {
  id: string
  // All coords are % of canvas (0–100)
  x: number
  y: number
  width: number
  height: number
  rotation: number // degrees
  z: number
}

export interface TextItemData extends BaseItem {
  type: 'text'
  text: string
  color: string // ink color
  bg: string // sticky note background
  tape: string // little tape strip color at top
  fontFamily: 'caveat' | 'playfair'
  fontSize: number // px at canvas's reference width
}

// Colorful sticky-note palettes — cycled when adding text items so a
// page naturally builds up a varied palette without choice paralysis.
export const NOTE_PALETTE = [
  { bg: '#fde68a', color: '#5a4020', tape: '#f3c74a' }, // sunny
  { bg: '#fbcfe8', color: '#5a2046', tape: '#e58cb4' }, // pink
  { bg: '#bae6fd', color: '#1a3a5a', tape: '#6fb6d8' }, // sky
  { bg: '#bbf7d0', color: '#1a4a2a', tape: '#7fc991' }, // mint
  { bg: '#fed7aa', color: '#5a2a1a', tape: '#ee9a66' }, // peach
  { bg: '#ddd6fe', color: '#3a2a5a', tape: '#a392e0' }, // lavender
]

export function isEditableType(type: ScrapbookItemType): boolean {
  return (
    type === 'text' ||
    type === 'photo' ||
    type === 'song' ||
    type === 'doodle' ||
    type === 'clip' ||
    type === 'stamp'
  )
}

export interface StickerItemData extends BaseItem {
  type: 'sticker'
  stickerId: string
}

export interface PhotoItemData extends BaseItem {
  type: 'photo'
  // Three storage modes resolved by usePhotoSrc:
  //   - data: URL          → legacy inline (pre-storage-adapter scrapbooks)
  //   - /api/photos/{h}    → non-E2EE handle, bytes live in the photo adapter
  //   - null + encryptedRef → E2EE; the {handle, iv} reference is encrypted
  src: string | null
  encryptedRef?: string    // E2EE-encrypted JSON of {handle, iv}
  encryptedRefIV?: string  // IV for the ref above
  caption?: string
  polaroid: boolean
}

export interface SongItemData extends BaseItem {
  type: 'song'
  url: string
  title: string
  provider: 'spotify' | 'youtube' | 'apple' | 'soundcloud' | 'itunes' | 'unknown'
}

export interface DoodleStroke {
  points: [number, number, number?][]
  color: string
  size: number
}

export interface DoodleItemData extends BaseItem {
  type: 'doodle'
  strokes: DoodleStroke[]
}

export type ClipVariant = 'index-card' | 'ticket-stub' | 'receipt'

export interface ClipItemData extends BaseItem {
  type: 'clip'
  variant: ClipVariant
  lines: string[] // e.g. ['L TRAIN · 04·28·26', 'Bedford → 1st']
}

export interface StampItemData extends BaseItem {
  type: 'stamp'
  topLine: string
  midLine: string
  bottomLine: string
  ink: 'red' | 'blue' | 'black'
}

export interface DateItemData extends BaseItem {
  type: 'date'
  isoDate: string         // 'YYYY-MM-DD' — captured at creation, never changes
}

export type ScrapbookItem =
  | TextItemData
  | StickerItemData
  | PhotoItemData
  | SongItemData
  | DoodleItemData
  | ClipItemData
  | StampItemData
  | DateItemData

export function makeId(): string {
  return Math.random().toString(36).slice(2, 11)
}

// Random tilt between -4° and +4° — never zero, that's the trick
export function randomTilt(): number {
  const sign = Math.random() < 0.5 ? -1 : 1
  return sign * (1 + Math.random() * 3)
}

export function nextZ(items: ScrapbookItem[]): number {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.z)) + 1
}

export function makeTextItem(text: string, items: ScrapbookItem[]): TextItemData {
  // Cycle palette by text-item count so adding feels varied but
  // deterministic — every Nth note is the same color.
  const textCount = items.filter((i) => i.type === 'text').length
  const swatch = NOTE_PALETTE[textCount % NOTE_PALETTE.length]
  return {
    id: makeId(),
    type: 'text',
    x: 30 + ((textCount * 7) % 18),
    y: 30 + ((textCount * 11) % 18),
    width: 28,
    height: 18,
    rotation: randomTilt(),
    z: nextZ(items),
    text,
    color: swatch.color,
    bg: swatch.bg,
    tape: swatch.tape,
    fontFamily: 'caveat',
    fontSize: 26,
  }
}

export function makeStickerItem(stickerId: string, items: ScrapbookItem[]): StickerItemData {
  // Washi tape is wider than it is tall; default to a strip shape
  const isWashi = stickerId === 'washi-tape'
  return {
    id: makeId(),
    type: 'sticker',
    x: isWashi ? 30 : 45,
    y: 45,
    width: isWashi ? 40 : 12,
    height: isWashi ? 6 : 12,
    rotation: randomTilt(),
    z: nextZ(items),
    stickerId,
  }
}

export function makePhotoItem(
  src: string | null,
  items: ScrapbookItem[],
): PhotoItemData {
  return {
    id: makeId(),
    type: 'photo',
    x: 30,
    y: 30,
    width: 28,
    height: 32,
    rotation: randomTilt(),
    z: nextZ(items),
    src,
    polaroid: true,
  }
}

export function makeSongItem(url: string, items: ScrapbookItem[]): SongItemData {
  return {
    id: makeId(),
    type: 'song',
    x: 30,
    y: 50,
    width: 40,
    height: 12,
    rotation: randomTilt(),
    z: nextZ(items),
    url,
    title: parseSongTitle(url),
    provider: parseSongProvider(url),
  }
}

export function makeDoodleItem(items: ScrapbookItem[]): DoodleItemData {
  return {
    id: makeId(),
    type: 'doodle',
    x: 35,
    y: 40,
    width: 30,
    height: 30,
    rotation: randomTilt(),
    z: nextZ(items),
    strokes: [],
  }
}

export function deriveSongMeta(url: string): { title: string; provider: SongItemData['provider'] } {
  const trimmed = url.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed._h === 'itunes') {
        return { title: parsed.t || 'Song', provider: 'itunes' }
      }
    } catch {
      // not JSON → fall through
    }
  }
  return { title: parseSongTitle(url), provider: parseSongProvider(url) }
}

export function getSongEmbedUrl(item: SongItemData): { src: string; height: number } | null {
  if (item.provider === 'itunes') return null
  const url = item.url
  if (item.provider === 'youtube') {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/)
    if (m) return { src: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1`, height: 180 }
  }
  if (item.provider === 'spotify') {
    const m = url.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/)
    if (m) return { src: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator`, height: 80 }
  }
  if (item.provider === 'apple') {
    return { src: url.replace('://music.apple.com', '://embed.music.apple.com'), height: 175 }
  }
  if (item.provider === 'soundcloud') {
    return {
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&color=%23ff7700&visual=false`,
      height: 120,
    }
  }
  return null
}

function parseSongProvider(url: string): SongItemData['provider'] {
  const trimmed = url.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed._h === 'itunes') return 'itunes'
    } catch {
      // not JSON → fall through to URL checks
    }
  }
  const u = url.toLowerCase()
  if (u.includes('spotify.com')) return 'spotify'
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('music.apple.com')) return 'apple'
  if (u.includes('soundcloud.com')) return 'soundcloud'
  return 'unknown'
}

function parseSongTitle(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed._h === 'itunes') return parsed.t || 'Song'
    } catch {
      // not JSON → fall through
    }
  }
  // Best-effort: pull a slug out of common URLs. We deliberately skip
  // opaque IDs (YouTube video IDs, raw track hashes) and fall back to
  // a human label — users can rename inline.
  const provider = parseSongProvider(url)
  try {
    const u = new URL(url)
    const segments = u.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1] || ''

    // YouTube + short links: opaque 11-char IDs. Don't show these.
    if (provider === 'youtube') return 'a youtube song'

    // Spotify track/album/playlist URLs end in a 22-char base62 ID
    // and have a slug-free path — show provider rather than the ID.
    if (provider === 'spotify') return 'a spotify track'

    // Apple Music: paths often include a song slug like
    // /us/album/song-name/1234?i=5678 — pull the slug.
    if (provider === 'apple') {
      const slug = segments.find(
        (s) => /[a-z]/i.test(s) && !/^\d+$/.test(s) && s.length < 60,
      )
      if (slug) return decodeURIComponent(slug).replace(/-/g, ' ')
      return 'an apple music track'
    }

    // SoundCloud: /artist/track-name
    if (provider === 'soundcloud' && last) {
      return decodeURIComponent(last).replace(/-/g, ' ').slice(0, 60)
    }

    if (last && /[a-z]/i.test(last) && last.length < 60) {
      return decodeURIComponent(last).replace(/-/g, ' ')
    }
    return u.hostname
  } catch {
    return 'a song'
  }
}

export function clampToCanvas(item: ScrapbookItem): ScrapbookItem {
  // Allow items to peek slightly off the edge for that scrapbook feel
  const minX = -5
  const maxX = 100 - item.width + 5
  const minY = -5
  const maxY = 100 - item.height + 5
  return {
    ...item,
    x: Math.max(minX, Math.min(maxX, item.x)),
    y: Math.max(minY, Math.min(maxY, item.y)),
  }
}

export function lockAspectFor(type: ScrapbookItemType): boolean {
  return type === 'sticker' || type === 'photo'
}

export function minSizeFor(type: ScrapbookItemType): { w: number; h: number } {
  switch (type) {
    case 'sticker': return { w: 4, h: 4 }
    case 'text':    return { w: 12, h: 4 }
    case 'photo':   return { w: 12, h: 12 }
    case 'song':    return { w: 22, h: 6 }
    case 'doodle':  return { w: 12, h: 12 }
    case 'clip':    return { w: 16, h: 6 }
    case 'stamp':   return { w: 10, h: 10 }
    case 'date':    return { w: 14, h: 4 }
  }
}

export function makeClipItem(
  variant: ClipVariant,
  lines: string[],
  items: ScrapbookItem[],
): ClipItemData {
  const sizeByVariant: Record<ClipVariant, { width: number; height: number }> = {
    'index-card': { width: 26, height: 14 },
    'ticket-stub': { width: 24, height: 8 },
    'receipt': { width: 16, height: 14 },
  }
  const { width, height } = sizeByVariant[variant]
  return {
    id: makeId(),
    type: 'clip',
    x: 35,
    y: 50,
    width,
    height,
    rotation: randomTilt(),
    z: nextZ(items),
    variant,
    lines,
  }
}

export function makeStampItem(
  topLine: string,
  midLine: string,
  bottomLine: string,
  items: ScrapbookItem[],
): StampItemData {
  return {
    id: makeId(),
    type: 'stamp',
    x: 70,
    y: 30,
    width: 14,
    height: 14,
    rotation: randomTilt() * 1.5,
    z: nextZ(items),
    topLine,
    midLine,
    bottomLine,
    ink: 'red',
  }
}

export function makeDateItem(date: Date, items: ScrapbookItem[]): DateItemData {
  // Use local-date fields, not toISOString — toISOString shifts to UTC and
  // can produce yesterday's date for users west of GMT in the evening.
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const iso = `${yyyy}-${mm}-${dd}`
  return {
    id: makeId(),
    type: 'date',
    x: 42,
    y: 6,
    width: 22,
    height: 6,
    rotation: -1,
    z: nextZ(items),
    isoDate: iso,
  }
}

export type AttachmentKind =
  | 'pin'           // push-pin top-center
  | 'tape'          // washi tape top edge
  | 'corners'       // photo corners (four corners)
  | 'grommets'      // two grommets on left edge
  | 'paper-clip'    // tiny clip top-left
  | 'none'          // no attachment

export function attachmentForItem(item: ScrapbookItem): AttachmentKind {
  switch (item.type) {
    case 'text':    return 'pin'
    case 'photo':   return hashId(item.id) % 2 === 0 ? 'tape' : 'pin'
    case 'song':    return 'tape'
    case 'doodle':  return 'corners'
    case 'sticker': return 'none'
    case 'stamp':   return 'none'
    case 'date':    return 'pin'
    case 'clip':
      if (item.variant === 'ticket-stub') return 'grommets'
      if (item.variant === 'receipt')     return 'paper-clip'
      return 'pin'
  }
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Theme-aware paper presets. Each is a hand-tuned "sheet" — the base color
// is the paper itself (always muted / paper-like, never saturated), and the
// highlight / shadow / grain values give the page its depth.
export interface PaperPreset {
  base: string
  grain: string
  highlight: string // soft warm glow (top-left radial)
  shadow: string    // soft cool shade (bottom-right radial)
}

const PAPER_PRESETS: Record<ThemeName, PaperPreset> = {
  // kraft cream — warm cozy brown undertones
  hearth: {
    base: '#e8d8b0',
    grain: 'rgba(120, 80, 30, 0.06)',
    highlight: 'rgba(255, 240, 200, 0.45)',
    shadow: 'rgba(120, 80, 30, 0.10)',
  },
  // forest tan — slight olive undertone for sunset / woodland mood
  rivendell: {
    base: '#d8c8a0',
    grain: 'rgba(80, 70, 30, 0.07)',
    highlight: 'rgba(245, 230, 190, 0.40)',
    shadow: 'rgba(70, 60, 25, 0.12)',
  },
  // blush cream — dusty rose-tinted paper
  rose: {
    base: '#f0ddd0',
    grain: 'rgba(140, 80, 80, 0.05)',
    highlight: 'rgba(255, 235, 230, 0.45)',
    shadow: 'rgba(140, 70, 80, 0.10)',
  },
  // sage linen — warm cream with green undertone
  sage: {
    base: '#e0dcba',
    grain: 'rgba(90, 100, 50, 0.06)',
    highlight: 'rgba(245, 240, 210, 0.42)',
    shadow: 'rgba(80, 90, 45, 0.10)',
  },
  // cool cream — pale greyish paper for ocean palette
  ocean: {
    base: '#dcdcc8',
    grain: 'rgba(60, 70, 80, 0.06)',
    highlight: 'rgba(240, 240, 230, 0.42)',
    shadow: 'rgba(40, 60, 70, 0.10)',
  },
  // manila / buff — kraft envelope paper
  postal: {
    base: '#e0cfa8',
    grain: 'rgba(110, 75, 30, 0.07)',
    highlight: 'rgba(245, 230, 195, 0.42)',
    shadow: 'rgba(95, 60, 25, 0.12)',
  },
  // soft linen — clean off-white sheet
  linen: {
    base: '#efe8d4',
    grain: 'rgba(120, 95, 50, 0.05)',
    highlight: 'rgba(255, 248, 230, 0.45)',
    shadow: 'rgba(110, 85, 45, 0.09)',
  },
  // golden-hour peach — warm paper kissed by sunset light
  sunset: {
    base: '#f4d4b0',
    grain: 'rgba(160, 70, 40, 0.06)',
    highlight: 'rgba(255, 230, 200, 0.48)',
    shadow: 'rgba(150, 60, 40, 0.12)',
  },
  // cool slate cream — damp, overcast paper with a faint blue undertone
  rain: {
    base: '#d6dae0',
    grain: 'rgba(50, 70, 95, 0.07)',
    highlight: 'rgba(232, 238, 246, 0.42)',
    shadow: 'rgba(40, 60, 85, 0.12)',
  },
}

export function paperForTheme(themeName: ThemeName): PaperPreset {
  return PAPER_PRESETS[themeName] ?? PAPER_PRESETS.firelight
}
