/**
 * Guided product walkthrough steps (driver.js).
 *
 * NEW, self-contained file. Does NOT modify any existing UI — every selector
 * targets a `data-tour="…"` hook that already lives in the nav / letters nav.
 *
 * Order follows the menu, left to right:
 *   Welcome → Journal (Write) → Scrapbook → Letters (intro → letters → sent →
 *   to a stranger) → Memory (with a peek at what it looks like unlocked).
 *
 * Warm, plain-language copy — this is the first thing a new soul reads.
 */

export interface TourGalleryItem {
  /** Path under /public, e.g. '/tour/memory-sage.png'. */
  src: string
  /** Caption shown under the image. */
  label: string
}

export interface TourStep {
  /**
   * Route to push before showing this step (skipped if already there). Omit for
   * steps that only switch a tab on the page they're already on.
   */
  route?: string
  /** CSS selector for the element to spotlight. Omit for a centered popover. */
  selector?: string
  /**
   * A button to click before spotlighting (used to switch the Letters subtab,
   * which is local state, not a route). Clicked once the element is in the DOM.
   */
  clickSelector?: string
  /** Popover placement relative to the element. */
  side?: 'top' | 'bottom' | 'left' | 'right' | 'over'
  align?: 'start' | 'center' | 'end'
  icon: string
  title: string
  content: string
  /** Optional image gallery rendered inside the popover (Memory preview). */
  gallery?: TourGalleryItem[]
}

export const tourSteps: TourStep[] = [
  {
    icon: '🕯️',
    title: 'Welcome to Meethril',
    content:
      "A quiet corner of the internet that's entirely yours. Let me show you around — it only takes a moment. Press Next when you're ready.",
    align: 'center',
  },
  {
    route: '/write',
    selector: '[data-tour="nav-write"]',
    side: 'bottom',
    align: 'center',
    icon: '✎',
    title: 'Your Journal',
    content:
      'This is where you write. Each day opens like a page in a book — <b>swipe or flip</b> to turn between days. Add a photo, a song, even a little doodle. It saves itself as you write — <b>no save button to look for</b>. Everything here is encrypted, so only you can ever read it.',
  },
  {
    route: '/scrapbook',
    selector: '[data-tour="nav-scrapbook"]',
    side: 'bottom',
    align: 'center',
    icon: '✦',
    title: 'Your Scrapbook',
    content:
      'A free canvas for the bits that don\'t fit in words — photos, doodles, little keepsakes. <b>Click a scrapbook to open it</b> and arrange things however feels right. It saves on its own as you go — nothing to press.',
  },
  {
    route: '/letters',
    selector: '[data-tour="nav-letters"]',
    side: 'bottom',
    align: 'center',
    icon: '✉',
    title: 'Letters',
    content:
      'Write letters that arrive later — to your future self, or to someone you love. Drafts save themselves as you write, so you can always step away and finish later. There are three kinds; let me show you each.',
  },
  {
    clickSelector: '[data-tour="letters-inbox"]',
    selector: '[data-tour="letters-inbox"]',
    side: 'bottom',
    align: 'center',
    icon: '📬',
    title: 'Letters',
    content:
      'Sealed letters land here and stay closed until the day they\'re meant to be opened. A little gift from past-you, waiting.',
  },
  {
    clickSelector: '[data-tour="letters-sent"]',
    selector: '[data-tour="letters-sent"]',
    side: 'bottom',
    align: 'center',
    icon: '🕊️',
    title: 'Sent',
    content:
      'The letters you\'ve sent on their way — to friends, or to your future self. Watch them travel until they\'re delivered.',
  },
  {
    clickSelector: '[data-tour="letters-lights"]',
    selector: '[data-tour="letters-lights"]',
    side: 'bottom',
    align: 'center',
    icon: '🏮',
    title: 'To a Stranger',
    content:
      'Send a kind, anonymous note out into the world — and receive one back. A small light passed between strangers.',
  },
  {
    route: '/memory',
    selector: '[data-tour="nav-memory"]',
    side: 'bottom',
    align: 'center',
    icon: '★',
    title: 'Memory',
    content:
      'Once you\'ve written enough, this opens into a living scene of your past entries — drifting back to you, one memory at a time. Here\'s a glimpse of what waits.',
    gallery: [
      { src: '/tour/memory-sage.png', label: 'Sage' },
      { src: '/tour/memory-rivendell.png', label: 'Rivendell' },
    ],
  },
]
