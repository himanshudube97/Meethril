'use client'

import { useEffect, useState } from 'react'

/**
 * True when the current device is a phone or tablet (a "handheld"), as opposed
 * to a laptop/desktop. Used to gate the app to desktop-only while the mobile
 * experience is paused (see DesktopOnlySplash / LayoutContent).
 *
 * Deliberately NOT width-based: many real laptops are < 1400px wide (e.g.
 * 1366×768) and a resized desktop browser window is still a desktop. We detect
 * the *device class* instead, via three signals:
 *
 *  1. User-agent tokens for known phones/tablets.
 *  2. iPadOS-pretending-to-be-macOS: modern iPads report a "Macintosh" UA, so
 *     `Macintosh + maxTouchPoints > 1` is the reliable iPad tell.
 *  3. A coarse-only pointer: the primary AND only pointer is touch (no mouse/
 *     trackpad). Touch *laptops* also expose a fine pointer, so they read as
 *     desktop — correct, they are.
 *
 * Returns false during SSR and the first client paint (desktop assumption) so
 * the desktop app never flashes the splash; the real value resolves in an
 * effect on mount. LayoutContent only renders after its own `mounted` guard,
 * so in practice the value is settled before anything user-facing shows.
 */
export function useIsHandheld(): boolean {
  const [handheld, setHandheld] = useState(false)

  useEffect(() => {
    const detect = () => {
      if (typeof navigator === 'undefined') return
      const ua = navigator.userAgent || ''
      const uaHandheld =
        /Android|iPhone|iPod|iPad|Mobile|Tablet|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile|Windows Phone/i.test(ua)
      const ipadAsMac = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1
      const coarseOnly =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches &&
        !window.matchMedia('(any-pointer: fine)').matches
      setHandheld(uaHandheld || ipadAsMac || coarseOnly)
    }

    detect()
    // Re-check on resize/orientation so devtools device-emulation and rotation
    // are reflected. Device class itself doesn't change on rotation, but this
    // keeps the value honest when the environment changes underneath us.
    window.addEventListener('resize', detect)
    return () => window.removeEventListener('resize', detect)
  }, [])

  return handheld
}
