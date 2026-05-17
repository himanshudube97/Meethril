import { describe, it, expect } from 'vitest'
import { findLargestFittingPrefix } from '@/lib/text-fit'

// A reusable monotonic predicate: "this prefix fits if it's at most `limit`
// characters long." Stands in for the real-world predicates
// (textarea.scrollHeight <= clientHeight, editor.offsetHeight <= MAX_HEIGHT),
// which jsdom can't compute but which are also monotonic in text length.
const fitsIfLE = (limit: number) => (s: string) => s.length <= limit

describe('findLargestFittingPrefix', () => {
  it('returns full length when everything fits', () => {
    expect(findLargestFittingPrefix('hello', fitsIfLE(100))).toBe(5)
  })

  it('returns the boundary when text overflows', () => {
    expect(findLargestFittingPrefix('hello world', fitsIfLE(7))).toBe(7)
  })

  it('returns 0 when nothing fits and no floor', () => {
    expect(findLargestFittingPrefix('abc', fitsIfLE(0))).toBe(0)
  })

  it('returns 0 for empty text', () => {
    expect(findLargestFittingPrefix('', fitsIfLE(10))).toBe(0)
  })

  it('respects the floor — never returns below it', () => {
    // floor of 3 forces the result to be at least 3, even if the predicate
    // would have settled lower. This is the "don't delete existing content"
    // guarantee that the journal right page relies on.
    expect(findLargestFittingPrefix('abcdef', fitsIfLE(2), 3)).toBe(3)
  })

  it('returns floor when floor == text.length', () => {
    expect(findLargestFittingPrefix('abc', fitsIfLE(0), 3)).toBe(3)
  })

  it('returns text.length when floor exceeds text.length', () => {
    expect(findLargestFittingPrefix('ab', fitsIfLE(0), 5)).toBe(2)
  })

  it('binary-searches a large input to the exact boundary', () => {
    const text = 'x'.repeat(5000)
    expect(findLargestFittingPrefix(text, fitsIfLE(813))).toBe(813)
  })

  it('whole-text fit short-circuits — no binary search', () => {
    let calls = 0
    const fits = (s: string) => { calls++; return s.length < 1_000_000 }
    expect(findLargestFittingPrefix('hello', fits)).toBe(5)
    // Only the initial whole-text check should run; no loop iterations.
    expect(calls).toBe(1)
  })

  it('preserves existing content when a paste pushes off the bottom', () => {
    // Real-world shape: user had a short note that fit, then pasted a wall of
    // text. The first chars of the new text must include all of the original.
    const existing = 'Dear journal,'
    const pasted = 'X'.repeat(5000)
    const newText = existing + pasted
    const fits = fitsIfLE(800)
    const result = findLargestFittingPrefix(newText, fits, existing.length)
    expect(result).toBe(800)
    expect(newText.slice(0, result).startsWith(existing)).toBe(true)
  })

  it('does not loop forever when fits flips at the boundary', () => {
    // A predicate with a single sharp boundary. The loop must terminate
    // regardless of which side of the boundary lo/hi land on first.
    const fits = (s: string) => s.length <= 42
    expect(findLargestFittingPrefix('y'.repeat(100), fits)).toBe(42)
    expect(findLargestFittingPrefix('y'.repeat(43), fits)).toBe(42)
    expect(findLargestFittingPrefix('y'.repeat(42), fits)).toBe(42)
    expect(findLargestFittingPrefix('y'.repeat(41), fits)).toBe(41)
  })
})
