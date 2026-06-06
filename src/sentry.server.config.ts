// Server-side (Node runtime) Sentry init. Imported by src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  // No DSN configured (e.g. local dev) → SDK stays inert, sends nothing.
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,

  // Never attach IP / cookies / headers as identifying PII.
  sendDefaultPii: false,

  // Performance tracing: full sample in dev, light sample in prod.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Strip request bodies / cookies / auth from every event.
  beforeSend: scrubEvent,

  // Quieter logs unless debugging the SDK itself.
  debug: false,
});
