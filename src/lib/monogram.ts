// src/lib/monogram.ts
// Render-time single-letter identity for a stranger / self display name.
// "Radiant Lantern" -> "R", "  gentle wolf" -> "G", "" -> "·".
// Stable per stored name, so it stays constant across a correspondence.
export function monogram(name: string | null | undefined): string {
  const ch = (name ?? '').trim().charAt(0)
  return ch ? ch.toUpperCase() : '·'
}
