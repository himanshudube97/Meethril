// Client-side Sentry init. Next.js loads this automatically in the browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  // No DSN configured (e.g. local dev) → SDK stays inert, sends nothing.
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,

  // Never attach IP / cookies as identifying PII.
  sendDefaultPii: false,

  // IMPORTANT: no Session Replay. Replay would record the on-screen DOM —
  // i.e. the user's decrypted journal text, letters and photos — which
  // directly violates Hearth's E2EE privacy promise. Do not add
  // Sentry.replayIntegration() here.
  integrations: [],

  // Performance tracing: full sample in dev, light sample in prod.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Belt-and-suspenders scrub of any request data attached to client events.
  beforeSend: scrubEvent,

  debug: false,
});

// Instruments App Router client-side navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
