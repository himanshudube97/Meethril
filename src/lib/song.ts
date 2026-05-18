// iTunes Search API response (only the fields we use)
export interface ItunesTrack {
  trackId: number
  trackName: string
  artistName: string
  artworkUrl100: string
  previewUrl: string
}

// On-disk JSON shape (short keys — kept inside encrypted journal/letter/scrapbook payloads)
interface ItunesStored {
  _h: 'itunes'
  id: string
  t: string
  a: string
  art: string
  p: string
}

// Parsed-for-rendering shape (verbose keys — used in components)
export type StoredSong =
  | { kind: 'itunes'; id: string; title: string; artist: string; art: string; preview: string }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'empty' }

const URL_RX = /^https?:\/\//i

export function parseStoredSong(value: string | null | undefined): StoredSong {
  if (!value) return { kind: 'empty' }
  const trimmed = value.trim()
  if (!trimmed) return { kind: 'empty' }

  // JSON discriminator path (iTunes pick)
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as ItunesStored
      if (parsed && parsed._h === 'itunes' && parsed.id && parsed.p) {
        return {
          kind: 'itunes',
          id: parsed.id,
          title: parsed.t ?? '',
          artist: parsed.a ?? '',
          art: parsed.art ?? '',
          preview: parsed.p,
        }
      }
    } catch {
      // not JSON → fall through to URL/text
    }
  }

  if (URL_RX.test(trimmed)) return { kind: 'url', url: trimmed }
  return { kind: 'text', text: trimmed }
}

export function serializeItunesSong(track: ItunesTrack): string {
  const payload: ItunesStored = {
    _h: 'itunes',
    id: String(track.trackId),
    t: track.trackName,
    a: track.artistName,
    art: track.artworkUrl100,
    p: track.previewUrl,
  }
  return JSON.stringify(payload)
}

// iTunes serves cover art at any square size by string replacement.
// Default `artworkUrl100` ends in `.../100x100bb.jpg`; we typically render at 300 for Retina.
export function highResArt(url: string, size = 300): string {
  if (!url) return url
  return url.replace(/\d+x\d+bb/, `${size}x${size}bb`)
}

// Public Apple Music page for a track id — used as the error/fallback link.
export function appleMusicLink(id: string): string {
  return `https://music.apple.com/song/${id}`
}

export async function searchItunes(
  query: string,
  signal?: AbortSignal
): Promise<ItunesTrack[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&limit=8&country=US`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`)
  const json = await res.json()
  const results = Array.isArray(json?.results) ? json.results : []
  // Drop any track without a playable preview — keeps the dropdown clean.
  return results.filter(
    (r: Partial<ItunesTrack>) => r && r.trackId && r.previewUrl && r.trackName
  ) as ItunesTrack[]
}
