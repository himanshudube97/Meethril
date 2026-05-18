# Song Picker (iTunes search + URL paste) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before executing Task 1, use `superpowers:using-git-worktrees` to create an isolated worktree off `main` (the user has explicitly requested this work happen in a separate worktree, not the current `feat/letters-password-e2ee` branch).

**Goal:** Replace Hearth's "paste a song URL" UX with an Instagram-style search-and-pick flow using the iTunes Search API, while keeping URL paste as a fallback for full-track playback.

**Architecture:** A new `SongPicker` component (search input + iTunes results dropdown + URL short-circuit) and an extended `SongEmbed` (new vinyl-with-album-art rendering for iTunes-sourced songs). Storage stays as a single string field — iTunes picks are serialized as a small JSON blob with a `_h: "itunes"` discriminator, so no schema migration. A tiny zustand store enforces global single-song playback.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, Zustand, Framer Motion, native `<audio>` for 30s previews. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-18-song-picker-itunes-search-design.md](../specs/2026-05-18-song-picker-itunes-search-design.md)

**Hearth conventions for this plan:** Per CLAUDE.md and memory feedback, this project skips formal unit tests — each task verifies via Docker dev server (`docker compose restart app` + manual browser check) rather than Jest/Vitest. The user has confirmed this approach.

---

## File Structure

**New files:**
- `src/lib/song.ts` — shared types, `parseStoredSong()` discriminator parser, `serializeItunesSong()`, `searchItunes()`, `highResArt()`, `appleMusicLink()`.
- `src/store/activeSong.ts` — zustand store enforcing one playing song at a time.
- `src/components/SongPicker.tsx` — search input + debounced iTunes results dropdown + URL short-circuit.

**Modified files:**
- `src/components/SongEmbed.tsx` — branch on `parseStoredSong()`: new iTunes renderer (album-art vinyl + native `<audio>` + 30s progress bar), existing URL/text branches untouched.
- `src/components/desk/LeftPage.tsx` — swap the "Add a Song" `<input>` for `<SongPicker>`.
- `src/components/desk/MobileJournalEntry.tsx` — same swap, mobile-tuned.
- `src/lib/scrapbook.ts` — add `'itunes'` to `SongItemData['provider']` union; update `makeSongItem()` and `parseSongProvider()` to detect the JSON discriminator.
- `src/components/scrapbook/items/SongItem.tsx` — swap "paste URL" input for `<SongPicker>`.
- `src/components/letters/compose/PostcardBack.tsx` — swap "add a song" input for `<SongPicker>`.

`src/components/letters/TuckedIn.tsx` receives the new render for free (it consumes `SongEmbed`).

---

## Task 1 — Shared `song` library

**Files:**
- Create: `src/lib/song.ts`

- [ ] **Step 1: Create `src/lib/song.ts` with types, parser, serializer, and search**

```ts
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
```

- [ ] **Step 2: Type-check the file**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: no errors. (If the container isn't running, `docker compose up -d` first.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/song.ts
git commit -m "feat(songs): add iTunes search + StoredSong parsing helpers"
```

---

## Task 2 — `useActiveSong` zustand store

**Files:**
- Create: `src/store/activeSong.ts`

- [ ] **Step 1: Create the store**

Match the existing stores' style (see `src/store/journal.ts`, `src/store/cursor.ts` for reference).

```ts
'use client'

import { create } from 'zustand'

interface ActiveSongState {
  activeId: string | null
  /** Mark a song as the currently-playing one. Any other SongEmbed instance listening will pause. */
  play: (id: string) => void
  /** Clear the active song (e.g., on pause / unmount of the playing one). */
  stop: () => void
}

export const useActiveSong = create<ActiveSongState>((set) => ({
  activeId: null,
  play: (id) => set({ activeId: id }),
  stop: () => set({ activeId: null }),
}))
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/store/activeSong.ts
git commit -m "feat(songs): add useActiveSong store for global single-playback"
```

---

## Task 3 — Extend `SongEmbed` with iTunes rendering branch

**Files:**
- Modify: `src/components/SongEmbed.tsx`

The existing `SongEmbed` renders a vinyl + iframe player for URLs. We add a third top-level branch: if `parseStoredSong(url).kind === 'itunes'`, render the new `ItunesPlayer` (album art at the vinyl's center, native `<audio>` playback, 30s progress bar, "Open in Apple Music" fallback link). URL and free-text branches stay exactly as today.

- [ ] **Step 1: Add imports + new `ItunesPlayer` sub-component at the top of `SongEmbed.tsx`**

After the existing imports in [src/components/SongEmbed.tsx](src/components/SongEmbed.tsx), add:

```ts
import { useEffect, useRef, useId } from 'react'
import { parseStoredSong, highResArt, appleMusicLink } from '@/lib/song'
import { useActiveSong } from '@/store/activeSong'
```

Then, **above** the existing `export default function SongEmbed(...)` (a good location is right after the `VinylRecord` helper), add this new component:

```tsx
function ItunesPlayer({
  id,
  title,
  artist,
  art,
  preview,
  theme,
  compact,
}: {
  id: string
  title: string
  artist: string
  art: string
  preview: string
  theme: Theme
  compact: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const instanceId = useId()
  const { activeId, play, stop } = useActiveSong()
  const isPlaying = activeId === instanceId
  const [progress, setProgress] = useState(0) // 0..1
  const [errored, setErrored] = useState(false)

  // Pause when another SongEmbed becomes active
  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
    }
  }, [isPlaying])

  // Pause on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause()
      if (activeId === instanceId) stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (errored) return
    if (isPlaying) {
      audioRef.current?.pause()
      stop()
    } else {
      audioRef.current?.play().catch(() => setErrored(true))
      play(instanceId)
    }
  }

  const onTimeUpdate = () => {
    const a = audioRef.current
    if (!a || !a.duration) return
    setProgress(a.currentTime / a.duration)
  }

  const onEnded = () => {
    setProgress(0)
    if (activeId === instanceId) stop()
  }

  const artUrl = highResArt(art, compact ? 200 : 300)
  const size = compact ? 'w-12 h-12' : 'w-16 h-16'
  const padding = compact ? 'p-3' : 'p-4'

  return (
    <motion.div
      className={`rounded-2xl overflow-hidden relative flex items-center ${padding}`}
      onClick={(e) => { e.stopPropagation(); handlePlay(e) }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        background: `linear-gradient(135deg, ${theme.glass.bg} 0%, ${theme.accent.warm}10 100%)`,
        border: `1px solid ${isPlaying ? theme.accent.warm + '40' : theme.glass.border}`,
        backdropFilter: 'blur(20px)',
        cursor: 'pointer',
      }}
      whileHover={!isPlaying ? { scale: 1.01 } : {}}
      whileTap={{ scale: 0.99 }}
    >
      <audio
        ref={audioRef}
        src={preview}
        preload="none"
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={() => setErrored(true)}
      />

      <div className="flex items-center gap-3 w-full">
        {/* Album art as vinyl center */}
        <motion.div
          className={`relative ${size} rounded-full flex-shrink-0 overflow-hidden`}
          style={{
            background: '#1a1a1a',
            boxShadow: `0 0 20px ${theme.accent.warm}40`,
          }}
          animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
          transition={isPlaying ? { duration: 3, repeat: Infinity, ease: 'linear' } : { duration: 0.5 }}
        >
          {artUrl ? (
            <img src={artUrl} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white text-lg">♫</div>
          )}
          {/* Center hole */}
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-black/80 -translate-x-1/2 -translate-y-1/2" />
        </motion.div>

        {/* Title + artist */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: theme.text.primary }}>
            {title || 'Untitled'}
          </p>
          {!compact && (
            <p className="text-xs truncate" style={{ color: theme.text.muted }}>
              {artist}
            </p>
          )}
          {!compact && !errored && (
            <div className="mt-2 h-[2px] rounded-full overflow-hidden" style={{ background: `${theme.text.muted}25` }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: theme.accent.warm, width: `${progress * 100}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          )}
          {errored && (
            <a
              href={appleMusicLink(id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs underline"
              style={{ color: theme.accent.warm }}
            >
              Open in Apple Music
            </a>
          )}
        </div>

        {/* Play/pause button */}
        {!errored && (
          <motion.div
            className={`flex-shrink-0 ${compact ? 'w-8 h-8' : 'w-10 h-10'} rounded-full flex items-center justify-center`}
            style={{
              background: isPlaying
                ? `${theme.accent.warm}30`
                : `linear-gradient(135deg, ${theme.accent.warm} 0%, ${theme.accent.secondary} 100%)`,
              color: isPlaying ? theme.accent.warm : '#fff',
              boxShadow: isPlaying ? 'none' : `0 4px 15px ${theme.accent.warm}40`,
            }}
            whileHover={{ scale: 1.1 }}
          >
            <span className={compact ? 'text-sm' : 'text-base'}>
              {isPlaying ? '■' : '▶'}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
```

(Note: `useState` is already imported in the file from `'react'`; verify and add if missing.)

- [ ] **Step 2: Add the iTunes branch inside the main `SongEmbed` function**

Find the existing `export default function SongEmbed(...)` body. Immediately after the `const embedInfo = useMemo(...)` line, **insert** this branch (it must run *before* the existing "non-URL text" / "URL without embed support" branches):

```tsx
  const stored = parseStoredSong(url)
  if (stored.kind === 'itunes') {
    return (
      <ItunesPlayer
        id={stored.id}
        title={stored.title}
        artist={stored.artist}
        art={stored.art}
        preview={stored.preview}
        theme={theme}
        compact={compact}
      />
    )
  }
```

The rest of `SongEmbed` (URL parsing, vinyl + iframe player, free-text card) is untouched. URL-shaped and free-text-shaped `url` props continue to render exactly as today.

- [ ] **Step 3: Type-check + restart container**

```bash
docker compose exec app npx tsc --noEmit
docker compose restart app
```

Expected: no type errors; container restarts cleanly.

- [ ] **Step 4: Manual smoke check (synthetic data)**

Open any existing journal entry that has a song (or `docker compose exec app npx prisma studio` and look at `JournalEntry.song` values). Confirm the old vinyl-iframe player still renders for URL-shaped values. The iTunes branch isn't reachable yet (no UI to create one) — that's fine; it'll be covered end-to-end after Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/SongEmbed.tsx
git commit -m "feat(songs): render iTunes-sourced songs with album-art vinyl + native audio"
```

---

## Task 4 — `SongPicker` component

**Files:**
- Create: `src/components/SongPicker.tsx`

This is the shared search-input + dropdown. It accepts a current `value` string (the same string format that goes into `JournalEntry.song`) and an `onChange(next: string | null)` callback. Typing fires a debounced iTunes search; URL-shaped input short-circuits and is stored verbatim; picking a result writes the serialized JSON.

- [ ] **Step 1: Create `src/components/SongPicker.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useThemeStore } from '@/store/theme'
import { searchItunes, serializeItunesSong, highResArt, type ItunesTrack } from '@/lib/song'
import { isMusicUrl } from '@/components/SongEmbed'

interface Props {
  /** Current stored string (URL, iTunes JSON, free text, or empty). */
  value: string
  /** Receives the next stored string, or null when cleared. */
  onChange: (next: string | null) => void
  placeholder?: string
  autoFocus?: boolean
}

const DEBOUNCE_MS = 350

export default function SongPicker({
  value,
  onChange,
  placeholder = 'Search a song or paste a link…',
  autoFocus = false,
}: Props) {
  const { theme } = useThemeStore()
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<ItunesTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Keep input synced if parent resets value externally
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Click-outside closes dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Debounced search — URL inputs skip search entirely
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setOpen(false)
      return
    }
    if (isMusicUrl(trimmed) || /^https?:\/\//i.test(trimmed)) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setOpen(true)
    const ctrl = new AbortController()
    const handle = window.setTimeout(async () => {
      try {
        const tracks = await searchItunes(trimmed, ctrl.signal)
        setResults(tracks)
        setHighlight(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      ctrl.abort()
      window.clearTimeout(handle)
    }
  }, [query])

  function pick(track: ItunesTrack) {
    onChange(serializeItunesSong(track))
    setOpen(false)
    setResults([])
    setQuery('') // parent will display via SongEmbed; clear local input
  }

  function commitRaw() {
    const trimmed = query.trim()
    if (!trimmed) {
      onChange(null)
      return
    }
    // URL or free text — store verbatim (same as today's behavior)
    onChange(trimmed)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitRaw()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pick(results[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => query.trim() && !isMusicUrl(query) && setOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{
          background: `${theme.accent.warm}10`,
          color: theme.text.primary,
          border: `1px solid ${theme.glass.border}`,
        }}
      />

      <AnimatePresence>
        {open && (loading || results.length > 0 || query.trim().length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 mt-1 z-50 rounded-lg overflow-hidden"
            style={{
              background: theme.glass.bg,
              border: `1px solid ${theme.glass.border}`,
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            {loading && results.length === 0 && (
              <div className="p-3 text-xs" style={{ color: theme.text.muted }}>Searching…</div>
            )}
            {!loading && results.length === 0 && query.trim() && (
              <div className="p-3 text-xs" style={{ color: theme.text.muted }}>
                No songs found — paste a link instead
              </div>
            )}
            {results.map((track, i) => (
              <button
                key={track.trackId}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(track) }}
                onMouseEnter={() => setHighlight(i)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                style={{
                  background: highlight === i ? `${theme.accent.warm}20` : 'transparent',
                }}
              >
                <img
                  src={highResArt(track.artworkUrl100, 100)}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" style={{ color: theme.text.primary }}>
                    {track.trackName}
                  </p>
                  <p className="text-xs truncate" style={{ color: theme.text.muted }}>
                    {track.artistName}
                  </p>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
docker compose exec app npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SongPicker.tsx
git commit -m "feat(songs): add SongPicker with iTunes search + URL paste fallback"
```

---

## Task 5 — Wire `SongPicker` into desktop journal entry

**Files:**
- Modify: `src/components/desk/LeftPage.tsx` (around lines 320–360 — the existing "Music Section" block)

The current music section uses a plain `<input>` driven by `songInput` + `handleSongChange`. We replace it with `<SongPicker>` while keeping the same state contract (a single string going to `currentEntry.song`).

- [ ] **Step 1: Add import**

Near the existing imports in `src/components/desk/LeftPage.tsx`:

```ts
import SongPicker from '@/components/SongPicker'
```

- [ ] **Step 2: Replace the input block in the Music Section**

Locate the JSX block starting near line 320 (look for the comment `{/* Music Section — fixed height to prevent textarea resize on song add */}`). Inside the `isEditingSong || !songInput` branch, **replace** the existing `<input ... value={songInput} onChange={...}>` with:

```tsx
<SongPicker
  value={songInput}
  onChange={(next) => {
    handleSongChange(next ?? '')
    if (next) setIsEditingSong(false)
  }}
  placeholder="Search a song or paste a link…"
/>
```

Keep the surrounding label / "Add a Song" header / close-button logic exactly as it is. The `<SongEmbed url={songInput} compact audioOnly />` line in the *non-editing* branch stays untouched — it now naturally renders iTunes picks via Task 3's new branch.

- [ ] **Step 3: Restart + verify in browser**

```bash
docker compose restart app
docker compose logs -f app
```

In a new terminal, open `http://localhost:3111`, sign in, open a fresh journal entry, click "Add a Song". Verify:
1. Type "blinding lights" → dropdown shows results with album art.
2. Click a result → SongEmbed shows the new album-art vinyl, press play → 30s preview plays.
3. Clear, then paste `https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b` → old vinyl-iframe player renders (unchanged).
4. Reload the page — the song persists (autosave round-trip works).
5. Switch themes (rivendell, sunset, rose) — sticker colors follow theme.

- [ ] **Step 4: Commit**

```bash
git add src/components/desk/LeftPage.tsx
git commit -m "feat(songs): wire SongPicker into desktop journal entry"
```

---

## Task 6 — Wire `SongPicker` into mobile journal entry

**Files:**
- Modify: `src/components/desk/MobileJournalEntry.tsx` (around lines 218–256 — the "add a song" section)

Same pattern as Task 5, scoped to mobile.

- [ ] **Step 1: Add import**

```ts
import SongPicker from '@/components/SongPicker'
```

- [ ] **Step 2: Replace the input block**

Find the JSX block starting around line 221 (look for `{isEditingSong || !songInput ? (`). Inside the editing branch, replace the existing `<input ... value={songInput} onChange={(e) => handleSongChange(e.target.value)}>` with:

```tsx
<SongPicker
  value={songInput}
  onChange={(next) => {
    handleSongChange(next ?? '')
    if (next) setIsEditingSong(false)
  }}
  placeholder="Search a song or paste a link…"
/>
```

Keep the `<SongEmbed url={songInput} compact audioOnly />` line (around line 256) untouched.

- [ ] **Step 3: Verify on mobile viewport**

```bash
docker compose restart app
```

Open Chrome DevTools → Toolbar → toggle device toolbar → iPhone 14 Pro. Visit `http://localhost:3111`, open a journal entry, repeat Task 5's manual checks (1–5) on mobile width. Specifically verify the dropdown doesn't overflow the viewport edge.

- [ ] **Step 4: Commit**

```bash
git add src/components/desk/MobileJournalEntry.tsx
git commit -m "feat(songs): wire SongPicker into mobile journal entry"
```

---

## Task 7 — Wire `SongPicker` into scrapbook + extend provider union

**Files:**
- Modify: `src/lib/scrapbook.ts` (around lines 70–75, 191, 221–247)
- Modify: `src/components/scrapbook/items/SongItem.tsx`

Scrapbook's `SongItemData` already carries a structured `{ url, title, provider }` triple. We add `'itunes'` to the provider union and teach `makeSongItem` + `parseSongProvider` + `deriveSongMeta` to detect the JSON discriminator. The SongItem UI then uses `SongPicker` instead of its raw URL input.

- [ ] **Step 1: Extend the provider union and helpers in `src/lib/scrapbook.ts`**

In the `SongItemData` interface (around line 70), change:

```ts
provider: 'spotify' | 'youtube' | 'apple' | 'soundcloud' | 'unknown'
```

to:

```ts
provider: 'spotify' | 'youtube' | 'apple' | 'soundcloud' | 'itunes' | 'unknown'
```

In `parseSongProvider` (around line 247), add a JSON-discriminator check at the top:

```ts
function parseSongProvider(url: string): SongItemData['provider'] {
  const trimmed = url.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed._h === 'itunes') return 'itunes'
    } catch {
      // fall through
    }
  }
  // ...existing URL pattern checks unchanged
  return /* existing logic */
}
```

(Preserve the existing host-pattern checks below the new block — do not delete them.)

In `deriveSongMeta` (around line 221), handle the iTunes case by reading the title from the JSON:

```ts
export function deriveSongMeta(url: string): { title: string; provider: SongItemData['provider'] } {
  const trimmed = url.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && parsed._h === 'itunes') {
        return { title: parsed.t || 'Song', provider: 'itunes' }
      }
    } catch {
      // fall through to existing URL-based meta extraction
    }
  }
  // ...keep existing implementation for URL-based titles
}
```

In `getSongEmbedUrl` (around line 225), return `null` for iTunes-provider items so the SongItem component knows to delegate to `<SongEmbed>` rather than building its own iframe URL:

```ts
export function getSongEmbedUrl(item: SongItemData): { src: string; height: number } | null {
  if (item.provider === 'itunes') return null
  // ...keep existing implementation
}
```

- [ ] **Step 2: Update `SongItem.tsx` to use `SongPicker` and delegate rendering for iTunes**

In `src/components/scrapbook/items/SongItem.tsx`, add the import:

```ts
import SongPicker from '@/components/SongPicker'
import SongEmbed from '@/components/SongEmbed'
```

Find the existing "paste a song URL…" input (line ~285) and replace it with:

```tsx
<SongPicker
  value={item.url}
  onChange={(next) => {
    if (!next) return
    const meta = deriveSongMeta(next)
    onChange({ ...item, url: next, title: meta.title, provider: meta.provider })
  }}
  placeholder="Search or paste a link…"
  autoFocus
/>
```

For the playing/display side, locate where the existing iframe is rendered (look for `getSongEmbedUrl(item)` usage). When `item.provider === 'itunes'`, render `<SongEmbed url={item.url} compact audioOnly />` instead of the iframe — the existing iframe path stays for the other providers.

- [ ] **Step 3: Restart + manual verify**

```bash
docker compose restart app
```

Open scrapbook in the app, drop a Song item on the canvas. Verify:
1. Search for a song via the picker → album-art sticker appears on the canvas.
2. Paste a YouTube URL into the picker → old iframe behavior still works.
3. Drag the sticker around → no playback interruption.
4. Reload the page → both kinds of songs persist correctly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/scrapbook.ts src/components/scrapbook/items/SongItem.tsx
git commit -m "feat(songs): wire SongPicker into scrapbook + add 'itunes' provider"
```

---

## Task 8 — Wire `SongPicker` into letter composer

**Files:**
- Modify: `src/components/letters/compose/PostcardBack.tsx` (around lines 72–256 — the song input block)

`TuckedIn.tsx` (the recipient-side render) consumes `SongEmbed` and so receives the new iTunes rendering for free — no changes needed there.

- [ ] **Step 1: Add import**

```ts
import SongPicker from '@/components/SongPicker'
```

- [ ] **Step 2: Replace the input block**

Find the existing input around line 238 (`<input ... value={songInput} onChange={(e) => handleSongChange(e.target.value)} ... />`). Replace it with:

```tsx
<SongPicker
  value={songInput}
  onChange={(next) => {
    handleSongChange(next ?? '')
    if (next) setIsEditingSong(false)
  }}
  placeholder="Search a song or paste a link…"
/>
```

The surrounding `<SongEmbed url={songInput} compact audioOnly />` (around line 256, non-editing branch) stays untouched.

- [ ] **Step 3: Restart + manual verify**

```bash
docker compose restart app
```

Compose a new letter (`/letters/new` or wherever letter compose is reachable). Add a song via the picker. Verify:
1. Picker UX matches Task 5's checks.
2. Save the letter, open it as the recipient (or via local preview) — `TuckedIn` renders the new iTunes sticker.
3. Paste a YouTube link → unchanged iframe player renders.

- [ ] **Step 4: Commit**

```bash
git add src/components/letters/compose/PostcardBack.tsx
git commit -m "feat(songs): wire SongPicker into letter composer"
```

---

## Task 9 — End-to-end QA + backward-compat sweep

**Files:** none (verification only)

- [ ] **Step 1: Backward compatibility check — existing journal entries**

```bash
docker compose exec app npx prisma studio
```

Browse `JournalEntry` rows. Pick a few entries with `song` values:
- Old YouTube URL → verify it still renders as the vinyl-iframe player on the desk.
- Old Spotify URL → same.
- Old free-text song (e.g., "Wonderwall") → verify the simple text card still renders.

No data should be visually broken.

- [ ] **Step 2: Cross-theme check**

For each of: `rivendell`, `rose-garden`, `sunset-harbour`, `moonlit`, `sage-meadow`:
1. Switch theme via the gear menu.
2. Open the journal entry with an iTunes song.
3. Verify the sticker's title/artist/border colors track the theme (no hardcoded cream/brown bleeding through).

- [ ] **Step 3: Single-playback enforcement**

Open a journal entry that has an iTunes song. In another tab, open a scrapbook view with a different iTunes song. Press play on the journal one, then press play on the scrapbook one. Verify the journal one **pauses automatically** when the scrapbook one starts.

- [ ] **Step 4: Audio error fallback**

In DevTools → Network panel, block requests to `audio-ssl.itunes.apple.com`. Press play on any iTunes song. Verify the sticker shows the "Open in Apple Music" link instead of breaking, and clicking the link opens the song's Apple Music page in a new tab.

- [ ] **Step 5: E2EE round-trip (master-key unlocked)**

Sign in with E2EE enabled and master key unlocked. Add an iTunes song to a journal entry. Reload the page. Verify:
- The song still renders correctly (round-trips through encrypt → decrypt → `parseStoredSong`).
- In Prisma Studio, the raw `song` column on the row is ciphertext, not the JSON blob (encryption is intact).

- [ ] **Step 6: Final commit (only if anything was fixed during QA)**

If QA surfaced any bugs and you fixed them, commit those fixes individually with descriptive messages. Otherwise, no commit needed for Task 9.

---

## Self-Review Notes (for the plan author)

- **Spec coverage:** All 9 items in the spec's "Implementation order" map to Tasks 1–9. The non-goals stay out of scope.
- **Type consistency:** `StoredSong` (verbose keys) is used in components; `ItunesStored` (short keys) is the on-disk shape. `parseStoredSong` is the only bridge. `serializeItunesSong` is the only producer.
- **No placeholders.** All steps include concrete code or commands.
- **Hearth fit:** Tasks verify via Docker dev server, not test runners, per the project's testing convention (`feedback_skip_tests`).
