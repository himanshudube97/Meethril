'use client'

import { useCallback, useEffect, useState } from 'react'

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

function getFsElement(): Element | null {
  const d = document as FsDocument
  return document.fullscreenElement || d.webkitFullscreenElement || null
}

// Native browser/OS fullscreen (macOS green button, ⌘+Ctrl+F, Chrome's
// kebab-menu → fullscreen, F11) does NOT set document.fullscreenElement.
// We fall back to two signals:
//   1. The `display-mode: fullscreen` media query — Chrome flips this for
//      its own fullscreen modes on every platform.
//   2. A size heuristic with a tolerance — covers cases where the media
//      query doesn't match (some Safari builds, edge cases). The tolerance
//      handles tiny chrome bleed like the always-on notch area or a 1px
//      window-resize rounding gap.
function isNativeFullscreen(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  const TOL = 4
  return (
    Math.abs(window.innerHeight - window.screen.height) <= TOL &&
    Math.abs(window.innerWidth - window.screen.width) <= TOL
  )
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  // iOS Safari has no Fullscreen API for the document. Detect support so the
  // affordance can hide cleanly instead of rendering a button that no-ops.
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    const el = document.documentElement as FsElement
    const has = typeof el.requestFullscreen === 'function'
      || typeof el.webkitRequestFullscreen === 'function'
    setSupported(has)
    if (!has) return

    const sync = () => setIsFullscreen(!!getFsElement() || isNativeFullscreen())
    sync()
    const mql = window.matchMedia('(display-mode: fullscreen)')
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    window.addEventListener('resize', sync)
    mql.addEventListener('change', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
      window.removeEventListener('resize', sync)
      mql.removeEventListener('change', sync)
    }
  }, [])

  const toggle = useCallback(async () => {
    const el = document.documentElement as FsElement
    const d = document as FsDocument
    try {
      if (getFsElement()) {
        if (typeof document.exitFullscreen === 'function') await document.exitFullscreen()
        else if (typeof d.webkitExitFullscreen === 'function') await d.webkitExitFullscreen()
      } else if (isNativeFullscreen()) {
        // OS-level fullscreen — JS can't toggle it. No-op so clicking
        // doesn't stack a JS fullscreen layer on top of the native one.
        return
      } else {
        if (typeof el.requestFullscreen === 'function') await el.requestFullscreen()
        else if (typeof el.webkitRequestFullscreen === 'function') await el.webkitRequestFullscreen()
      }
    } catch {
      // User-cancelled, or browser refused. Nothing to recover from.
    }
  }, [])

  return { isFullscreen, supported, toggle }
}
