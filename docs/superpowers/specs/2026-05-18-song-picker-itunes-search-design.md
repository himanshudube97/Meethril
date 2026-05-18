# Song Picker (iTunes search + URL paste)

**Status:** Design approved — ready for implementation plan
**Date:** 2026-05-18
**Surfaces affected:** Journal entries, scrapbook items, letters

## Goal

Replace Hearth's "paste a song URL" UX with an Instagram-style **search-and-pick** flow, while keeping URL paste as a fallback for full-track playback. A user typing "blinding lights" should see real results with album art and pick one in two taps, without leaving the app or hunting for a YouTube/Spotify link.

## Non-goals (explicitly deferred)

These add complexity for relatively small wins and can be added later without breaking the storage shape:

- **Clip selection.** Instagram lets you scrub a 15 s window; we use the full 30 s preview as-is.
- **Animated lyrics overlay.** Needs a separate provider (Musixmatch / LyricFind, both paid).
- **Live waveform visualization.** The existing `AudioVisualizer` bars are sufficient.
- **Saved library / recently picked songs.** Fresh search every time.
- **Full-track playback via MusicKit / Spotify Web Playback SDK.** Requires per-user OAuth + paid subscriptions. URL paste covers this case.

## User flow

1. User taps "Add a Song" (journal, scrapbook, or letter).
2. Single text input appears with placeholder *"Search or paste a link…"*.
3. As the user types, a small dropdown shows up to 8 iTunes results — each row is `[album art 40×40] [title / artist]`.
4. User picks one with click or keyboard (↑/↓/Enter). The dropdown collapses.
5. The song renders as a **vinyl-with-album-art sticker**: tap to play the 30 s preview, vinyl spins while playing, thin progress bar underneath.
6. If the user pasted a URL instead of typing, the dropdown stays hidden and the URL is stored as-is — today's iframe player renders unchanged.

## Architecture

### Catalog API: iTunes Search

`GET https://itunes.apple.com/search?term={query}&entity=song&limit=8&country=US`

Chosen over Spotify / Deezer / YouTube because it is the only option that combines:

- **No API key, no OAuth, no env vars.** Hearth already has many secrets to manage.
- **CORS-friendly.** Apple returns `Access-Control-Allow-Origin: *`, so the browser hits it directly with no Next.js proxy route.
- **Reliable 30 s MP3 previews on Apple's CDN.** Spotify silently dropped `preview_url` from most tracks in late 2024.
- **Album art at any size.** `artworkUrl100` (100×100) → swap to `600x600` in the URL string for hi-res.
- **Soft rate limit of ~20 req/min/IP.** A 350 ms debounce keeps us nowhere near that.
- **17-year track record** on the same endpoint (originally built for the iTunes affiliate program).

The gap vs Spotify is some indie / regional artists — covered by the URL paste fallback.

### Components

| Component | Status | Purpose |
|---|---|---|
| `SongPicker` (new) | New component | Smart text input with debounced iTunes search dropdown. Used by all three surfaces. |
| `SongEmbed` (existing) | Extended | Adds an "iTunes mode" rendering branch. URL-mode and free-text-mode unchanged. |
| `useActiveSong` (new) | New zustand store | One song plays at a time globally — starting a new one pauses any current `<audio>` element. |

### File-level integration points

| Surface | File | Change |
|---|---|---|
| Journal entry (desktop) | [src/components/desk/LeftPage.tsx](src/components/desk/LeftPage.tsx) (~line 320) | Replace text input in Music section with `<SongPicker>` |
| Journal entry (mobile) | [src/components/desk/MobileJournalEntry.tsx](src/components/desk/MobileJournalEntry.tsx) | Same swap, mobile-tuned width |
| Scrapbook canvas item | [src/components/scrapbook/items/SongItem.tsx](src/components/scrapbook/items/SongItem.tsx) | Open `SongPicker` when a Song item is dropped on canvas |
| Letter composer (postcard) | [src/components/letters/compose/PostcardBack.tsx](src/components/letters/compose/PostcardBack.tsx) | Embed `SongPicker` in composer |
| Letter recipient view | [src/components/letters/TuckedIn.tsx](src/components/letters/TuckedIn.tsx) | No picker (read-only) — uses extended `SongEmbed` |
| Display logic | [src/components/SongEmbed.tsx](src/components/SongEmbed.tsx) | Add `parseStoredSong()` helper + iTunes-mode renderer |

## Storage shape

**Decision: no schema migration. Reuse the existing `song` string field on every surface.**

`JournalEntry.song` (and the equivalent string on scrapbook `SongItem` data and letter song fields) today contains either a URL or free text. We extend the same field to also hold a tiny JSON blob when the song came from iTunes:

```json
{
  "_h": "itunes",
  "id": "1500416908",
  "t": "Blinding Lights",
  "a": "The Weeknd",
  "art": "https://is1-ssl.mzstatic.com/.../100x100bb.jpg",
  "p": "https://audio-ssl.itunes.apple.com/.../sample.mp3"
}
```

- `_h: "itunes"` is the **discriminator** — the only field SongEmbed checks before branching.
- Short keys (`t`, `a`, `art`, `p`) keep the encrypted payload ≈ 250 bytes per song.
- `id` lets us rebuild `https://music.apple.com/song/{id}` for an "Open in Apple Music" link without storing a second URL.

### Why one field, not new DB columns

1. **Zero migration.** Hearth's additive-only rule means we couldn't drop the old `song` field anyway; adding 5 new columns × 3 surfaces would be churn for no benefit.
2. **E2EE is free.** Songs on journal entries, scrapbook items, and letters are stored inside Tier 1 ciphertext. The server never sees `song` content; whether the plaintext is a URL or a JSON blob is invisible to the server. No changes to `lib/encryption.ts`.
3. **Three surfaces, one rule.** Same parsing logic applies to journal entries, scrapbook items, and letters.

### Backward compatibility (no data loss, no rewrites)

`SongEmbed` parses the incoming string with this branch:

```
1. Try JSON.parse(song) — does parsed object have `_h === "itunes"`?
   → YES: render iTunes sticker (new path)
2. Else, does it match isMusicUrl()? → render today's vinyl + iframe player (unchanged)
3. Else, plain text → render today's "♫ {text}" card (unchanged)
```

Every existing entry keeps working with zero changes. Old YouTube/Spotify/Apple URLs render exactly as today.

### What we deliberately don't store

- **Album name, genre, duration** — not needed for the sticker.
- **Apple Music affiliate links** — rebuildable from `id`.
- **Cached album art** — `art` is a stable Apple CDN URL; we don't pipe it through Hearth's photo storage adapter. Trade-off: if Apple ever takes the image down (extremely rare for catalog tracks), the sticker falls back to a generic vinyl.

## Display & UX

### `SongPicker` (the search side)

- Single input field, theme-aware, same visual footprint as today's "Add a Song" input.
- Debounce: **350 ms** between last keystroke and fetch.
- Request: `fetch('https://itunes.apple.com/search?term=…&entity=song&limit=8&country=US')` directly from the browser. No Next.js route.
- **URL detection short-circuit:** if the input matches `isMusicUrl()` from [SongEmbed.tsx:662](src/components/SongEmbed.tsx#L662) or starts with `http`, the dropdown stays hidden and Enter stores the raw URL.
- **Keyboard:** ↑/↓ navigate results, Enter selects, Esc closes.
- **States:**
  - Typing: skeleton rows in dropdown.
  - No results: `"No songs found — paste a link instead"`.
  - Network failure: dropdown silently closes; URL paste still works. No toast.

### iTunes sticker rendering (the display side)

Evolves the existing vinyl player rather than replacing it. **Key change:** the album art replaces the generic colored circle at the vinyl's center.

```
┌──────────────────────────────────────────┐
│   ╭───╮                                  │
│   │art│   Blinding Lights         ▶      │
│   │   │   The Weeknd                     │
│   ╰───╯   ▬▬▬▬▬▬▬▬▬▬▬                    │
└──────────────────────────────────────────┘
   ↑ spins when playing
```

- **Idle:** album art as vinyl center; title in theme `text.primary`; artist in `text.muted`; play button on the right.
- **Playing:** vinyl + album art rotate together (`linear` 3 s, infinite, same as today's `VinylRecord`); 30 s progress bar fills underneath; play button becomes pause.
- **Compact mode** (journal entry's fixed-height music slot): smaller vinyl, title only, no progress bar.
- **Scrapbook:** slight rotation + shadow, matching existing scrapbook sticker aesthetic.

### Playback

- Native `<audio src={p}>` element — no iframe.
- Tap to play (no autoplay; matches Hearth conventions).
- **One song globally:** zustand `useActiveSong` store holds `{ activeId, pauseAll }`. Starting a new song calls `pauseAll()` first.
- Unmount → `audio.pause()`.
- `onError` (rare — `previewUrl` 404) → falls back to static sticker (album art + title + artist + "Open in Apple Music" link from `id`).

## Failure modes

| Failure | Behavior |
|---|---|
| iTunes Search API down | Dropdown silently closes; URL paste fallback fully functional. |
| `previewUrl` 404 at play time | `<audio>` `onError` → static sticker with "Open in Apple Music" link. |
| User picks a song while offline | Search returns nothing; empty-state hint appears; URL paste still works. |
| Apple deprecates the search endpoint (very unlikely) | URL paste still works; existing iTunes-shape entries fall through to the error-state sticker. No broken entries. |
| User pastes raw text shaped like JSON (extremely rare) | JSON parse may succeed but discriminator check (`_h === "itunes"`) fails → falls through to "free text" rendering. Safe. |

## Implementation order (informs the plan)

1. **`SongPicker` component** — search input, debounced fetch, dropdown UI, keyboard navigation, URL short-circuit.
2. **`SongEmbed` iTunes branch** — `parseStoredSong()` helper, new rendering path, audio playback with `<audio>`, error fallback.
3. **`useActiveSong` zustand store** — single-playback enforcement.
4. **Journal entry wiring** — swap text input on `LeftPage` and `MobileJournalEntry`.
5. **Scrapbook wiring** — swap input on `SongItem`.
6. **Letters wiring** — swap input on `PostcardBack`; `TuckedIn` receives the new render for free via shared `SongEmbed`.
7. **Manual QA pass** — old URL entries still render; new iTunes entries render correctly across themes; E2EE encrypt/decrypt round-trip works for the JSON-string `song` field.
