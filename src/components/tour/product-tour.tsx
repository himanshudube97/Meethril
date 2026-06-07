'use client'

/**
 * Product walkthrough (driver.js). NEW, self-contained feature.
 *
 * - Renders a single floating "Take a tour" button + a first-visit welcome card.
 * - Drives a step-by-step tour that auto-navigates between pages and switches
 *   the Letters subtab so each part of the app is on screen as it's described.
 * - Theme-aware: the spotlight accent + buttons + progress dots track the active
 *   Hearth theme; the popover itself is a warm parchment card so copy stays
 *   legible on every theme (light or dark) while the scene dims behind it.
 *
 * No existing UI is modified — every selector targets a `data-tour="…"` hook
 * that already lives in Navigation / LettersNav.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'
import { useThemeStore } from '@/store/theme'
import { useAuthStore } from '@/store/auth'
import { useE2EEStore } from '@/store/e2ee'
import { useTourStore } from '@/store/tour'
import { useLayoutMode } from '@/hooks/useMediaQuery'
import { tourSteps, type TourStep } from './tour-steps'

// Pages where the tour must never appear (unauthenticated / full-bleed flows).
const HIDDEN_EXACT = ['/', '/login', '/pricing', '/privacy', '/terms']
const HIDDEN_PREFIXES = ['/onboarding', '/letter/']
const isHiddenPath = (pathname: string) =>
  HIDDEN_EXACT.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))

const SEEN_KEY = 'meethril_tour_seen'

/** Resolve when `selector` is in the DOM, or after `timeout` ms (el | null). */
function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) return resolve(existing)
    const start = Date.now()
    const tick = () => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      if (Date.now() - start > timeout) return resolve(null)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function galleryHtml(step: TourStep): string {
  if (!step.gallery?.length) return ''
  const cards = step.gallery
    .map(
      (g) =>
        `<figure class="meethril-tour-shot">
           <img src="${g.src}" alt="${g.label} memory scene" loading="lazy" />
           <figcaption>${g.label}</figcaption>
         </figure>`
    )
    .join('')
  return `<div class="meethril-tour-gallery">${cards}</div>`
}

function buildDescription(step: TourStep): string {
  return `<div>${step.content}</div>${galleryHtml(step)}`
}

export function ProductTour() {
  const router = useRouter()
  const pathname = usePathname()
  const theme = useThemeStore((s) => s.theme)
  const user = useAuthStore((s) => s.user)
  const startNonce = useTourStore((s) => s.startNonce)
  // Hold the tour until the journal is actually reachable — never let it cover a
  // blocking E2EE modal (Unlock / Setup / Recovery). Once the store has
  // initialized and no such modal is open, the journal is on screen and the
  // walkthrough can open.
  const e2eeInitialized = useE2EEStore((s) => s.initialized)
  const showUnlockModal = useE2EEStore((s) => s.showUnlockModal)
  const showSetupModal = useE2EEStore((s) => s.showSetupModal)
  const showRecoveryModal = useE2EEStore((s) => s.showRecoveryModal)
  const journalReady =
    e2eeInitialized && !showUnlockModal && !showSetupModal && !showRecoveryModal
  const layoutMode = useLayoutMode()
  const isMobile = layoutMode === 'mobile'
  const hidden = !user || !journalReady || isHiddenPath(pathname)

  const driverRef = useRef<Driver | null>(null)
  const stepRef = useRef(0)
  const activeRef = useRef(false)
  const renderStepRef = useRef<(index: number) => void>(() => {})
  // Ensures the first-visit card is only ever auto-shown once per session, so a
  // route change mid-tour can't re-trigger it.
  const autoWelcomeCheckedRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  // Brief "the tour lives in Settings" nudge after a first-timer taps Maybe later.
  const [showHint, setShowHint] = useState(false)

  // First-visit welcome card (desktop/tablet only — the Letters subtab steps
  // rely on the desktop letters nav). Gated by localStorage so it shows once.
  useEffect(() => {
    if (hidden || isRunning || autoWelcomeCheckedRef.current) return
    autoWelcomeCheckedRef.current = true
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage post-mount to avoid a hydration mismatch
      if (localStorage.getItem(SEEN_KEY) !== '1') setShowWelcome(true)
    } catch {
      /* localStorage may be unavailable */
    }
  }, [hidden, isRunning])

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const cleanup = useCallback(() => {
    activeRef.current = false
    setIsRunning(false)
    if (driverRef.current) {
      driverRef.current.destroy()
      driverRef.current = null
    }
  }, [])

  const popoverFor = useCallback(
    (index: number) => {
      const step = tourSteps[index]
      const last = index === tourSteps.length - 1
      return {
        title: `${step.icon} ${step.title}`,
        description: buildDescription(step),
        side: step.side ?? 'bottom',
        align: step.align ?? 'center',
        showButtons: (index === 0
          ? ['next', 'close']
          : ['previous', 'next', 'close']) as ('next' | 'previous' | 'close')[],
        nextBtnText: last ? 'Begin ✓' : 'Next →',
        prevBtnText: '← Back',
        showProgress: true,
        progressText: `${index + 1} of ${tourSteps.length}`,
        onNextClick: () => {
          if (stepRef.current >= tourSteps.length - 1) {
            markSeen()
            cleanup()
          } else {
            renderStepRef.current(stepRef.current + 1)
          }
        },
        onPrevClick: () => renderStepRef.current(stepRef.current - 1),
        onCloseClick: () => {
          markSeen()
          cleanup()
        },
      }
    },
    [cleanup, markSeen]
  )

  const renderStep = useCallback(
    async (index: number) => {
      if (!activeRef.current) return
      if (index < 0 || index >= tourSteps.length) {
        markSeen()
        cleanup()
        return
      }
      stepRef.current = index
      const step = tourSteps[index]
      const d = driverRef.current
      if (!d) return

      // Navigate if this step lives on another page.
      if (step.route) {
        const here = window.location.pathname
        if (step.route !== here) {
          router.push(step.route)
          await sleep(120)
        }
      }

      // Switch a Letters subtab (local state) by clicking its button.
      if (step.clickSelector) {
        const btn = await waitForElement(step.clickSelector)
        if (!activeRef.current) return
        ;(btn as HTMLElement | null)?.click()
        await sleep(220)
      }

      // Centered popover (no anchor) — the welcome step.
      if (!step.selector) {
        d.highlight({ popover: popoverFor(index) })
        return
      }

      await waitForElement(step.selector)
      if (!activeRef.current) return
      driverRef.current?.highlight({
        element: step.selector,
        popover: popoverFor(index),
      })
    },
    [router, cleanup, markSeen, popoverFor]
  )

  useEffect(() => {
    renderStepRef.current = (index: number) => void renderStep(index)
  }, [renderStep])

  const startTour = useCallback(
    (startIndex = 0) => {
      if (activeRef.current) return
      markSeen()
      setShowWelcome(false)
      activeRef.current = true
      setIsRunning(true)
      driverRef.current = driver({
        popoverClass: 'meethril-tour',
        overlayColor: '#1c1410',
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 999,
        allowClose: true,
        disableActiveInteraction: true,
        onDestroyed: () => {
          activeRef.current = false
          setIsRunning(false)
        },
      })
      void renderStep(startIndex)
    },
    [renderStep, markSeen]
  )

  useEffect(() => cleanup, [cleanup])

  // Launch when something outside (the Desk Settings "Take a tour" entry) bumps
  // the tour store's nonce. The ref skips the initial mount value.
  const startNonceSeenRef = useRef(startNonce)
  useEffect(() => {
    if (startNonce !== startNonceSeenRef.current) {
      startNonceSeenRef.current = startNonce
      startTour(0)
    }
  }, [startNonce, startTour])

  // Re-pin the current step's popover after a route settles, in case the
  // navigation remounted the anchor (skip the centered welcome step).
  useEffect(() => {
    if (!activeRef.current) return
    const step = tourSteps[stepRef.current]
    if (step?.selector) void renderStep(stepRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Theme accent consumed by tour.css. Set on :root so it also reaches the
  // driver popover, which is portalled to <body> outside this component's tree.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--tour-accent', theme.accent.primary)
    root.style.setProperty('--tour-accent-soft', `${theme.accent.primary}22`)
  }, [theme.accent.primary])

  // Don't offer the tour on mobile (Letters subtab steps need the desktop nav),
  // on pre-auth / full-bleed pages, or while the journal is still locked.
  if (isMobile || hidden) return null

  // The only chrome this component renders is the first-visit welcome card and
  // the brief "it's in Settings" nudge. The replayable entry point lives in
  // Desk Settings ("Take a tour"), which calls useTourStore().requestStart().
  return (
    <>
      {showWelcome && !isRunning && (
        <WelcomeCard
          onStart={() => startTour(1)}
          onSkip={() => {
            markSeen()
            setShowWelcome(false)
            setShowHint(true)
          }}
        />
      )}
      {showHint && <SettingsHint onDone={() => setShowHint(false)} />}
    </>
  )
}

/**
 * Tiny auto-dismissing nudge shown after a first-timer declines the welcome,
 * pointing them to the replayable entry in Desk Settings.
 */
function SettingsHint({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 7000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="meethril-tour-hint" role="status">
      No rush — the tour lives in <strong>Settings&nbsp;⚙</strong> whenever you&rsquo;re
      ready.
    </div>
  )
}

function WelcomeCard({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="meethril-tour-welcome-scrim" role="dialog" aria-modal="true">
      <div className="meethril-tour-welcome-card">
        <div className="meethril-tour-welcome-mark" aria-hidden>
          🕯️
        </div>
        <h2>Welcome to Meethril</h2>
        <p>
          A quiet corner of the internet that&apos;s entirely yours. Take a one-minute
          tour and I&apos;ll show you where everything lives.
        </p>
        <div className="meethril-tour-welcome-actions">
          <button type="button" className="meethril-tour-btn-ghost" onClick={onSkip}>
            Maybe later
          </button>
          <button type="button" className="meethril-tour-btn-solid" onClick={onStart}>
            Show me around →
          </button>
        </div>
      </div>
    </div>
  )
}
